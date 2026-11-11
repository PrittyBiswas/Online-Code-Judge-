import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UnrecoverableError } from 'bullmq';
import crypto from 'crypto';
import { SubmissionStatus, Verdict } from '@judge/shared';
import { buildDockerArgs } from '../src/sandbox/runner.js';
import { Executor } from '../src/executor/executor.js';
import { VerdictHandler } from '../src/verdicts/handler.js';
import { WorkerLifecycle } from '../src/recovery/shutdown.js';
import {
  processSubmissionJob,
  type JudgeRepository,
  type StorageReader,
} from '../src/processor/judgeProcessor.js';
import type { ProblemRow, SubmissionRow, TestCaseRow } from '../src/db/schema.js';

function makeFixtures() {
  const userId = crypto.randomUUID();
  const problemId = crypto.randomUUID();
  const submissionId = crypto.randomUUID();

  const problem: ProblemRow = {
    id: problemId,
    title: 'Add Two Numbers',
    slug: 'add-two-numbers',
    statement: 'Output a + b',
    difficulty: 'easy',
    tags: ['math'],
    timeLimitMs: 2000,
    memoryLimitMb: 128,
    sampleInput: '1 2',
    sampleExpectedOutput: '3',
    setterId: userId,
    isArchived: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const testCaseRows: TestCaseRow[] = [
    {
      id: crypto.randomUUID(),
      problemId,
      index: 0,
      inputKey: `problems/${problemId}/test_0_in.txt`,
      expectedOutputKey: `problems/${problemId}/test_0_out.txt`,
      isHidden: false,
      createdAt: new Date(),
    },
    {
      id: crypto.randomUUID(),
      problemId,
      index: 1,
      inputKey: `problems/${problemId}/test_1_in.txt`,
      expectedOutputKey: `problems/${problemId}/test_1_out.txt`,
      isHidden: true,
      createdAt: new Date(),
    },
  ];

  const submission: SubmissionRow = {
    id: submissionId,
    problemId,
    userId,
    code: 'console.log(3);',
    language: 'javascript',
    status: SubmissionStatus.QUEUED,
    verdict: null,
    executionTimeMs: null,
    memoryUsedKb: null,
    failedTestIndex: null,
    retryCount: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  return { userId, problemId, submissionId, problem, testCaseRows, submission };
}

describe('Judge Worker Unit Tests (Day 6)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('builds strict container isolation flags for JavaScript and Python', () => {
    const jsArgs = buildDockerArgs({
      containerName: 'judge-sandbox-test-js',
      language: 'javascript',
      memoryLimitMb: 128,
      cpus: '0.5',
      pidsLimit: 64,
    });
    expect(jsArgs).toContain('--rm');
    expect(jsArgs).toContain('--network');
    expect(jsArgs).toContain('none');
    expect(jsArgs).toContain('--memory=128m');
    expect(jsArgs).toContain('--memory-swap=128m');
    expect(jsArgs).toContain('--cpus=0.5');
    expect(jsArgs).toContain('--pids-limit=64');
    expect(jsArgs).toContain('--read-only');
    expect(jsArgs).toContain('/tmp:rw,noexec,nosuid,size=16m');
    expect(jsArgs).toContain('--cap-drop');
    expect(jsArgs).toContain('ALL');
    expect(jsArgs).toContain('no-new-privileges');
    expect(jsArgs).toContain('1000:1000');
    expect(jsArgs).toContain('node:20-alpine');
    expect(jsArgs.join(' ')).not.toContain('docker.sock');

    const pyArgs = buildDockerArgs({
      containerName: 'judge-sandbox-test-py',
      language: 'python',
      memoryLimitMb: 128,
      cpus: '0.5',
      pidsLimit: 64,
    });
    expect(pyArgs).toContain('python:3.11-alpine');
    expect(pyArgs).toContain('python3');
  });

  it('rejects missing or invalid submission IDs without retrying', async () => {
    const repo: JudgeRepository = {
      getSubmissionById: vi.fn().mockResolvedValue(null),
      claimSubmissionRunning: vi.fn(),
      getProblemById: vi.fn(),
      getTestCasesByProblemId: vi.fn(),
      saveFinalVerdict: vi.fn(),
    };

    await expect(
      processSubmissionJob({ submissionId: 'not-a-uuid' }, { repository: repo })
    ).rejects.toBeInstanceOf(UnrecoverableError);

    const validId = crypto.randomUUID();
    await expect(
      processSubmissionJob({ submissionId: validId }, { repository: repo })
    ).rejects.toBeInstanceOf(UnrecoverableError);
    expect(repo.claimSubmissionRunning).not.toHaveBeenCalled();
  });

  it('processes a valid submission end-to-end as ACCEPTED and saves runtime/memory', async () => {
    const { submissionId, problemId, problem, testCaseRows, submission } = makeFixtures();

    const saveFinalVerdict = vi.fn().mockResolvedValue(true);
    const repo: JudgeRepository = {
      getSubmissionById: vi.fn().mockResolvedValue(submission),
      claimSubmissionRunning: vi
        .fn()
        .mockResolvedValue({ ...submission, status: SubmissionStatus.RUNNING, retryCount: 1 }),
      getProblemById: vi.fn().mockResolvedValue(problem),
      getTestCasesByProblemId: vi.fn().mockResolvedValue(testCaseRows),
      saveFinalVerdict,
    };

    const storage: StorageReader = {
      getObject: vi.fn(async (key: string) => {
        if (key.endsWith('0_in.txt')) return '1 2';
        if (key.endsWith('0_out.txt')) return '3\r\n';
        if (key.endsWith('1_in.txt')) return '10 20';
        if (key.endsWith('1_out.txt')) return '30\n';
        return null;
      }),
    };

    const sandboxRunner = vi
      .fn()
      .mockResolvedValueOnce({
        verdict: Verdict.ACCEPTED,
        stdout: '3  \n',
        stderr: '',
        executionTimeMs: 25,
        memoryUsedKb: 18432,
        exitCode: 0,
      })
      .mockResolvedValueOnce({
        verdict: Verdict.ACCEPTED,
        stdout: '30\n',
        stderr: '',
        executionTimeMs: 40,
        memoryUsedKb: 20480,
        exitCode: 0,
      });

    const result = await processSubmissionJob(
      { submissionId },
      {
        repository: repo,
        storage,
        executor: new Executor(sandboxRunner),
        verdictHandler: new VerdictHandler(),
      }
    );

    expect(result.skipped).toBe(false);
    expect(result.verdict).toBe(Verdict.ACCEPTED);
    expect(result.executionTimeMs).toBe(40);
    expect(result.memoryUsedKb).toBe(20480);
    expect(saveFinalVerdict).toHaveBeenCalledWith({
      id: submissionId,
      verdict: Verdict.ACCEPTED,
      executionTimeMs: 40,
      memoryUsedKb: 20480,
      failedTestIndex: undefined,
    });
    expect(sandboxRunner).toHaveBeenCalledTimes(2);
    expect(storage.getObject).toHaveBeenCalledWith(`problems/${problemId}/test_0_in.txt`);
  });

  it('classifies WRONG_ANSWER and stops early at the failing test index', async () => {
    const { submissionId, problem, testCaseRows, submission } = makeFixtures();

    const saveFinalVerdict = vi.fn().mockResolvedValue(true);
    const repo: JudgeRepository = {
      getSubmissionById: vi.fn().mockResolvedValue(submission),
      claimSubmissionRunning: vi
        .fn()
        .mockResolvedValue({ ...submission, status: SubmissionStatus.RUNNING }),
      getProblemById: vi.fn().mockResolvedValue(problem),
      getTestCasesByProblemId: vi.fn().mockResolvedValue(testCaseRows),
      saveFinalVerdict,
    };

    const storage: StorageReader = {
      getObject: vi.fn(async (key: string) => (key.includes('_in') ? '1 2' : '3')),
    };

    const sandboxRunner = vi.fn().mockResolvedValue({
      verdict: Verdict.ACCEPTED,
      stdout: '999',
      stderr: '',
      executionTimeMs: 12,
      memoryUsedKb: 12000,
      exitCode: 0,
    });

    const result = await processSubmissionJob(
      { submissionId },
      {
        repository: repo,
        storage,
        executor: new Executor(sandboxRunner),
      }
    );

    expect(result.verdict).toBe(Verdict.WRONG_ANSWER);
    expect(result.failedTestIndex).toBe(0);
    expect(sandboxRunner).toHaveBeenCalledTimes(1);
    expect(saveFinalVerdict).toHaveBeenCalledWith(
      expect.objectContaining({
        id: submissionId,
        verdict: Verdict.WRONG_ANSWER,
        failedTestIndex: 0,
      })
    );
  });

  it.each([
    Verdict.COMPILATION_ERROR,
    Verdict.RUNTIME_ERROR,
    Verdict.TIME_LIMIT_EXCEEDED,
    Verdict.MEMORY_LIMIT_EXCEEDED,
  ])('persists sandbox verdict %s accurately on failing test 1', async (expectedVerdict) => {
    const { submissionId, problem, testCaseRows, submission } = makeFixtures();

    const saveFinalVerdict = vi.fn().mockResolvedValue(true);
    const repo: JudgeRepository = {
      getSubmissionById: vi.fn().mockResolvedValue(submission),
      claimSubmissionRunning: vi
        .fn()
        .mockResolvedValue({ ...submission, status: SubmissionStatus.RUNNING }),
      getProblemById: vi.fn().mockResolvedValue(problem),
      getTestCasesByProblemId: vi.fn().mockResolvedValue(testCaseRows),
      saveFinalVerdict,
    };

    const storage: StorageReader = {
      getObject: vi.fn(async (key: string) => (key.includes('_in') ? '1 2' : '3')),
    };

    const sandboxRunner = vi
      .fn()
      .mockResolvedValueOnce({
        verdict: Verdict.ACCEPTED,
        stdout: '3',
        stderr: '',
        executionTimeMs: 10,
        memoryUsedKb: 10000,
        exitCode: 0,
      })
      .mockResolvedValueOnce({
        verdict: expectedVerdict,
        stdout: '',
        stderr: 'failure',
        executionTimeMs: expectedVerdict === Verdict.TIME_LIMIT_EXCEEDED ? 2005 : 15,
        memoryUsedKb: 15000,
        exitCode: 1,
      });

    const result = await processSubmissionJob(
      { submissionId },
      { repository: repo, storage, executor: new Executor(sandboxRunner) }
    );

    expect(result.verdict).toBe(expectedVerdict);
    expect(result.failedTestIndex).toBe(1);
    expect(saveFinalVerdict).toHaveBeenCalledWith(
      expect.objectContaining({
        verdict: expectedVerdict,
        failedTestIndex: 1,
      })
    );
  });

  it('marks INTERNAL_ERROR and throws UnrecoverableError when test-case objects are missing in MinIO', async () => {
    const { submissionId, problem, testCaseRows, submission } = makeFixtures();
    const saveFinalVerdict = vi.fn().mockResolvedValue(true);

    const repo: JudgeRepository = {
      getSubmissionById: vi.fn().mockResolvedValue(submission),
      claimSubmissionRunning: vi
        .fn()
        .mockResolvedValue({ ...submission, status: SubmissionStatus.RUNNING }),
      getProblemById: vi.fn().mockResolvedValue(problem),
      getTestCasesByProblemId: vi.fn().mockResolvedValue(testCaseRows),
      saveFinalVerdict,
    };

    const storage: StorageReader = {
      getObject: vi.fn().mockResolvedValue(null),
    };

    await expect(
      processSubmissionJob({ submissionId }, { repository: repo, storage })
    ).rejects.toBeInstanceOf(UnrecoverableError);

    expect(saveFinalVerdict).toHaveBeenCalledWith(
      expect.objectContaining({
        id: submissionId,
        verdict: Verdict.INTERNAL_ERROR,
        failedTestIndex: 0,
      })
    );
  });

  it('propagates database update errors so BullMQ can retry transient failures', async () => {
    const { submissionId, problem, testCaseRows, submission } = makeFixtures();

    const repo: JudgeRepository = {
      getSubmissionById: vi.fn().mockResolvedValue(submission),
      claimSubmissionRunning: vi
        .fn()
        .mockResolvedValue({ ...submission, status: SubmissionStatus.RUNNING }),
      getProblemById: vi.fn().mockResolvedValue(problem),
      getTestCasesByProblemId: vi.fn().mockResolvedValue(testCaseRows),
      saveFinalVerdict: vi.fn().mockRejectedValue(new Error('Connection terminated unexpectedly')),
    };

    const storage: StorageReader = {
      getObject: vi.fn(async (key: string) => (key.includes('_in') ? '1 2' : '3')),
    };

    const sandboxRunner = vi.fn().mockResolvedValue({
      verdict: Verdict.ACCEPTED,
      stdout: '3',
      stderr: '',
      executionTimeMs: 10,
      memoryUsedKb: 8000,
      exitCode: 0,
    });

    await expect(
      processSubmissionJob(
        { submissionId },
        { repository: repo, storage, executor: new Executor(sandboxRunner) }
      )
    ).rejects.toThrow('Connection terminated unexpectedly');
  });

  it('prevents duplicate execution/updates when submission is already COMPLETED or claimed', async () => {
    const { submissionId, problemId, userId, submission } = makeFixtures();
    const claimSubmissionRunning = vi.fn();
    const repoCompleted: JudgeRepository = {
      getSubmissionById: vi.fn().mockResolvedValue({
        ...submission,
        status: SubmissionStatus.COMPLETED,
        verdict: Verdict.ACCEPTED,
      }),
      claimSubmissionRunning,
      getProblemById: vi.fn(),
      getTestCasesByProblemId: vi.fn(),
      saveFinalVerdict: vi.fn(),
    };

    const skippedRes = await processSubmissionJob({ submissionId }, { repository: repoCompleted });
    expect(skippedRes.skipped).toBe(true);
    expect(claimSubmissionRunning).not.toHaveBeenCalled();

    // Also test VerdictHandler idempotency when dbUpdateFn returns false
    const publish = vi.fn();
    const handler = new VerdictHandler();
    const processed = await handler.processVerdict({
      submissionId,
      problemId,
      userId,
      evaluation: {
        finalVerdict: Verdict.ACCEPTED,
        results: [],
        maxExecutionTimeMs: 15,
        maxMemoryUsedKb: 1024,
      },
      dbUpdateFn: async () => false,
      redisPublisher: { status: 'ready', publish } as any,
    });

    expect(processed).toBe(false);
    expect(publish).not.toHaveBeenCalled();
  });

  it('tracks and cleans up active container references safely', async () => {
    const lifecycle = new WorkerLifecycle();
    lifecycle.registerContainer('judge-sandbox-test-cleanup');
    expect(lifecycle.getActiveContainerCount()).toBe(1);
    await lifecycle.cleanupActiveContainers();
    expect(lifecycle.getActiveContainerCount()).toBe(0);
  });
});

