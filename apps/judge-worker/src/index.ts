import { logger } from './utils/logger.js';
import { startJudgeWorker } from './queue/worker.js';
import { runInSandbox } from './sandbox/runner.js';
import { processSubmissionJob } from './processor/judgeProcessor.js';
import { workerLifecycle } from './recovery/shutdown.js';

async function bootstrap() {
  const runtime = await startJudgeWorker();

  const onSignal = (signal: string) => {
    void workerLifecycle.handleShutdown(signal, () => runtime.stop());
  };

  process.on('SIGTERM', () => onSignal('SIGTERM'));
  process.on('SIGINT', () => onSignal('SIGINT'));
}

if (process.env.WORKER_AUTOSTART !== 'false') {
  bootstrap().catch((err) => {
    logger.error({ err: err?.message }, 'Failed to start judge-worker');
    process.exit(1);
  });
}

export { runInSandbox, processSubmissionJob, startJudgeWorker };
