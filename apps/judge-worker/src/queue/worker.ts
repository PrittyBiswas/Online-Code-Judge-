import { Queue, Worker } from 'bullmq';
import Redis from 'ioredis';
import pino from 'pino';
import { QUEUES, SampleRunJobData, SubmissionJobData, Verdict } from '@judge/shared';
import { workerEnv } from '../config/env.js';
import { closeDatabase } from '../db/index.js';
import { workerLifecycle } from '../recovery/shutdown.js';
import { SubmissionRecoveryService } from '../recovery/recoveryService.js';
import { DrizzleJudgeRepository, processSubmissionJob } from '../processor/judgeProcessor.js';
import { processSampleRunJob } from '../processor/sampleRunProcessor.js';
import { classifyWorkerError } from '../utils/errors.js';

const logger = pino({ level: workerEnv.LOG_LEVEL, base: { service: 'judge-worker-queue' } });

export function parseRedisConnectionOptions(redisUrl: string) {
  const url = new URL(redisUrl);
  return {
    host: url.hostname || 'localhost',
    port: url.port ? Number(url.port) : 6379,
    ...(url.username ? { username: decodeURIComponent(url.username) } : {}),
    ...(url.password ? { password: decodeURIComponent(url.password) } : {}),
    maxRetriesPerRequest: null,
  };
}

export interface RunningJudgeWorker {
  worker: Worker<SubmissionJobData>;
  sampleWorker: Worker<SampleRunJobData>;
  queue: Queue<SubmissionJobData>;
  redisPublisher: Redis;
  recoveryService: SubmissionRecoveryService;
  stop: () => Promise<void>;
}

export async function startJudgeWorker(options?: {
  enableSweeper?: boolean;
}): Promise<RunningJudgeWorker> {
  const connection = parseRedisConnectionOptions(workerEnv.REDIS_URL);
  const redisPublisher = new Redis(workerEnv.REDIS_URL, {
    maxRetriesPerRequest: null,
    lazyConnect: true,
    retryStrategy: (times) => Math.min(times * 250, 3000),
  });

  redisPublisher.on('error', (err) => {
    logger.warn(
      { failureCategory: 'REDIS_TRANSIENT_ERROR', err: err.message },
      'Judge worker Redis publisher connection error'
    );
  });

  await redisPublisher.connect().catch((err) => {
    logger.warn(
      { failureCategory: 'REDIS_TRANSIENT_ERROR', err: err?.message },
      'Initial Redis publisher connection delayed'
    );
  });

  const repository = new DrizzleJudgeRepository();
  const queue = new Queue<SubmissionJobData>(QUEUES.JUDGE, { connection });
  queue.on('error', (err) => {
    logger.warn(
      { failureCategory: 'REDIS_TRANSIENT_ERROR', err: err.message },
      'Judge queue connection error'
    );
  });

  const recoveryService = new SubmissionRecoveryService(
    repository,
    queue,
    workerLifecycle,
    redisPublisher
  );

  const worker = new Worker<SubmissionJobData>(
    QUEUES.JUDGE,
    async (job) => {
      return processSubmissionJob(job.data, {
        repository,
        redisPublisher,
        context: {
          jobId: job.id,
          attemptNumber: job.attemptsMade + 1,
          allowRetryReclaim: job.attemptsMade > 0,
        },
      });
    },
    {
      connection,
      concurrency: workerEnv.WORKER_CONCURRENCY,
      lockDuration: workerEnv.WORKER_LOCK_DURATION_MS,
      stalledInterval: workerEnv.WORKER_STALLED_INTERVAL_MS,
      maxStalledCount: workerEnv.WORKER_MAX_STALLED_COUNT,
    }
  );

  worker.on('completed', (job, result) => {
    logger.info(
      {
        jobId: job.id,
        submissionId: result?.submissionId,
        retryAttempt: Math.max(1, job.attemptsMade),
        finalVerdict: result?.verdict,
        skipped: result?.skipped,
      },
      'BullMQ job completed'
    );
  });

  worker.on('stalled', (jobId) => {
    logger.warn(
      { jobId, failureCategory: 'STALLED_JOB' },
      'Detected stalled BullMQ job; lock expired before completion'
    );
  });

  worker.on('failed', async (job, err) => {
    const submissionId = job?.data?.submissionId;
    const classified = classifyWorkerError(err);
    const maxAttempts = job?.opts.attempts ?? workerEnv.WORKER_MAX_ATTEMPTS;
    const exhausted = job !== undefined && job.attemptsMade >= maxAttempts;
    const isPermanent = classified.permanent || exhausted;

    logger.error(
      {
        jobId: job?.id,
        submissionId,
        retryAttempt: job?.attemptsMade,
        failureCategory: classified.category,
        isPermanent,
        err: classified.message,
      },
      'BullMQ job failed'
    );

    if (isPermanent && submissionId) {
      try {
        await repository.saveFinalVerdict({
          id: submissionId,
          verdict: Verdict.INTERNAL_ERROR,
          executionTimeMs: 0,
          memoryUsedKb: 0,
        });
      } catch (dbErr: any) {
        logger.error(
          {
            submissionId,
            jobId: job?.id,
            failureCategory: 'DATABASE_TRANSIENT_ERROR',
            err: dbErr?.message,
          },
          'Failed fallback status update after permanent failure'
        );
      }
    }
  });

  worker.on('error', (err) => {
    logger.error(
      { failureCategory: 'REDIS_TRANSIENT_ERROR', err: err.message },
      'BullMQ worker runtime error'
    );
  });

  const sampleWorker = new Worker<SampleRunJobData>(
    QUEUES.SAMPLE_RUN,
    async (job) => {
      return processSampleRunJob(job.data, {
        redisClient: redisPublisher,
      });
    },
    {
      connection,
      concurrency: workerEnv.WORKER_CONCURRENCY,
      lockDuration: workerEnv.WORKER_LOCK_DURATION_MS,
    }
  );

  sampleWorker.on('error', (err) => {
    logger.error(
      { failureCategory: 'REDIS_TRANSIENT_ERROR', err: err.message },
      'BullMQ sample worker runtime error'
    );
  });

  let sweepTimer: NodeJS.Timeout | null = null;
  if (options?.enableSweeper !== false) {
    const runSweep = () => {
      void recoveryService
        .recoverStaleSubmissions({
          staleThresholdMs: workerEnv.RECOVERY_STALE_MS,
          maxAttempts: workerEnv.WORKER_MAX_ATTEMPTS,
        })
        .catch((err: any) => {
          logger.warn({ err: err?.message }, 'Stale submission recovery sweep failed');
        });
    };

    // Safely prune orphaned containers & stale (aged) RUNNING rows without blindly resetting active jobs
    runSweep();
    sweepTimer = setInterval(runSweep, workerEnv.RECOVERY_INTERVAL_MS);
  }

  const stop = async () => {
    logger.info('Stopping BullMQ judge worker...');
    if (sweepTimer) {
      clearInterval(sweepTimer);
      sweepTimer = null;
    }
    await worker.close();
    await sampleWorker.close();
    await queue.close().catch(() => {});
    await workerLifecycle.cleanupActiveContainers();
    await redisPublisher.quit().catch(() => {});
    await closeDatabase().catch(() => {});
  };

  logger.info(
    {
      queue: QUEUES.JUDGE,
      concurrency: workerEnv.WORKER_CONCURRENCY,
      lockDurationMs: workerEnv.WORKER_LOCK_DURATION_MS,
      stalledIntervalMs: workerEnv.WORKER_STALLED_INTERVAL_MS,
      maxStalledCount: workerEnv.WORKER_MAX_STALLED_COUNT,
      recoveryStaleMs: workerEnv.RECOVERY_STALE_MS,
    },
    '[Judge-Worker] Host-run BullMQ worker started'
  );

  return { worker, sampleWorker, queue, redisPublisher, recoveryService, stop };
}
