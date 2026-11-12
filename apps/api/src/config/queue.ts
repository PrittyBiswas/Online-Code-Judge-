import { Queue } from 'bullmq';
import { QUEUES } from '@judge/shared';
import { env } from './env.js';
import { logger } from '../utils/logger.js';

let judgeQueue: Queue | null = null;
let sampleRunQueue: Queue | null = null;

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

try {
  judgeQueue = new Queue(QUEUES.JUDGE, {
    connection: parseRedisConnectionOptions(env.REDIS_URL),
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 1000,
      },
      removeOnComplete: 100,
      removeOnFail: 500,
    },
  });

  judgeQueue.on('error', (err) => {
    logger.warn({ err: err.message }, 'BullMQ judge queue error');
  });

  sampleRunQueue = new Queue(QUEUES.SAMPLE_RUN, {
    connection: parseRedisConnectionOptions(env.REDIS_URL),
    defaultJobOptions: {
      attempts: 1,
      removeOnComplete: true,
      removeOnFail: { age: 300, count: 50 },
    },
  });

  sampleRunQueue.on('error', (err) => {
    logger.warn({ err: err.message }, 'BullMQ sample-run queue error');
  });
} catch (err: any) {
  logger.warn({ err: err?.message }, 'Failed to initialize BullMQ queue client');
}

export { judgeQueue, sampleRunQueue };
