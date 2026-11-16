import { describe, it, expect } from 'vitest';
import { WorkerLifecycle } from '../src/recovery/shutdown.js';
import { logger } from '../src/utils/logger.js';

describe('Worker Production Readiness & Lifecycle Management (Day 22)', () => {
  it('tracks and cleans up active containers during graceful termination', async () => {
    const executedDockerCommands: string[][] = [];
    const mockDockerExec = async (args: string[]) => {
      executedDockerCommands.push(args);
      return { stdout: '', stderr: '' };
    };

    const lifecycle = new WorkerLifecycle(mockDockerExec);

    lifecycle.registerContainer('judge-sandbox-sub-1');
    lifecycle.registerContainer('judge-sandbox-sub-2');

    expect(lifecycle.getActiveContainerCount()).toBe(2);
    expect(lifecycle.isContainerActive('judge-sandbox-sub-1')).toBe(true);

    lifecycle.unregisterContainer('judge-sandbox-sub-1');
    expect(lifecycle.getActiveContainerCount()).toBe(1);

    await lifecycle.cleanupActiveContainers();

    expect(lifecycle.getActiveContainerCount()).toBe(0);
    expect(executedDockerCommands).toEqual([['rm', '-f', 'judge-sandbox-sub-2']]);
  });

  it('prunes orphaned sandbox containers from previous worker crashes on startup', async () => {
    const executedDockerCommands: string[][] = [];
    const mockDockerExec = async (args: string[]) => {
      executedDockerCommands.push(args);
      if (args[0] === 'ps') {
        return {
          stdout: 'judge-sandbox-orphan-10\njudge-sandbox-orphan-20\nother-container\n',
          stderr: '',
        };
      }
      return { stdout: '', stderr: '' };
    };

    const lifecycle = new WorkerLifecycle(mockDockerExec);
    const removedCount = await lifecycle.pruneOrphanedContainers();

    expect(removedCount).toBe(2);
    expect(executedDockerCommands).toContainEqual(['rm', '-f', 'judge-sandbox-orphan-10']);
    expect(executedDockerCommands).toContainEqual(['rm', '-f', 'judge-sandbox-orphan-20']);
    // Ensure non-judge containers are never touched
    expect(executedDockerCommands).not.toContainEqual(['rm', '-f', 'other-container']);
  });

  it('logger is properly configured with service name judge-worker', () => {
    expect(logger).toBeDefined();
    expect(logger.bindings().service).toBe('judge-worker');
  });
});
