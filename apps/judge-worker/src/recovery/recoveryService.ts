import { Queue } from 'bullmq';
import Redis from 'ioredis';
import pino from 'pino';
import { REDIS_KEYS, SubmissionEvent, SubmissionJobData, Verdict } from '@judge/shared';
import type { JudgeRepository } from '../processor/judgeProcessor.js';
import type { WorkerLifecycle } from './shutdown.js';

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  base: { service: 'judge-recovery' },
});

export interface RecoveryOptions {
  staleThresholdMs: number;
  maxAttempts: number;
  batchLimit?: number;
}

export interface RecoveryReport {
  scanned: number;
  requeued: number;
  markedInternalError: number;
  skippedActive: number;
  skippedRace: number;
  prunedContainers: number;
}

export class SubmissionRecoveryService {
  constructor(
    private readonly repository: JudgeRepository,
    private readonly queue: Pick<Queue<SubmissionJobData>, 'getJob' | 'add'>,
    private readonly lifecycle: WorkerLifecycle,
    private readonly redisPublisher?: Redis | null
  ) {}

  /**
   * Finds abandoned RUNNING submissions older than staleThresholdMs without touching active jobs.
   */
  public async recoverStaleSubmissions(options: RecoveryOptions): Promise<RecoveryReport> {
    const { staleThresholdMs, maxAttempts, batchLimit = 25 } = options;
    const cutoff = new Date(Date.now() - staleThresholdMs);

    const prunedContainers = await this.lifecycle.pruneOrphanedContainers();
    const candidates = await this.repository.findStaleRunningSubmissions(cutoff, batchLimit);

    const report: RecoveryReport = {
      scanned: candidates.length,
      requeued: 0,
      markedInternalError: 0,
      skippedActive: 0,
      skippedRace: 0,
      prunedContainers,
    };

    for (const sub of candidates) {
      // Never touch a submission if its BullMQ job is currently active in Redis
      try {
        const existingJob = await this.queue.getJob(sub.id);
        if (existingJob && (await existingJob.isActive())) {
          report.skippedActive++;
          continue;
        }
      } catch {
        // If Redis inspection fails temporarily, avoid guessing and retry on next sweep
        continue;
      }

      // Exhausted allowed attempts: finalize permanently as INTERNAL_ERROR
      if (sub.retryCount >= maxAttempts) {
        const saved = await this.repository.saveFinalVerdict({
          id: sub.id,
          verdict: Verdict.INTERNAL_ERROR,
          executionTimeMs: 0,
          memoryUsedKb: 0,
        });

        if (saved) {
          report.markedInternalError++;
          logger.warn(
            {
              submissionId: sub.id,
              retryAttempt: sub.retryCount,
              failureCategory: 'ABANDONED_MAX_RETRIES',
              finalVerdict: Verdict.INTERNAL_ERROR,
            },
            'Marked stale RUNNING submission as INTERNAL_ERROR after max attempts'
          );

          if (this.redisPublisher && this.redisPublisher.status === 'ready') {
            const event: SubmissionEvent = {
              submissionId: sub.id,
              status: Verdict.INTERNAL_ERROR,
              verdict: Verdict.INTERNAL_ERROR,
              timestamp: Date.now(),
            };
            await this.redisPublisher
              .publish(REDIS_KEYS.CHANNEL_SUBMISSION_EVENTS, JSON.stringify(event))
              .catch(() => {});
          }
        } else {
          report.skippedRace++;
        }
        continue;
      }

      // Optimistic CAS reset: only ONE recovering worker wins resetStaleSubmissionToQueued
      const resetOk = await this.repository.resetStaleSubmissionToQueued(sub.id, sub.updatedAt);
      if (!resetOk) {
        report.skippedRace++;
        continue;
      }

      const recoveryJobId = `${sub.id}-recover-${Date.now()}`;
      try {
        await this.queue.add(
          'evaluate-submission',
          {
            submissionId: sub.id,
            problemId: sub.problemId,
            userId: sub.userId,
            code: '',
            language: sub.language as any,
            timeLimitMs: 2000,
            memoryLimitMb: 128,
          },
          {
            jobId: recoveryJobId,
            attempts: Math.max(1, maxAttempts - sub.retryCount),
            backoff: { type: 'exponential', delay: 1000 },
            removeOnComplete: 100,
            removeOnFail: 500,
          }
        );
        report.requeued++;
        logger.info(
          {
            submissionId: sub.id,
            jobId: recoveryJobId,
            retryAttempt: sub.retryCount,
          },
          'Recovered abandoned RUNNING submission back into judge-queue'
        );
      } catch (err: any) {
        logger.error(
          {
            submissionId: sub.id,
            failureCategory: 'REDIS_TRANSIENT_ERROR',
            err: err?.message,
          },
          'Failed re-enqueuing recovered submission to BullMQ (remains QUEUED for later sweep)'
        );
      }
    }

    return report;
  }
}
