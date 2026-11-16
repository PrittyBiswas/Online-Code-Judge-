import pino from 'pino';

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  base: { service: 'judge-cron' },
  timestamp: pino.stdTimeFunctions.isoTime,
});

logger.info('[Cron] BullMQ sweeper and scheduler service initialized.');

let isShuttingDown = false;

const timer = setInterval(() => {
  if (isShuttingDown) return;
  logger.debug('[Cron] Periodic background tick');
}, 60000);

function handleShutdown(signal: string) {
  if (isShuttingDown) return;
  isShuttingDown = true;
  logger.info({ signal }, '[Cron] Shutting down cron service gracefully...');
  clearInterval(timer);
  process.exit(0);
}

process.on('SIGTERM', () => handleShutdown('SIGTERM'));
process.on('SIGINT', () => handleShutdown('SIGINT'));
