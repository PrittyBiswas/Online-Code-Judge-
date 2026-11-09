import { execFile } from 'child_process';
import pino from 'pino';

const logger = pino({ level: 'info', base: { service: 'judge-worker' } });

export class WorkerLifecycle {
  private activeContainers = new Set<string>();

  public registerContainer(containerName: string) {
    this.activeContainers.add(containerName);
  }

  public unregisterContainer(containerName: string) {
    this.activeContainers.delete(containerName);
  }

  /**
   * Graceful shutdown handler (AC-OP-03):
   * Kills and removes running sandbox containers and exits cleanly.
   */
  public async handleShutdown(signal: string) {
    logger.info({ signal, activeCount: this.activeContainers.size }, 'Shutting down worker process...');

    for (const container of this.activeContainers) {
      try {
        logger.info({ container }, 'Terminating active sandbox container on shutdown (AC-OP-03)');
        execFile('docker', ['rm', '-f', container], () => {});
      } catch {}
    }

    this.activeContainers.clear();
    logger.info('Clean shutdown complete. Exiting.');
    process.exit(0);
  }
}

export const workerLifecycle = new WorkerLifecycle();

