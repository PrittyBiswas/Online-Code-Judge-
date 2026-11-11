import { Worker, UnrecoverableError } from 'bullmq';
import Redis from 'ioredis';
import pino from 'pino';
import { QUEUES, SubmissionJobData, Verdict } from '@judge/shared';
import { workerEnv } from '../config/env.js';
import { closeDatabase } from '../db/index.js';
import { workerLifecycle } from '../recovery/shutdown.js';
import { DrizzleJudgeRepository, processSubmissionJob } from '../processor/judgeProcessor.js';

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
  redisPublisher: Redis;
  stop: () => Promise<void>;
}

export async function startJudgeWorker(): Promise<RunningJudgeWorker> {
  const connection = parseRedisConnectionOptions(workerEnv.REDIS_URL);
  const redisPublisher = new Redis(workerEnv.REDIS_URL, {
    maxRetriesPerRequest: null,
    lazyConnect: true,
  });

  redisPublisher.on('error', (err) => {
    logger.warn({ err: err.message }, 'Judge worker Redis publisher error');
  });

  await redisPublisher.connect().catch((err) => {
    logger.warn({ err: err?.message }, 'Initial Redis publisher connection delayed');
  });

  const repository = new DrizzleJudgeRepository();

  const worker = new Worker<SubmissionJobData>(
    QUEUES.JUDGE,
    async (job) => {
      return processSubmissionJob(job.data, {
        repository,
        redisPublisher,
      });
    },
    {
      connection,
      concurrency: workerEnv.WORKER_CONCURRENCY,
      lockDuration: 30000,
    }
  );

  worker.on('completed', (job, result) => {
    logger.info(
      { jobId: job.id, submissionId: result?.submissionId, verdict: result?.verdict },
      'BullMQ job completed'
    );
  });

  worker.on('failed', async (job, err) => {
    const submissionId = job?.data?.submissionId;
    const isPermanent =
      err instanceof UnrecoverableError ||
      (job !== undefined && job.attemptsMade >= (job.opts.attempts ?? 1));

    logger.error(
      {
        jobId: job?.id,
        submissionId,
        attemptsMade: job?.attemptsMade,
        isPermanent,
        err: err.message,
      },
      'BullMQ job failed'
    );

    // Prevent exhausted jobs from remaining stuck in QUEUED or RUNNING forever
    if (isPermanent && submissionId) {
      try {
        await repository.saveFinalVerdict({
          id: submissionId,
          verdict: Verdict.INTERNAL_ERROR,
          executionTimeMs: 0,
          memoryUsedKb: 0,
        });
      } catch (dbErr: any) {
        logger.error({ submissionId, err: dbErr?.message }, 'Failed fallback status update');
      }
    }
  });

  worker.on('error', (err) => {
    logger.error({ err: err.message }, 'BullMQ worker runtime error');
  });

  const stop = async () => {
    logger.info('Stopping BullMQ judge worker...');
    await worker.close();
    await workerLifecycle.cleanupActiveContainers();
    await redisPublisher.quit().catch(() => {});
    await closeDatabase().catch(() => {});
  };

  logger.info(
    { queue: QUEUES.JUDGE, concurrency: workerEnv.WORKER_CONCURRENCY },
    '[Judge-Worker] Host-run BullMQ worker started'
  );

  return { worker, redisPublisher, stop };
}

