import { execFile } from 'child_process';
import pino from 'pino';

const logger = pino({ level: process.env.LOG_LEVEL || 'info', base: { service: 'judge-worker' } });

export type ExecDockerFn = (args: string[]) => Promise<{ stdout: string; stderr: string }>;

function defaultExecDocker(args: string[]): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    execFile('docker', args, { timeout: 5000 }, (err, stdout, stderr) => {
      if (err) {
        reject(new Error(stderr?.trim() || err.message));
        return;
      }
      resolve({ stdout: stdout.trim(), stderr: stderr.trim() });
    });
  });
}

export class WorkerLifecycle {
  private activeContainers = new Set<string>();

  constructor(private readonly dockerExec: ExecDockerFn = defaultExecDocker) {}

  public registerContainer(containerName: string) {
    this.activeContainers.add(containerName);
  }

  public unregisterContainer(containerName: string) {
    this.activeContainers.delete(containerName);
  }

  public isContainerActive(containerName: string): boolean {
    return this.activeContainers.has(containerName);
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
      names.map(async (container) => {
        try {
          logger.info({ container }, 'Terminating active sandbox container on shutdown');
          await this.dockerExec(['rm', '-f', container]);
        } catch (err: any) {
          const msg = String(err?.message || '');
          if (!msg.includes('No such container')) {
            logger.warn({ container, err: msg }, 'Failed removing active sandbox container');
          }
        }
      })
    );
    this.activeContainers.clear();
  }

  /**
   * Removes stale judge-sandbox-* containers orphaned by a previous crashed worker.
   */
  public async pruneOrphanedContainers(): Promise<number> {
    try {
      const { stdout } = await this.dockerExec([
        'ps',
        '-a',
        '--filter',
        'name=judge-sandbox-',
        '--format',
        '{{.Names}}',
      ]);
      if (!stdout) return 0;

      const names = stdout
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((name) => name.startsWith('judge-sandbox-') && !this.activeContainers.has(name));

      let removed = 0;
      for (const name of names) {
        try {
          await this.dockerExec(['rm', '-f', name]);
          removed++;
          logger.warn({ container: name }, 'Removed orphaned sandbox container');
        } catch (err: any) {
          logger.warn({ container: name, err: err?.message }, 'Orphan container cleanup failed');
        }
      }
      return removed;
    } catch {
      return 0;
    }
  }

  public async handleShutdown(signal: string, onBeforeExit?: () => Promise<void>) {
    logger.info(
      { signal, activeCount: this.activeContainers.size },
      'Shutting down worker process...'
    );

    if (onBeforeExit) {
      try {
        await onBeforeExit();
      } catch (err: any) {
        logger.warn({ err: err?.message }, 'Error during worker graceful drain');
      }
    }

    await this.cleanupActiveContainers();
    logger.info('Clean shutdown complete. Exiting.');
    process.exit(0);
  }
}

export const workerLifecycle = new WorkerLifecycle();
