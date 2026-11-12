import crypto from 'crypto';
import { and, desc, eq, lt, or, type SQL } from 'drizzle-orm';
import { z } from 'zod';
import {
  CreateSubmissionInput,
  RunSampleInput,
  querySubmissionsSchema,
  Submission,
  SubmissionStatus,
  Verdict,
  ERROR_CODES,
  RATE_LIMITS,
  REDIS_KEYS,
  SampleRunJobData,
  SampleRunResult,
  SampleRunStatus,
  SubmissionJobData,
  SupportedLanguage,
} from '@judge/shared';
import { db } from '../../db/index.js';
import { problems, submissions, type SubmissionRecord } from '../../db/schema.js';
import { judgeQueue, sampleRunQueue } from '../../config/queue.js';
import { redisClient, isRedisHealthy } from '../../config/redis.js';
import { AppError } from '../../utils/app-error.js';
import { isUuid, mapDatabaseError } from '../../utils/db-error.js';

type QuerySubmissionsParams = z.input<typeof querySubmissionsSchema>;

export interface UpdateSubmissionResultInput {
  status: SubmissionStatus;
  verdict?: Verdict | null;
  executionTimeMs?: number | null;
  memoryUsedKb?: number | null;
  failedTestIndex?: number | null;
  retryCount?: number;
}

export class SubmissionsService {
  async submitCode(
    userId: string,
    input: CreateSubmissionInput
  ): Promise<{ id: string; status: SubmissionStatus }> {
    if (!isUuid(userId)) {
      throw new AppError(ERROR_CODES.VALIDATION_ERROR, 'Invalid user reference', 400);
    }
    if (!isUuid(input.problemId)) {
      throw new AppError(ERROR_CODES.NOT_FOUND, 'Problem not found', 404);
    }

    let createdSubmission: SubmissionRecord;
    let problemLimits: { timeLimitMs: number; memoryLimitMb: number };

    try {
      const [problem] = await db
        .select({
          id: problems.id,
          timeLimitMs: problems.timeLimitMs,
          memoryLimitMb: problems.memoryLimitMb,
          isArchived: problems.isArchived,
        })
        .from(problems)
        .where(eq(problems.id, input.problemId))
        .limit(1);

      if (!problem || problem.isArchived) {
        throw new AppError(ERROR_CODES.NOT_FOUND, 'Problem not found', 404);
      }

      problemLimits = {
        timeLimitMs: problem.timeLimitMs,
        memoryLimitMb: problem.memoryLimitMb,
      };

      const [inserted] = await db
        .insert(submissions)
        .values({
          problemId: input.problemId,
          userId,
          code: input.code,
          language: input.language,
          status: SubmissionStatus.QUEUED,
          retryCount: 0,
        })
        .returning();

      createdSubmission = inserted;
    } catch (err) {
      throw mapDatabaseError(err, {
        foreignKeyViolation: 'Invalid user or problem reference',
      });
    }

    const jobData: SubmissionJobData = {
      submissionId: createdSubmission.id,
      problemId: input.problemId,
      userId,
      code: input.code,
      language: input.language,
      timeLimitMs: problemLimits.timeLimitMs,
      memoryLimitMb: problemLimits.memoryLimitMb,
    };

    // Push job to BullMQ queue (Card 1 / AC-SJ-01)
    if (judgeQueue && isRedisHealthy()) {
      try {
        await Promise.race([
          judgeQueue.add('evaluate-submission', jobData, {
            jobId: createdSubmission.id, // Deduplication / idempotency
          }),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Queue enqueue timeout')), 400)
          ),
        ]);
      } catch {}
    }

    // Return 202 immediately with submission ID
    return {
      id: createdSubmission.id,
      status: SubmissionStatus.QUEUED,
    };
  }

  async runSample(
    userId: string,
    input: RunSampleInput
  ): Promise<{ runId: string; status: SampleRunStatus }> {
    if (!isUuid(userId)) {
      throw new AppError(ERROR_CODES.VALIDATION_ERROR, 'Invalid user reference', 400);
    }
    if (!isUuid(input.problemId)) {
      throw new AppError(ERROR_CODES.NOT_FOUND, 'Problem not found', 404);
    }

    let problem:
      | {
          sampleInput: string;
          sampleExpectedOutput: string;
          timeLimitMs: number;
          memoryLimitMb: number;
          isArchived: boolean;
        }
      | undefined;

    try {
      const rows = await db
        .select({
          sampleInput: problems.sampleInput,
          sampleExpectedOutput: problems.sampleExpectedOutput,
          timeLimitMs: problems.timeLimitMs,
          memoryLimitMb: problems.memoryLimitMb,
          isArchived: problems.isArchived,
        })
        .from(problems)
        .where(eq(problems.id, input.problemId))
        .limit(1);
      problem = rows[0];
    } catch (err) {
      throw mapDatabaseError(err);
    }

    if (!problem || problem.isArchived) {
      throw new AppError(ERROR_CODES.NOT_FOUND, 'Problem not found', 404);
    }

    if (!sampleRunQueue || !isRedisHealthy()) {
      throw new AppError(
        ERROR_CODES.INTERNAL_ERROR,
        'Sample execution service is temporarily unavailable.',
        503
      );
    }

    const runId = crypto.randomUUID();
    const nowIso = new Date().toISOString();
    const initialState: SampleRunResult & { userId: string } = {
      runId,
      problemId: input.problemId,
      userId,
      language: input.language,
      status: 'QUEUED',
      expectedOutput: problem.sampleExpectedOutput,
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    const jobData: SampleRunJobData = {
      type: 'SAMPLE_RUN',
      runId,
      problemId: input.problemId,
      userId,
      code: input.code,
      language: input.language,
      sampleInput: problem.sampleInput,
      timeLimitMs: problem.timeLimitMs,
      memoryLimitMb: problem.memoryLimitMb,
    };

    try {
      await redisClient.set(
        REDIS_KEYS.SAMPLE_RUN_JOB(runId),
        JSON.stringify(initialState),
        'EX',
        RATE_LIMITS.SAMPLE_RUN_TTL_SECONDS
      );

      await Promise.race([
        sampleRunQueue.add('run-sample', jobData, { jobId: runId }),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Sample queue enqueue timeout')), 800)
        ),
      ]);
    } catch {
      await redisClient.del(REDIS_KEYS.SAMPLE_RUN_JOB(runId)).catch(() => {});
      throw new AppError(
        ERROR_CODES.INTERNAL_ERROR,
        'Sample execution service is temporarily unavailable.',
        503
      );
    }

    return {
      runId,
      status: 'QUEUED',
    };
  }

  async getSampleRunResult(runId: string, currentUserId: string): Promise<SampleRunResult> {
    if (!isUuid(runId)) {
      throw new AppError(ERROR_CODES.NOT_FOUND, 'Sample run not found', 404);
    }
    if (!isRedisHealthy()) {
      throw new AppError(
        ERROR_CODES.INTERNAL_ERROR,
        'Sample execution service is temporarily unavailable.',
        503
      );
    }

    const raw = await redisClient.get(REDIS_KEYS.SAMPLE_RUN_JOB(runId));
    if (!raw) {
      throw new AppError(ERROR_CODES.NOT_FOUND, 'Sample run not found or expired', 404);
    }

    let parsed: SampleRunResult & { userId?: string };
    try {
      parsed = JSON.parse(raw) as SampleRunResult & { userId?: string };
    } catch {
      throw new AppError(ERROR_CODES.INTERNAL_ERROR, 'Invalid sample run state', 500);
    }

    if (parsed.userId !== currentUserId) {
      throw new AppError(
        ERROR_CODES.FORBIDDEN,
        'Access denied: you do not own this sample run',
        403
      );
    }

    const { userId: _ownerId, ...publicResult } = parsed;
    return publicResult;
  }

  async getSubmission(id: string, _currentUserId: string): Promise<Submission> {
    if (!isUuid(id)) {
      throw new AppError(ERROR_CODES.NOT_FOUND, 'Submission not found', 404);
    }

    try {
      const [sub] = await db.select().from(submissions).where(eq(submissions.id, id)).limit(1);

      if (!sub) {
        throw new AppError(ERROR_CODES.NOT_FOUND, 'Submission not found', 404);
      }

      return this.mapToDto(sub);
    } catch (err) {
      throw mapDatabaseError(err);
    }
  }

  async listSubmissions(userId: string, rawParams: QuerySubmissionsParams) {
    const params = querySubmissionsSchema.parse(rawParams);
    if (!isUuid(userId)) {
      return { items: [], nextCursor: null };
    }

    const limit = params.limit || 20;
    const conditions: SQL[] = [eq(submissions.userId, userId)];

    if (params.problemId) {
      if (!isUuid(params.problemId)) {
        return { items: [], nextCursor: null };
      }
      conditions.push(eq(submissions.problemId, params.problemId));
    }

    try {
      if (params.cursor && isUuid(params.cursor)) {
        const [cursorRow] = await db
          .select({ createdAt: submissions.createdAt, id: submissions.id })
          .from(submissions)
          .where(eq(submissions.id, params.cursor))
          .limit(1);

        if (cursorRow) {
          const cursorCond = or(
            lt(submissions.createdAt, cursorRow.createdAt),
            and(eq(submissions.createdAt, cursorRow.createdAt), lt(submissions.id, cursorRow.id))
          );
          if (cursorCond) conditions.push(cursorCond);
        }
      }

      const rows = await db
        .select()
        .from(submissions)
        .where(and(...conditions))
        .orderBy(desc(submissions.createdAt), desc(submissions.id))
        .limit(limit + 1);

      const hasMore = rows.length > limit;
      const page = hasMore ? rows.slice(0, limit) : rows;
      const lastItem = page[page.length - 1];

      return {
        items: page.map((s) => this.mapToDto(s)),
        nextCursor: hasMore && lastItem ? lastItem.id : null,
      };
    } catch (err) {
      throw mapDatabaseError(err);
    }
  }

  async listProblemSubmissions(problemId: string, limit: number = 20): Promise<Submission[]> {
    if (!isUuid(problemId)) {
      return [];
    }

    try {
      const rows = await db
        .select()
        .from(submissions)
        .where(eq(submissions.problemId, problemId))
        .orderBy(desc(submissions.createdAt), desc(submissions.id))
        .limit(limit);
      return rows.map((s) => this.mapToDto(s));
    } catch (err) {
      throw mapDatabaseError(err);
    }
  }

  async updateSubmissionResult(
    id: string,
    update: UpdateSubmissionResultInput
  ): Promise<Submission> {
    if (!isUuid(id)) {
      throw new AppError(ERROR_CODES.NOT_FOUND, 'Submission not found', 404);
    }

    const patch: Partial<typeof submissions.$inferInsert> = {
      status: update.status,
      updatedAt: new Date(),
    };
    if (update.verdict !== undefined) patch.verdict = update.verdict;
    if (update.executionTimeMs !== undefined) patch.executionTimeMs = update.executionTimeMs;
    if (update.memoryUsedKb !== undefined) patch.memoryUsedKb = update.memoryUsedKb;
    if (update.failedTestIndex !== undefined) patch.failedTestIndex = update.failedTestIndex;
    if (update.retryCount !== undefined) patch.retryCount = update.retryCount;

    try {
      const [updated] = await db
        .update(submissions)
        .set(patch)
        .where(eq(submissions.id, id))
        .returning();

      if (!updated) {
        throw new AppError(ERROR_CODES.NOT_FOUND, 'Submission not found', 404);
      }
      return this.mapToDto(updated);
    } catch (err) {
      throw mapDatabaseError(err);
    }
  }

  private mapToDto(s: SubmissionRecord): Submission {
    return {
      id: s.id,
      problemId: s.problemId,
      userId: s.userId,
      code: s.code,
      language: s.language as SupportedLanguage,
      status: s.status as SubmissionStatus,
      verdict: (s.verdict as Verdict) || undefined,
      executionTimeMs: s.executionTimeMs ?? undefined,
      memoryUsedKb: s.memoryUsedKb ?? undefined,
      failedTestIndex: s.failedTestIndex ?? undefined,
      retryCount: s.retryCount,
      createdAt: s.createdAt.toISOString(),
      updatedAt: s.updatedAt.toISOString(),
    };
  }
}

export const submissionsService = new SubmissionsService();
