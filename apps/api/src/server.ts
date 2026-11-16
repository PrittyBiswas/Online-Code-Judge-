import { app } from './app.js';
import { env } from './config/env.js';
import { closeDatabase } from './db/index.js';
import { redisClient, redisSubscriber } from './config/redis.js';
import { contestSseManager } from './events/contest-sse.js';
import { sseManager } from './events/sse.js';
import { logger } from './utils/logger.js';
import { notificationsService } from './modules/notifications/notifications.service.js';

const server = app.listen(env.PORT, () => {
  logger.info({ port: env.PORT }, `[API] Online Code Judge API listening on port ${env.PORT}`);
});

// Periodic contest notifications sweeper (every 60 seconds) (Day 20)
const sweeperInterval = setInterval(() => {
  notificationsService.checkAndDispatchContestLifecycleNotifications().catch((err: any) => {
    logger.warn({ err: err?.message }, 'Failed running periodic contest lifecycle sweeper');
  });
}, 60000);

export async function gracefulShutdown(signal: string, exitProcess = true): Promise<void> {
  logger.info({ signal }, 'Received shutdown signal. Closing HTTP server gracefully...');
  clearInterval(sweeperInterval);

  // 1. Close active SSE streams so clients receive clean disconnect
  try {
    contestSseManager.closeAll('Server shutting down');
    sseManager.closeAll('Server shutting down');
  } catch (err: any) {
    logger.warn({ err: err?.message }, 'Error closing SSE connections');
  }

  // 2. Stop accepting new HTTP requests and wait for in-flight requests to complete
  await new Promise<void>((resolve) => {
    server.close(() => resolve());
  });

  // 3. Close database connection pool
  try {
    await closeDatabase();
    logger.info('PostgreSQL pool closed');
  } catch (err: any) {
    logger.warn({ err: err?.message }, 'Failed to close PostgreSQL pool cleanly');
  }

  // 4. Close Redis clients
  try {
    if (typeof redisClient.quit === 'function') {
      await redisClient.quit().catch(() => redisClient.disconnect());
    }
    if (typeof redisSubscriber.quit === 'function') {
      await redisSubscriber.quit().catch(() => redisSubscriber.disconnect());
    }
    logger.info('Redis connections closed');
  } catch (err: any) {
    logger.warn({ err: err?.message }, 'Failed to close Redis connections cleanly');
  }

  logger.info('Graceful shutdown completed.');
  if (exitProcess) {
    process.exit(0);
  }
}

const timeoutFallback = (signal: string) => {
  const timer = setTimeout(() => {
    logger.error({ signal }, 'Forceful shutdown timeout expired. Exiting now.');
    process.exit(1);
  }, 10000);
  if (typeof timer.unref === 'function') {
    timer.unref();
  }
};

process.on('SIGTERM', () => {
  timeoutFallback('SIGTERM');
  void gracefulShutdown('SIGTERM');
});
process.on('SIGINT', () => {
  timeoutFallback('SIGINT');
  void gracefulShutdown('SIGINT');
});

export { server };
