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

  public getActiveContainerCount(): number {
    return this.activeContainers.size;
  }

  /**
   * Terminates and removes all active sandbox containers tracked by this worker.
   */
  public async cleanupActiveContainers(): Promise<void> {
    const names = Array.from(this.activeContainers);
    await Promise.all(
      names.map(
        (container) =>
          new Promise<void>((resolve) => {
            logger.info({ container }, 'Terminating active sandbox container on shutdown');
            execFile('docker', ['rm', '-f', container], () => {
              resolve();
            });
          })
      )
    );
    this.activeContainers.clear();
  }

  public async handleShutdown(signal: string, onBeforeExit?: () => Promise<void>) {
    logger.info(
      { signal, activeCount: this.activeContainers.size },
      'Shutting down worker process...'
    );

    await this.cleanupActiveContainers();
    if (onBeforeExit) {
      try {
        await onBeforeExit();
      } catch {}
    }

    logger.info('Clean shutdown complete. Exiting.');
    process.exit(0);
  }
}

export const workerLifecycle = new WorkerLifecycle();
