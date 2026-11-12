import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UnrecoverableError } from 'bullmq';
import { LIMITS, REDIS_KEYS, Verdict } from '@judge/shared';
import { processSampleRunJob } from '../src/processor/sampleRunProcessor.js';

describe('Day 14 — Worker Sample Run Processor', () => {
  const store = new Map<string, string>();
  const mockRedis = {
    get: vi.fn(async (k: string) => store.get(k) ?? null),
    set: vi.fn(async (k: string, v: string) => {
      store.set(k, v);
      return 'OK' as const;
    }),
  };

  beforeEach(() => {
    store.clear();
    vi.clearAllMocks();
  });

  it('rejects malformed job payloads with UnrecoverableError', async () => {
    await expect(
      processSampleRunJob({ type: 'WRONG_TYPE', runId: 'bad' }, { redisClient: mockRedis })
    ).rejects.toThrow(UnrecoverableError);
  });

  it('executes valid JS and Python sample runs, bounds large output, and maps TLE/OLE/RE/infra outcomes', async () => {
    const runId = '11111111-1111-4111-8111-111111111111';
    const baseJob = {
      type: 'SAMPLE_RUN' as const,
      runId,
      problemId: '22222222-2222-4222-8222-222222222222',
      userId: '33333333-3333-4333-8333-333333333333',
      code: 'console.log("ok")',
      language: 'javascript' as const,
      sampleInput: '1 2',
      timeLimitMs: 1000,
      memoryLimitMb: 128,
    };

    const bigOutput = 'x'.repeat(LIMITS.OUTPUT_TRUNCATION_LIMIT * 4 + 100);
    const okResult = await processSampleRunJob(baseJob, {
      redisClient: mockRedis,
      sandboxRunner: async () => ({
        verdict: Verdict.ACCEPTED,
        stdout: bigOutput,
        stderr: '',
        executionTimeMs: 35,
        memoryUsedKb: 16384,
        exitCode: 0,
      }),
    });

    expect(okResult.status).toBe('COMPLETED');
    expect(okResult.outcome).toBe('SUCCESS');
    expect(okResult.stdout).toContain('[output truncated]');
    expect(store.has(REDIS_KEYS.SAMPLE_RUN_JOB(runId))).toBe(true);

    const tleResult = await processSampleRunJob(
      { ...baseJob, language: 'python', code: 'while True: pass' },
      {
        redisClient: mockRedis,
        sandboxRunner: async () => ({
          verdict: Verdict.TIME_LIMIT_EXCEEDED,
          stdout: '',
          stderr: 'Time limit exceeded',
          executionTimeMs: 1005,
          memoryUsedKb: 8192,
          exitCode: 137,
        }),
      }
    );
    expect(tleResult.status).toBe('COMPLETED');
    expect(tleResult.outcome).toBe('TIME_LIMIT_EXCEEDED');

    const oleResult = await processSampleRunJob(baseJob, {
      redisClient: mockRedis,
      sandboxRunner: async () => ({
        verdict: Verdict.OUTPUT_LIMIT_EXCEEDED,
        stdout: '',
        stderr: 'Output limit exceeded',
        executionTimeMs: 40,
        memoryUsedKb: 8192,
        exitCode: 1,
      }),
    });
    expect(oleResult.status).toBe('COMPLETED');
    expect(oleResult.outcome).toBe('OUTPUT_LIMIT_EXCEEDED');

    const infraResult = await processSampleRunJob(baseJob, {
      redisClient: mockRedis,
      sandboxRunner: async () => {
        throw new Error('Docker daemon unreachable');
      },
    });
    expect(infraResult.status).toBe('FAILED');
    expect(infraResult.outcome).toBe('INTERNAL_ERROR');
  });
});
