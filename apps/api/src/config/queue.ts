import { Queue } from 'bullmq';
import { QUEUES } from '@judge/shared';
import { env } from './env.js';
import { logger } from '../utils/logger.js';

let judgeQueue: Queue | null = null;

try {
  judgeQueue = new Queue(QUEUES.JUDGE, {
    connection: {
      host: 'localhost',
      port: 6379,
      maxRetriesPerRequest: null,
    },
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
} catch (err: any) {
  logger.warn({ err: err?.message }, 'Failed to initialize BullMQ queue client');
}

export { judgeQueue };

