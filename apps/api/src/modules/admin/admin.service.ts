import { memoryDb } from '../../config/db.js';
import { judgeQueue } from '../../config/queue.js';
import { SubmissionStatus, Verdict, ERROR_CODES, SubmissionJobData } from '@judge/shared';
import { AppError } from '../../utils/app-error.js';
import { execFile } from 'child_process';

export class AdminService {
  async getSystemStats() {
    let queueDepth = 0;
    if (judgeQueue) {
      try {
        const counts = await judgeQueue.getJobCounts('waiting', 'active', 'failed');
        queueDepth = counts.waiting || 0;
      } catch {}
    }

    const submissions = Array.from(memoryDb.submissions.values());
    const runningCount = submissions.filter((s) => s.status === SubmissionStatus.RUNNING).length;
    const queuedCount = submissions.filter((s) => s.status === SubmissionStatus.QUEUED).length;

    const verdictCounts: Record<string, number> = {};
    let totalExecutionTime = 0;
    let completedCount = 0;

    for (const sub of submissions) {
      if (sub.verdict) {
        verdictCounts[sub.verdict] = (verdictCounts[sub.verdict] || 0) + 1;
      }
      if (sub.execution_time_ms) {
        totalExecutionTime += sub.execution_time_ms;
        completedCount++;
      }
    }

    const averageJudgeTimeMs = completedCount > 0 ? Math.round(totalExecutionTime / completedCount) : 0;
    const failedJobsCount = (verdictCounts[Verdict.INTERNAL_ERROR] || 0) + (verdictCounts[Verdict.RUNTIME_ERROR] || 0);

    return {
      queueDepth: queueDepth || queuedCount,
      runningSubmissions: runningCount,
      verdictCounts,
      averageJudgeTimeMs,
      failedJobsCount,
      totalSubmissions: submissions.length,
    };
  }

  async rejudgeSubmission(submissionId: string) {
    const sub = memoryDb.submissions.get(submissionId);
    if (!sub) {
      throw new AppError(ERROR_CODES.NOT_FOUND, 'Submission not found', 404);
    }

    const problem = memoryDb.problems.get(sub.problem_id);
    if (!problem) {
      throw new AppError(ERROR_CODES.NOT_FOUND, 'Associated problem not found', 404);
    }

    // Reset status to QUEUED and clear previous verdict
    sub.status = SubmissionStatus.QUEUED;
    sub.verdict = null;
    sub.execution_time_ms = null;
    sub.memory_used_kb = null;
    sub.failed_test_index = null;
    sub.updated_at = new Date();

    const jobData: SubmissionJobData = {
      submissionId: sub.id,
      problemId: sub.problem_id,
      userId: sub.user_id,
      code: sub.code,
      language: sub.language as any,
      timeLimitMs: problem.time_limit_ms,
      memoryLimitMb: problem.memory_limit_mb,
    };

    if (judgeQueue) {
      try {
        await judgeQueue.add('evaluate-submission', jobData, {
          jobId: `${sub.id}-rejudge-${Date.now()}`,
        });
      } catch {}
    }

    return { message: 'Submission re-queued for rejudging', submissionId };
  }

  async killSubmission(submissionId: string) {
    const sub = memoryDb.submissions.get(submissionId);
    if (!sub) {
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
    sub.status = SubmissionStatus.COMPLETED;
    sub.verdict = Verdict.INTERNAL_ERROR;
    sub.updated_at = new Date();

    return { message: 'Submission killed and flagged as INTERNAL_ERROR', submissionId };
  }
}

export const adminService = new AdminService();

