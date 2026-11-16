import { eq } from 'drizzle-orm';
import { execFile } from 'child_process';
import {
  SubmissionStatus,
  Verdict,
  ERROR_CODES,
  SubmissionJobData,
  SupportedLanguage,
} from '@judge/shared';
import { db } from '../../db/index.js';
import { problems, submissions } from '../../db/schema.js';
import { judgeQueue } from '../../config/queue.js';
import { AppError } from '../../utils/app-error.js';
import { isUuid, mapDatabaseError } from '../../utils/db-error.js';

export class AdminService {
  async getSystemStats() {
    let queueDepth = 0;
    if (judgeQueue) {
      try {
        const counts = await judgeQueue.getJobCounts('waiting', 'active', 'failed');
        queueDepth = counts.waiting || 0;
      } catch {}
    }

    try {
      const allSubmissions = await db
        .select({
          status: submissions.status,
          verdict: submissions.verdict,
          executionTimeMs: submissions.executionTimeMs,
        })
        .from(submissions);

      const runningCount = allSubmissions.filter(
        (s) => s.status === SubmissionStatus.RUNNING
      ).length;
      const queuedCount = allSubmissions.filter((s) => s.status === SubmissionStatus.QUEUED).length;

      const verdictCounts: Record<string, number> = {};
      let totalExecutionTime = 0;
      let completedCount = 0;

      for (const sub of allSubmissions) {
        if (sub.verdict) {
          verdictCounts[sub.verdict] = (verdictCounts[sub.verdict] || 0) + 1;
        }
        if (sub.executionTimeMs) {
          totalExecutionTime += sub.executionTimeMs;
          completedCount++;
        }
      }

      const averageJudgeTimeMs =
        completedCount > 0 ? Math.round(totalExecutionTime / completedCount) : 0;
      const failedJobsCount =
        (verdictCounts[Verdict.INTERNAL_ERROR] || 0) + (verdictCounts[Verdict.RUNTIME_ERROR] || 0);

      return {
        queueDepth: queueDepth || queuedCount,
        runningSubmissions: runningCount,
        verdictCounts,
        averageJudgeTimeMs,
        failedJobsCount,
        totalSubmissions: allSubmissions.length,
      };
    } catch (err) {
      throw mapDatabaseError(err);
    }
  }

  async rejudgeSubmission(submissionId: string) {
    if (!isUuid(submissionId)) {
      throw new AppError(ERROR_CODES.NOT_FOUND, 'Submission not found', 404);
    }

    try {
      const [sub] = await db
        .select()
        .from(submissions)
        .where(eq(submissions.id, submissionId))
        .limit(1);

      if (!sub) {
        throw new AppError(ERROR_CODES.NOT_FOUND, 'Submission not found', 404);
      }

      const [problem] = await db
        .select({
          id: problems.id,
          timeLimitMs: problems.timeLimitMs,
          memoryLimitMb: problems.memoryLimitMb,
        })
        .from(problems)
        .where(eq(problems.id, sub.problemId))
        .limit(1);

      if (!problem) {
        throw new AppError(ERROR_CODES.NOT_FOUND, 'Associated problem not found', 404);
      }

      // Reset status to QUEUED and clear previous verdict
      await db
        .update(submissions)
        .set({
          status: SubmissionStatus.QUEUED,
          verdict: null,
          executionTimeMs: null,
          memoryUsedKb: null,
          failedTestIndex: null,
          updatedAt: new Date(),
        })
        .where(eq(submissions.id, submissionId));

      const jobData: SubmissionJobData = {
        submissionId: sub.id,
        problemId: sub.problemId,
        userId: sub.userId,
        code: sub.code,
        language: sub.language as SupportedLanguage,
        timeLimitMs: problem.timeLimitMs,
        memoryLimitMb: problem.memoryLimitMb,
      };

      if (judgeQueue) {
        try {
          await judgeQueue.add('evaluate-submission', jobData, {
            jobId: `${sub.id}-rejudge-${Date.now()}`,
          });
        } catch {}
      }

      return { message: 'Submission re-queued for rejudging', submissionId };
    } catch (err) {
      throw mapDatabaseError(err);
    }
  }

  async killSubmission(submissionId: string) {
    if (!isUuid(submissionId)) {
      throw new AppError(ERROR_CODES.NOT_FOUND, 'Submission not found', 404);
    }

    try {
      const [existing] = await db
        .select({ id: submissions.id })
        .from(submissions)
        .where(eq(submissions.id, submissionId))
        .limit(1);

      if (!existing) {
        throw new AppError(ERROR_CODES.NOT_FOUND, 'Submission not found', 404);
      }

      // Kill any active container matching this submission pattern
      execFile('docker', ['ps', '-q', '--filter', `name=judge-sandbox-`], (err, stdout) => {
        if (!err && stdout.trim()) {
          const ids = stdout.trim().split('\n');
          for (const id of ids) {
            execFile('docker', ['kill', id.trim()], () => {});
          }
        }
      });

      // Mark as INTERNAL_ERROR (AC-SJ-08)
      await db
        .update(submissions)
        .set({
          status: SubmissionStatus.COMPLETED,
          verdict: Verdict.INTERNAL_ERROR,
          updatedAt: new Date(),
        })
        .where(eq(submissions.id, submissionId));

      return { message: 'Submission killed and flagged as INTERNAL_ERROR', submissionId };
    } catch (err) {
      throw mapDatabaseError(err);
    }
  }
}

export const adminService = new AdminService();
