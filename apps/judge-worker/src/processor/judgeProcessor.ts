import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { UnrecoverableError } from 'bullmq';
import Redis from 'ioredis';
import pino from 'pino';
import {
  REDIS_KEYS,
  SubmissionEvent,
  SubmissionJobData,
  SubmissionStatus,
  SupportedLanguage,
  Verdict,
} from '@judge/shared';
import { db } from '../db/index.js';
import {
  problems,
  submissions,
  testCases,
  type ProblemRow,
  type SubmissionRow,
  type TestCaseRow,
} from '../db/schema.js';
import { workerStorage } from '../storage/minio.js';
import { Executor, executor as defaultExecutor, TestCasePayload } from '../executor/executor.js';
import { VerdictHandler, verdictHandler as defaultVerdictHandler } from '../verdicts/handler.js';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const logger = pino({ level: process.env.LOG_LEVEL || 'info', base: { service: 'judge-worker' } });

export interface JudgeRepository {
  getSubmissionById(id: string): Promise<SubmissionRow | null>;
  claimSubmissionRunning(id: string): Promise<SubmissionRow | null>;
  getProblemById(id: string): Promise<ProblemRow | null>;
  getTestCasesByProblemId(problemId: string): Promise<TestCaseRow[]>;
  saveFinalVerdict(params: {
    id: string;
    verdict: Verdict;
    executionTimeMs: number;
    memoryUsedKb: number;
    failedTestIndex?: number;
  }): Promise<boolean>;
}

export interface StorageReader {
  getObject(key: string): Promise<string | null>;
}

export interface ProcessSubmissionResult {
  submissionId: string;
  skipped: boolean;
  verdict?: Verdict;
  failedTestIndex?: number;
  executionTimeMs?: number;
  memoryUsedKb?: number;
}

export class DrizzleJudgeRepository implements JudgeRepository {
  async getSubmissionById(id: string): Promise<SubmissionRow | null> {
    const [row] = await db.select().from(submissions).where(eq(submissions.id, id)).limit(1);
    return row ?? null;
  }

  async claimSubmissionRunning(id: string): Promise<SubmissionRow | null> {
    const [updated] = await db
      .update(submissions)
      .set({
        status: SubmissionStatus.RUNNING,
        retryCount: sql`${submissions.retryCount} + 1`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(submissions.id, id),
          inArray(submissions.status, [SubmissionStatus.QUEUED, SubmissionStatus.RUNNING])
        )
      )
      .returning();
    return updated ?? null;
  }

  async getProblemById(id: string): Promise<ProblemRow | null> {
    const [row] = await db.select().from(problems).where(eq(problems.id, id)).limit(1);
    return row ?? null;
  }

  async getTestCasesByProblemId(problemId: string): Promise<TestCaseRow[]> {
    return db
      .select()
      .from(testCases)
      .where(eq(testCases.problemId, problemId))
      .orderBy(asc(testCases.index));
  }

  async saveFinalVerdict(params: {
    id: string;
    verdict: Verdict;
    executionTimeMs: number;
    memoryUsedKb: number;
    failedTestIndex?: number;
  }): Promise<boolean> {
    const updatedRows = await db
      .update(submissions)
      .set({
        status: SubmissionStatus.COMPLETED,
        verdict: params.verdict,
        executionTimeMs: params.executionTimeMs,
        memoryUsedKb: params.memoryUsedKb,
        failedTestIndex: params.failedTestIndex ?? null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(submissions.id, params.id),
          inArray(submissions.status, [SubmissionStatus.QUEUED, SubmissionStatus.RUNNING])
        )
      )
      .returning({ id: submissions.id });

    return updatedRows.length > 0;
  }
}

export interface JudgeProcessorDeps {
  repository?: JudgeRepository;
  storage?: StorageReader;
  executor?: Executor;
  verdictHandler?: VerdictHandler;
  redisPublisher?: Redis | null;
}

const defaultRepository = new DrizzleJudgeRepository();

async function publishRunningEvent(redisPublisher: Redis | null | undefined, submissionId: string) {
  if (!redisPublisher || redisPublisher.status !== 'ready') return;
  const event: SubmissionEvent = {
    submissionId,
    status: SubmissionStatus.RUNNING,
    timestamp: Date.now(),
  };
  try {
    await redisPublisher.publish(REDIS_KEYS.CHANNEL_SUBMISSION_EVENTS, JSON.stringify(event));
  } catch {}
}

/**
 * Processes a single queued submission job end-to-end.
 * Note: Never logs user source code or environment secrets.
 */
export async function processSubmissionJob(
  jobData: Partial<SubmissionJobData> & { submissionId?: string },
  deps: JudgeProcessorDeps = {}
): Promise<ProcessSubmissionResult> {
  const repository = deps.repository ?? defaultRepository;
  const storage = deps.storage ?? workerStorage;
  const exec = deps.executor ?? defaultExecutor;
  const vHandler = deps.verdictHandler ?? defaultVerdictHandler;
  const redisPublisher = deps.redisPublisher ?? null;

  const submissionId = jobData.submissionId;
  if (!submissionId || !UUID_REGEX.test(submissionId)) {
    throw new UnrecoverableError('Invalid or missing submission ID');
  }

  const existing = await repository.getSubmissionById(submissionId);
  if (!existing) {
    throw new UnrecoverableError(`Submission "${submissionId}" does not exist`);
  }

  // Idempotency: Do not reprocess submissions that have already completed
  if (existing.status === SubmissionStatus.COMPLETED) {
    logger.info({ submissionId }, 'Skipping already-completed submission (duplicate delivery)');
    return {
      submissionId,
      skipped: true,
      verdict: (existing.verdict as Verdict) || undefined,
    };
  }

  const claimed = await repository.claimSubmissionRunning(submissionId);
  if (!claimed) {
    logger.info({ submissionId }, 'Submission already finalized concurrently; skipping');
    return { submissionId, skipped: true };
  }

  await publishRunningEvent(redisPublisher, submissionId);

  const problem = await repository.getProblemById(claimed.problemId);
  if (!problem || problem.isArchived) {
    await repository.saveFinalVerdict({
      id: submissionId,
      verdict: Verdict.INTERNAL_ERROR,
      executionTimeMs: 0,
      memoryUsedKb: 0,
    });
    throw new UnrecoverableError(`Problem "${claimed.problemId}" not found or archived`);
  }

  if (claimed.language !== 'javascript' && claimed.language !== 'python') {
    await repository.saveFinalVerdict({
      id: submissionId,
      verdict: Verdict.INTERNAL_ERROR,
      executionTimeMs: 0,
      memoryUsedKb: 0,
    });
    throw new UnrecoverableError(`Unsupported language "${claimed.language}"`);
  }

  const dbTestCases = await repository.getTestCasesByProblemId(problem.id);
  const payloads: TestCasePayload[] = [];

  if (dbTestCases.length > 0) {
    for (const tc of dbTestCases) {
      const [inputContent, expectedContent] = await Promise.all([
        storage.getObject(tc.inputKey),
        storage.getObject(tc.expectedOutputKey),
      ]);

      if (inputContent === null || expectedContent === null) {
        logger.error(
          { submissionId, problemId: problem.id, testIndex: tc.index },
          'Missing test case object in MinIO/Silo storage'
        );
        await vHandler.processVerdict({
          submissionId,
          problemId: problem.id,
          userId: claimed.userId,
          evaluation: {
            finalVerdict: Verdict.INTERNAL_ERROR,
            failedTestIndex: tc.index,
            results: [],
            maxExecutionTimeMs: 0,
            maxMemoryUsedKb: 0,
          },
          dbUpdateFn: (id, verdict, executionTimeMs, memoryUsedKb, failedTestIndex) =>
            repository.saveFinalVerdict({
              id,
              verdict,
              executionTimeMs,
              memoryUsedKb,
              failedTestIndex,
            }),
          redisPublisher,
        });
        throw new UnrecoverableError(
          `Missing object storage file for problem "${problem.id}" test index ${tc.index}`
        );
      }

      payloads.push({
        index: tc.index,
        input: inputContent,
        expectedOutput: expectedContent,
        isHidden: tc.isHidden,
      });
    }
  } else if (problem.sampleInput.length > 0 || problem.sampleExpectedOutput.length > 0) {
    payloads.push({
      index: 0,
      input: problem.sampleInput,
      expectedOutput: problem.sampleExpectedOutput,
      isHidden: false,
    });
  } else {
    await repository.saveFinalVerdict({
      id: submissionId,
      verdict: Verdict.INTERNAL_ERROR,
      executionTimeMs: 0,
      memoryUsedKb: 0,
    });
    throw new UnrecoverableError(`Problem "${problem.id}" has no executable test cases`);
  }

  const executionJob: SubmissionJobData = {
    submissionId,
    problemId: problem.id,
    userId: claimed.userId,
    code: claimed.code,
    language: claimed.language as SupportedLanguage,
    timeLimitMs: problem.timeLimitMs,
    memoryLimitMb: problem.memoryLimitMb,
  };

  const evaluation = await exec.execute(executionJob, payloads);

  // If Docker daemon itself failed, treat as transient so BullMQ retry can recover
  if (
    evaluation.finalVerdict === Verdict.INTERNAL_ERROR &&
    evaluation.results.length > 0 &&
    evaluation.maxExecutionTimeMs >= 0
  ) {
    // Allow retries only if sandbox hit infrastructure error
    const firstResult = evaluation.results[0];
    if (firstResult.verdict === Verdict.INTERNAL_ERROR) {
      throw new Error('Sandbox execution encountered an internal infrastructure error');
    }
  }

  const saved = await vHandler.processVerdict({
    submissionId,
    problemId: problem.id,
    userId: claimed.userId,
    evaluation,
    dbUpdateFn: (id, verdict, executionTimeMs, memoryUsedKb, failedTestIndex) =>
      repository.saveFinalVerdict({
        id,
        verdict,
        executionTimeMs,
        memoryUsedKb,
        failedTestIndex,
      }),
    redisPublisher,
  });

  logger.info(
    {
      submissionId,
      problemId: problem.id,
      language: claimed.language,
      verdict: evaluation.finalVerdict,
      executionTimeMs: evaluation.maxExecutionTimeMs,
      memoryUsedKb: evaluation.maxMemoryUsedKb,
      saved,
    },
    'Finished evaluating submission'
  );

  return {
    submissionId,
    skipped: !saved,
    verdict: evaluation.finalVerdict,
    failedTestIndex: evaluation.failedTestIndex,
    executionTimeMs: evaluation.maxExecutionTimeMs,
    memoryUsedKb: evaluation.maxMemoryUsedKb,
  };
}

