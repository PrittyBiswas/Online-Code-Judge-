import { describe, it, expect, vi, beforeEach } from 'vitest';
import crypto from 'crypto';
import { Verdict, REDIS_KEYS } from '@judge/shared';

const { mockSet } = vi.hoisted(() => {
  const whereMock = vi.fn().mockReturnValue({
    returning: vi.fn().mockResolvedValue([{ id: 'sub-1' }]),
  });
  const setMock = vi.fn().mockReturnValue({
    where: whereMock,
  });
  return { mockSet: setMock };
});

vi.mock('../src/db/index.js', () => ({
  db: {
    update: vi.fn().mockReturnValue({
      set: mockSet,
    }),
  },
}));

import { Executor } from '../src/executor/executor.js';
import { processSampleRunJob } from '../src/processor/sampleRunProcessor.js';
import { DrizzleJudgeRepository } from '../src/processor/judgeProcessor.js';

describe('Phase 2 — Test Results Persistence & Custom Input in Judge Worker', () => {
  describe('Executor Per-Test-Case Recording & Fail-Fast Behavior', () => {
    it('records all test cases with ACCEPTED when all pass', async () => {
      const mockSandboxRunner = vi.fn().mockResolvedValue({
        verdict: Verdict.ACCEPTED,
        stdout: 'output\n',
        stderr: '',
        executionTimeMs: 12,
        memoryUsedKb: 1024,
        exitCode: 0,
      });

      const executor = new Executor(mockSandboxRunner);
      const evaluated = await executor.execute(
        {
          submissionId: crypto.randomUUID(),
          problemId: crypto.randomUUID(),
          code: 'print("hello")',
          language: 'python',
          timeLimitMs: 2000,
          memoryLimitMb: 128,
          retryCount: 0,
        },
        [
          { index: 0, input: '1', expectedOutput: 'output', isHidden: false },
          { index: 1, input: '2', expectedOutput: 'output', isHidden: true },
        ]
      );

      expect(evaluated.finalVerdict).toBe(Verdict.ACCEPTED);
      expect(evaluated.failedTestIndex).toBeUndefined();
      expect(evaluated.results).toHaveLength(2);
      expect(evaluated.results[0].verdict).toBe(Verdict.ACCEPTED);
      expect(evaluated.results[0].isHidden).toBe(false);
      expect(evaluated.results[1].verdict).toBe(Verdict.ACCEPTED);
      expect(evaluated.results[1].isHidden).toBe(true);
    });

    it('marks unexecuted test cases as NOT_EXECUTED when fail-fast stops early', async () => {
      const mockSandboxRunner = vi
        .fn()
        .mockResolvedValueOnce({
          verdict: Verdict.ACCEPTED,
          stdout: 'ok\n',
          stderr: '',
          executionTimeMs: 10,
          memoryUsedKb: 2048,
          exitCode: 0,
        })
        .mockResolvedValueOnce({
          verdict: Verdict.TIME_LIMIT_EXCEEDED,
          stdout: '',
          stderr: 'Time limit exceeded',
          executionTimeMs: 2005,
          memoryUsedKb: 4096,
          exitCode: 137,
        });

      const executor = new Executor(mockSandboxRunner);
      const evaluated = await executor.execute(
        {
          submissionId: crypto.randomUUID(),
          problemId: crypto.randomUUID(),
          code: 'while True: pass',
          language: 'python',
          timeLimitMs: 2000,
          memoryLimitMb: 128,
          retryCount: 0,
        },
        [
          { index: 0, input: 'test 0', expectedOutput: 'ok', isHidden: false },
          { index: 1, input: 'test 1', expectedOutput: 'ok', isHidden: true },
          { index: 2, input: 'test 2', expectedOutput: 'ok', isHidden: true },
          { index: 3, input: 'test 3', expectedOutput: 'ok', isHidden: false },
        ]
      );

      expect(evaluated.finalVerdict).toBe(Verdict.TIME_LIMIT_EXCEEDED);
      expect(evaluated.failedTestIndex).toBe(1);
      // Sandbox should only be called twice (stopped at index 1)
      expect(mockSandboxRunner).toHaveBeenCalledTimes(2);

      // Total results should still account for all 4 test cases
      expect(evaluated.results).toHaveLength(4);
      expect(evaluated.results[0].verdict).toBe(Verdict.ACCEPTED);
      expect(evaluated.results[0].index).toBe(0);

      expect(evaluated.results[1].verdict).toBe(Verdict.TIME_LIMIT_EXCEEDED);
      expect(evaluated.results[1].index).toBe(1);

      expect(evaluated.results[2].verdict).toBe(Verdict.NOT_EXECUTED);
      expect(evaluated.results[2].index).toBe(2);
      expect(evaluated.results[2].executionTimeMs).toBe(0);
      expect(evaluated.results[2].memoryUsedKb).toBe(0);
      expect(evaluated.results[2].isHidden).toBe(true);

      expect(evaluated.results[3].verdict).toBe(Verdict.NOT_EXECUTED);
      expect(evaluated.results[3].index).toBe(3);
      expect(evaluated.results[3].executionTimeMs).toBe(0);
      expect(evaluated.results[3].memoryUsedKb).toBe(0);
      expect(evaluated.results[3].isHidden).toBe(false);
    });
  });

  describe('Sample Run Custom Input Execution', () => {
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

    it('passes custom input directly into sandbox runner and preserves isCustomInput', async () => {
      const runId = crypto.randomUUID();
      const customInputText = '42\n100\nhello custom';
      const mockRunner = vi.fn().mockResolvedValue({
        verdict: Verdict.ACCEPTED,
        stdout: '142\n',
        stderr: '',
        executionTimeMs: 25,
        memoryUsedKb: 8192,
        exitCode: 0,
      });

      const result = await processSampleRunJob(
        {
          type: 'SAMPLE_RUN',
          runId,
          problemId: crypto.randomUUID(),
          userId: crypto.randomUUID(),
          code: 'input()\nprint("142")',
          language: 'python',
          sampleInput: customInputText,
          customInput: customInputText,
          isCustomInput: true,
          timeLimitMs: 1500,
          memoryLimitMb: 128,
        },
        {
          redisClient: mockRedis,
          sandboxRunner: mockRunner,
        }
      );

      expect(mockRunner).toHaveBeenCalledTimes(1);
      expect(mockRunner).toHaveBeenCalledWith(
        expect.objectContaining({
          input: customInputText,
          language: 'python',
        })
      );

      expect(result.status).toBe('COMPLETED');
      expect(result.outcome).toBe('SUCCESS');
      expect(result.isCustomInput).toBe(true);
      expect(result.customInput).toBe(customInputText);
      expect(result.stdout).toBe('142\n');

      // Verify state was saved to Redis with custom input metadata
      const rawStored = store.get(REDIS_KEYS.SAMPLE_RUN_JOB(runId));
      expect(rawStored).toBeDefined();
      const stored = JSON.parse(rawStored!);
      expect(stored.isCustomInput).toBe(true);
      expect(stored.customInput).toBe(customInputText);
    });
  });

  describe('DrizzleJudgeRepository saveFinalVerdict Persistence', () => {
    it('persists testCaseResults into the database update', async () => {
      const repo = new DrizzleJudgeRepository();

      const testCaseResults = [
        {
          index: 0,
          verdict: Verdict.ACCEPTED,
          executionTimeMs: 15,
          memoryUsedKb: 1024,
          isHidden: false,
        },
        {
          index: 1,
          verdict: Verdict.NOT_EXECUTED,
          executionTimeMs: 0,
          memoryUsedKb: 0,
          isHidden: true,
        },
      ];

      await repo.saveFinalVerdict({
        id: 'sub-1',
        verdict: Verdict.ACCEPTED,
        executionTimeMs: 15,
        memoryUsedKb: 1024,
        failedTestIndex: undefined,
        testCaseResults,
      });

      expect(mockSet).toHaveBeenCalledWith(
        expect.objectContaining({
          verdict: Verdict.ACCEPTED,
          executionTimeMs: 15,
          memoryUsedKb: 1024,
          testCaseResults: testCaseResults,
        })
      );
    });
  });
});
