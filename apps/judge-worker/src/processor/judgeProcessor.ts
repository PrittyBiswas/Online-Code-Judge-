import { and, asc, eq, inArray, lt, sql } from 'drizzle-orm';
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
import {
  classifyWorkerError,
  PermanentWorkerError,
  RetryableWorkerError,
  type WorkerFailureCategory,
} from '../utils/errors.js';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const logger = pino({ level: process.env.LOG_LEVEL || 'info', base: { service: 'judge-worker' } });

export interface ClaimOptions {
  expectedStatus: SubmissionStatus.QUEUED | SubmissionStatus.RUNNING;
  expectedUpdatedAt: Date;
  expectedRetryCount?: number;
}

export interface JudgeRepository {
  getSubmissionById(id: string): Promise<SubmissionRow | null>;
  claimSubmissionRunning(id: string, options: ClaimOptions): Promise<SubmissionRow | null>;
  releaseSubmissionToQueued(id: string, expectedUpdatedAt: Date): Promise<boolean>;
  findStaleRunningSubmissions(cutoff: Date, limit: number): Promise<SubmissionRow[]>;
  resetStaleSubmissionToQueued(id: string, expectedUpdatedAt: Date): Promise<boolean>;
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

export interface ProcessSubmissionContext {
  jobId?: string;
  attemptNumber?: number;
  allowRetryReclaim?: boolean;
}

export interface ProcessSubmissionResult {
  submissionId: string;
  skipped: boolean;
  verdict?: Verdict;
  failedTestIndex?: number;
  executionTimeMs?: number;
  memoryUsedKb?: number;
  failureCategory?: WorkerFailureCategory;
}

function timestampMatchesMs(expectedDate: Date) {
  // Compare within 2ms tolerance because PostgreSQL NOW() stores microseconds while JS Date holds milliseconds.
  return sql`abs(extract(epoch from (${submissions.updatedAt} - ${expectedDate.toISOString()}::timestamptz))) < 0.002`;
}

export class DrizzleJudgeRepository implements JudgeRepository {
  async getSubmissionById(id: string): Promise<SubmissionRow | null> {
    const [row] = await db.select().from(submissions).where(eq(submissions.id, id)).limit(1);
    return row ?? null;
  }

  /**
   * Optimistic compare-and-swap claim prevents two concurrent workers from claiming the same row.
   */
  async claimSubmissionRunning(id: string, options: ClaimOptions): Promise<SubmissionRow | null> {
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
          eq(submissions.status, options.expectedStatus),
          options.expectedRetryCount !== undefined
            ? eq(submissions.retryCount, options.expectedRetryCount)
            : undefined,
          timestampMatchesMs(options.expectedUpdatedAt)
        )
      )
      .returning();
    return updated ?? null;
  }

  async releaseSubmissionToQueued(id: string, expectedUpdatedAt: Date): Promise<boolean> {
    const rows = await db
      .update(submissions)
      .set({
        status: SubmissionStatus.QUEUED,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(submissions.id, id),
          eq(submissions.status, SubmissionStatus.RUNNING),
          timestampMatchesMs(expectedUpdatedAt)
        )
      )
      .returning({ id: submissions.id });
    return rows.length > 0;
  }

  async findStaleRunningSubmissions(cutoff: Date, limit: number): Promise<SubmissionRow[]> {
    return db
      .select()
      .from(submissions)
      .where(
        and(eq(submissions.status, SubmissionStatus.RUNNING), lt(submissions.updatedAt, cutoff))
      )
      .limit(limit);
  }

  async resetStaleSubmissionToQueued(id: string, expectedUpdatedAt: Date): Promise<boolean> {
    const rows = await db
      .update(submissions)
      .set({
        status: SubmissionStatus.QUEUED,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(submissions.id, id),
          eq(submissions.status, SubmissionStatus.RUNNING),
          timestampMatchesMs(expectedUpdatedAt)
        )
      )
      .returning({ id: submissions.id });
    return rows.length > 0;
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
  context?: ProcessSubmissionContext;
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

async function failPermanentlyWithInternalError(params: {
  submissionId: string;
  problemId: string;
  userId: string;
  failedTestIndex?: number;
  category: WorkerFailureCategory;
  message: string;
  repository: JudgeRepository;
  vHandler: VerdictHandler;
  redisPublisher: Redis | null;
}): Promise<never> {
  await params.vHandler
    .processVerdict({
      submissionId: params.submissionId,
      problemId: params.problemId,
      userId: params.userId,
      evaluation: {
        finalVerdict: Verdict.INTERNAL_ERROR,
        failedTestIndex: params.failedTestIndex,
        results: [],
        maxExecutionTimeMs: 0,
        maxMemoryUsedKb: 0,
      },
      dbUpdateFn: (id, verdict, executionTimeMs, memoryUsedKb, failedTestIndex) =>
        params.repository.saveFinalVerdict({
          id,
          verdict,
          executionTimeMs,
          memoryUsedKb,
          failedTestIndex,
        }),
      redisPublisher: params.redisPublisher,
    })
    .catch(() => {});

  throw new PermanentWorkerError(params.category, params.message);
}

/**
 * Processes a single queued submission job with atomic claiming, failure classification,
 * safe release on retryable failures, and structured observability.
 */
export async function processSubmissionJob(
  jobData: Partial<SubmissionJobData> & { submissionId?: string },
  deps: JudgeProcessorDeps = {}
): Promise<ProcessSubmissionResult> {
  const startTime = Date.now();
  const repository = deps.repository ?? defaultRepository;
  const storage = deps.storage ?? workerStorage;
  const exec = deps.executor ?? defaultExecutor;
  const vHandler = deps.verdictHandler ?? defaultVerdictHandler;
  const redisPublisher = deps.redisPublisher ?? null;
  const jobId = deps.context?.jobId;
  const attemptNumber = deps.context?.attemptNumber ?? 1;
  const allowRetryReclaim = deps.context?.allowRetryReclaim ?? attemptNumber > 1;

  const submissionId = jobData && typeof jobData === 'object' ? jobData.submissionId : undefined;
  if (typeof submissionId !== 'string' || !UUID_REGEX.test(submissionId)) {
    throw new PermanentWorkerError('INVALID_JOB_DATA', 'Invalid or missing submission ID');
  }

  let existing: SubmissionRow | null;
  try {
    existing = await repository.getSubmissionById(submissionId);
  } catch (err: any) {
    throw new RetryableWorkerError(
      'DATABASE_TRANSIENT_ERROR',
      `Failed reading submission "${submissionId}": ${err?.message || 'database error'}`
    );
  }

  if (!existing) {
    throw new PermanentWorkerError(
      'SUBMISSION_NOT_FOUND',
      `Submission "${submissionId}" does not exist`
    );
  }

  // Completed submissions must never transition back to RUNNING
  if (existing.status === SubmissionStatus.COMPLETED) {
    logger.info(
      {
        submissionId,
        jobId,
        retryAttempt: attemptNumber,
        finalVerdict: existing.verdict,
        durationMs: Date.now() - startTime,
      },
      'Skipping already-completed submission (duplicate delivery protected)'
    );
    return {
      submissionId,
      skipped: true,
      verdict: (existing.verdict as Verdict) || undefined,
    };
  }

  if (existing.status === SubmissionStatus.RUNNING && !allowRetryReclaim) {
    logger.info(
      { submissionId, jobId, retryAttempt: attemptNumber },
      'Submission currently RUNNING in another attempt/worker; skipping concurrent duplicate'
    );
    return { submissionId, skipped: true };
  }

  const claimed = await repository
    .claimSubmissionRunning(submissionId, {
      expectedStatus: existing.status as SubmissionStatus.QUEUED | SubmissionStatus.RUNNING,
      expectedUpdatedAt: existing.updatedAt,
      expectedRetryCount: existing.retryCount,
    })
    .catch((err: any) => {
      throw new RetryableWorkerError(
        'DATABASE_TRANSIENT_ERROR',
        `Failed claiming submission "${submissionId}": ${err?.message || 'database error'}`
      );
    });

  if (!claimed) {
    logger.info(
      { submissionId, jobId, retryAttempt: attemptNumber },
      'Submission claim lost optimistic CAS race; skipping'
    );
    return { submissionId, skipped: true };
  }

  await publishRunningEvent(redisPublisher, submissionId);

  try {
    const problem = await repository.getProblemById(claimed.problemId).catch((err: any) => {
      throw new RetryableWorkerError(
        'DATABASE_TRANSIENT_ERROR',
        `Failed loading problem "${claimed.problemId}": ${err?.message || 'database error'}`
      );
    });

    if (!problem || problem.isArchived) {
      return await failPermanentlyWithInternalError({
        submissionId,
        problemId: claimed.problemId,
        userId: claimed.userId,
        category: 'PROBLEM_NOT_FOUND',
        message: `Problem "${claimed.problemId}" not found or archived`,
        repository,
        vHandler,
        redisPublisher,
      });
    }

    if (claimed.language !== 'javascript' && claimed.language !== 'python') {
      return await failPermanentlyWithInternalError({
        submissionId,
        problemId: claimed.problemId,
        userId: claimed.userId,
        category: 'UNSUPPORTED_LANGUAGE',
        message: `Unsupported language "${claimed.language}"`,
        repository,
        vHandler,
        redisPublisher,
      });
    }

    if (typeof claimed.code !== 'string' || claimed.code.trim().length === 0) {
      return await failPermanentlyWithInternalError({
        submissionId,
        problemId: claimed.problemId,
        userId: claimed.userId,
        category: 'INVALID_JOB_DATA',
        message: `Submission "${submissionId}" has empty or missing source code`,
        repository,
        vHandler,
        redisPublisher,
      });
    }

    const dbTestCases = await repository.getTestCasesByProblemId(problem.id).catch((err: any) => {
      throw new RetryableWorkerError(
        'DATABASE_TRANSIENT_ERROR',
        `Failed loading test cases for "${problem.id}": ${err?.message || 'database error'}`
      );
    });

    const payloads: TestCasePayload[] = [];

    if (dbTestCases.length > 0) {
      for (const tc of dbTestCases) {
        let inputContent: string | null;
        let expectedContent: string | null;

        try {
          [inputContent, expectedContent] = await Promise.all([
            storage.getObject(tc.inputKey),
            storage.getObject(tc.expectedOutputKey),
          ]);
        } catch (err: any) {
          throw new RetryableWorkerError(
            'OBJECT_STORAGE_TRANSIENT_ERROR',
            `Transient object storage failure for test ${tc.index}: ${err?.message || 'storage error'}`
          );
        }

        if (inputContent === null || expectedContent === null) {
          logger.error(
            {
              submissionId,
              jobId,
              problemId: problem.id,
              testIndex: tc.index,
              failureCategory: 'MISSING_TEST_CASE_OBJECT',
            },
            'Missing test case object in MinIO/Silo storage'
          );
          return await failPermanentlyWithInternalError({
            submissionId,
            problemId: problem.id,
            userId: claimed.userId,
            failedTestIndex: tc.index,
            category: 'MISSING_TEST_CASE_OBJECT',
            message: `Missing object storage file for problem "${problem.id}" test index ${tc.index}`,
            repository,
            vHandler,
            redisPublisher,
          });
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
      return await failPermanentlyWithInternalError({
        submissionId,
        problemId: claimed.problemId,
        userId: claimed.userId,
        category: 'MISSING_TEST_CASES',
        message: `Problem "${claimed.problemId}" has no executable test cases`,
        repository,
        vHandler,
        redisPublisher,
      });
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

    if (evaluation.finalVerdict === Verdict.INTERNAL_ERROR && evaluation.infraFailureCategory) {
      throw new RetryableWorkerError(
        evaluation.infraFailureCategory,
        `Sandbox execution failed with infrastructure error (${evaluation.infraFailureCategory})`
      );
    }

    const saved = await vHandler
      .processVerdict({
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
      })
      .catch((err: any) => {
        throw new RetryableWorkerError(
          'DATABASE_TRANSIENT_ERROR',
          `Failed persisting verdict for "${submissionId}": ${err?.message || 'database error'}`
        );
      });

    const durationMs = Date.now() - startTime;
    logger.info(
      {
        submissionId,
        jobId,
        problemId: problem.id,
        language: claimed.language,
        retryAttempt: attemptNumber,
        durationMs,
        finalVerdict: evaluation.finalVerdict,
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
  } catch (err) {
    const info = classifyWorkerError(err);
    if (!info.permanent) {
      // Release RUNNING -> QUEUED cleanly when Postgres is reachable so retries or sweeper can claim
      await repository.releaseSubmissionToQueued(submissionId, claimed.updatedAt).catch(() => {});
    }

    logger.warn(
      {
        submissionId,
        jobId,
        retryAttempt: attemptNumber,
        durationMs: Date.now() - startTime,
        failureCategory: info.category,
        permanent: info.permanent,
        err: info.message,
      },
      'Submission processing interrupted'
    );
    throw err;
  }
}
