import { app } from './app.js';
import { env } from './config/env.js';
import { closeDatabase } from './db/index.js';
import { logger } from './utils/logger.js';

const server = app.listen(env.PORT, () => {
  logger.info({ port: env.PORT }, `[API] Online Code Judge API listening on port ${env.PORT}`);
});

function gracefulShutdown(signal: string) {
  logger.info({ signal }, 'Received shutdown signal. Closing HTTP server gracefully...');
  server.close(async () => {
    try {
      await closeDatabase();
    } catch (err: any) {
      logger.warn({ err: err?.message }, 'Failed to close PostgreSQL pool cleanly');
    }
    logger.info('HTTP server closed. Exiting process.');
    process.exit(0);
  });

  setTimeout(() => {
    logger.error('Forceful shutdown timeout expired. Exiting now.');
    process.exit(1);
  }, 10000);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

export { server };
