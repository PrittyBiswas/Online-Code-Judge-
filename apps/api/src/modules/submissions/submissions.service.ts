import crypto from 'crypto';
import { memoryDb, query } from '../../config/db.js';
import { judgeQueue } from '../../config/queue.js';
import { isRedisHealthy } from '../../config/redis.js';
import {
  CreateSubmissionInput,
  RunSampleInput,
  QuerySubmissionsInput,
  Submission,
  SubmissionStatus,
  Verdict,
  ERROR_CODES,
  SubmissionJobData,
} from '@judge/shared';
import { AppError } from '../../utils/app-error.js';
import { SubmissionRow } from '../../../../drizzle/schema.js';
import { runInSandbox } from '../../../../judge-worker/src/sandbox/runner.js';

export class SubmissionsService {
  async submitCode(userId: string, input: CreateSubmissionInput): Promise<{ id: string; status: SubmissionStatus }> {
    const problem = memoryDb.problems.get(input.problemId);
    if (!problem || problem.is_archived) {
      throw new AppError(ERROR_CODES.NOT_FOUND, 'Problem not found', 404);
    }

    const submissionId = crypto.randomUUID();
    const submissionRow: SubmissionRow = {
      id: submissionId,
      problem_id: input.problemId,
      user_id: userId,
      code: input.code,
      language: input.language,
      status: SubmissionStatus.QUEUED,
      verdict: null,
      execution_time_ms: null,
      memory_used_kb: null,
      failed_test_index: null,
      retry_count: 0,
      created_at: new Date(),
      updated_at: new Date(),
    };

    memoryDb.submissions.set(submissionId, submissionRow);

    const jobData: SubmissionJobData = {
      submissionId,
      problemId: input.problemId,
      userId,
      code: input.code,
      language: input.language,
      timeLimitMs: problem.time_limit_ms,
      memoryLimitMb: problem.memory_limit_mb,
    };

    // Push job to BullMQ queue (Card 1 / AC-SJ-01)
    if (judgeQueue && isRedisHealthy()) {
      try {
        await Promise.race([
          judgeQueue.add('evaluate-submission', jobData, {
            jobId: submissionId, // Deduplication / idempotency
          }),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Queue enqueue timeout')), 400)),
        ]);
      } catch {}
    }

    // Return 202 immediately with submission ID
    return {
      id: submissionId,
      status: SubmissionStatus.QUEUED,
    };
  }

  async runSample(userId: string, input: RunSampleInput) {
    const problem = memoryDb.problems.get(input.problemId);
    if (!problem) {
      throw new AppError(ERROR_CODES.NOT_FOUND, 'Problem not found', 404);
    }

    const testInput = input.customInput ?? problem.sample_input;

    // Runs only against sample, still inside the locked-down sandbox (AC-FE-04)
    const result = await runInSandbox({
      code: input.code,
      input: testInput,
      timeLimitMs: problem.time_limit_ms,
      memoryLimitMb: problem.memory_limit_mb,
    });

    return {
      stdout: result.stdout,
      stderr: result.stderr,
      verdict: result.verdict,
      executionTimeMs: result.executionTimeMs,
      expectedOutput: problem.sample_expected_output,
    };
  }

  async getSubmission(id: string, currentUserId: string): Promise<Submission> {
    const sub = memoryDb.submissions.get(id);
    if (!sub) {
      throw new AppError(ERROR_CODES.NOT_FOUND, 'Submission not found', 404);
    }

    return this.mapToDto(sub);
  }

  async listSubmissions(userId: string, params: QuerySubmissionsInput) {
    let items = Array.from(memoryDb.submissions.values()).filter((s) => s.user_id === userId);

    if (params.problemId) {
      items = items.filter((s) => s.problem_id === params.problemId);
    }

    // Sort newest first
    items.sort((a, b) => b.created_at.getTime() - a.created_at.getTime());

    // Stable ID cursor pagination
    if (params.cursor) {
      const cursorIndex = items.findIndex((s) => s.id === params.cursor);
      if (cursorIndex !== -1) {
        items = items.slice(cursorIndex + 1);
      }
    }

    const limit = params.limit || 20;
    const paginated = items.slice(0, limit);
    const lastItem = paginated[paginated.length - 1];
    const nextCursor = items.length > limit && lastItem ? lastItem.id : null;

    return {
      items: paginated.map((s) => this.mapToDto(s)),
      nextCursor,
    };
  }

  private mapToDto(s: SubmissionRow): Submission {
    return {
      id: s.id,
      problemId: s.problem_id,
      userId: s.user_id,
      code: s.code,
      language: s.language as any,
      status: s.status as SubmissionStatus,
      verdict: (s.verdict as Verdict) || undefined,
      executionTimeMs: s.execution_time_ms || undefined,
      memoryUsedKb: s.memory_used_kb || undefined,
      failedTestIndex: s.failed_test_index || undefined,
      retryCount: s.retry_count,
      createdAt: s.created_at.toISOString(),
      updatedAt: s.updated_at.toISOString(),
    };
  }
}

export const submissionsService = new SubmissionsService();
