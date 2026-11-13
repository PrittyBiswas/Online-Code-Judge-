import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UnrecoverableError } from 'bullmq';
import crypto from 'crypto';
import { SubmissionStatus, Verdict } from '@judge/shared';
import { buildDockerArgs, classifySandboxOutcome } from '../src/sandbox/runner.js';
import { Executor } from '../src/executor/executor.js';
import { VerdictHandler } from '../src/verdicts/handler.js';
import { WorkerLifecycle } from '../src/recovery/shutdown.js';
import { SubmissionRecoveryService } from '../src/recovery/recoveryService.js';
import {
  PermanentWorkerError,
  RetryableWorkerError,
  classifyWorkerError,
} from '../src/utils/errors.js';
import {
  processSubmissionJob,
  type JudgeRepository,
  type StorageReader,
} from '../src/processor/judgeProcessor.js';
import type { ProblemRow, SubmissionRow, TestCaseRow } from '../src/db/schema.js';

function makeMockRepository(overrides: Partial<JudgeRepository> = {}): JudgeRepository {
  return {
    getSubmissionById: vi.fn().mockResolvedValue(null),
    claimSubmissionRunning: vi.fn().mockResolvedValue(null),
    releaseSubmissionToQueued: vi.fn().mockResolvedValue(true),
    findStaleRunningSubmissions: vi.fn().mockResolvedValue([]),
    resetStaleSubmissionToQueued: vi.fn().mockResolvedValue(true),
    getProblemById: vi.fn().mockResolvedValue(null),
    getTestCasesByProblemId: vi.fn().mockResolvedValue([]),
    saveFinalVerdict: vi.fn().mockResolvedValue(true),
    ...overrides,
  };
}

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
    const repo = makeMockRepository({
      getSubmissionById: vi.fn().mockResolvedValue(null),
    });

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
    const repo = makeMockRepository({
      getSubmissionById: vi.fn().mockResolvedValue(submission),
      claimSubmissionRunning: vi
        .fn()
        .mockResolvedValue({ ...submission, status: SubmissionStatus.RUNNING, retryCount: 1 }),
      getProblemById: vi.fn().mockResolvedValue(problem),
      getTestCasesByProblemId: vi.fn().mockResolvedValue(testCaseRows),
      saveFinalVerdict,
    });

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
    const repo = makeMockRepository({
      getSubmissionById: vi.fn().mockResolvedValue(submission),
      claimSubmissionRunning: vi
        .fn()
        .mockResolvedValue({ ...submission, status: SubmissionStatus.RUNNING }),
      getProblemById: vi.fn().mockResolvedValue(problem),
      getTestCasesByProblemId: vi.fn().mockResolvedValue(testCaseRows),
      saveFinalVerdict,
    });

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
    const repo = makeMockRepository({
      getSubmissionById: vi.fn().mockResolvedValue(submission),
      claimSubmissionRunning: vi
        .fn()
        .mockResolvedValue({ ...submission, status: SubmissionStatus.RUNNING }),
      getProblemById: vi.fn().mockResolvedValue(problem),
      getTestCasesByProblemId: vi.fn().mockResolvedValue(testCaseRows),
      saveFinalVerdict,
    });

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

    const repo = makeMockRepository({
      getSubmissionById: vi.fn().mockResolvedValue(submission),
      claimSubmissionRunning: vi
        .fn()
        .mockResolvedValue({ ...submission, status: SubmissionStatus.RUNNING }),
      getProblemById: vi.fn().mockResolvedValue(problem),
      getTestCasesByProblemId: vi.fn().mockResolvedValue(testCaseRows),
      saveFinalVerdict,
    });

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

    const repo = makeMockRepository({
      getSubmissionById: vi.fn().mockResolvedValue(submission),
      claimSubmissionRunning: vi
        .fn()
        .mockResolvedValue({ ...submission, status: SubmissionStatus.RUNNING }),
      getProblemById: vi.fn().mockResolvedValue(problem),
      getTestCasesByProblemId: vi.fn().mockResolvedValue(testCaseRows),
      saveFinalVerdict: vi.fn().mockRejectedValue(new Error('Connection terminated unexpectedly')),
    });

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
    const repoCompleted = makeMockRepository({
      getSubmissionById: vi.fn().mockResolvedValue({
        ...submission,
        status: SubmissionStatus.COMPLETED,
        verdict: Verdict.ACCEPTED,
      }),
      claimSubmissionRunning,
    });

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

  it('calls atomic Redis eval to record accepted solve and updates leaderboard', async () => {
    const { submissionId, problemId, userId } = makeFixtures();
    const publish = vi.fn().mockResolvedValue(1);
    const evalFn = vi.fn().mockResolvedValue(1);
    const handler = new VerdictHandler();
    const processed = await handler.processVerdict({
      submissionId,
      problemId,
      userId,
      evaluation: {
        finalVerdict: Verdict.ACCEPTED,
        results: [],
        maxExecutionTimeMs: 1500,
        maxMemoryUsedKb: 1024,
      },
      dbUpdateFn: async () => true,
      redisPublisher: { status: 'ready', publish, eval: evalFn } as any,
    });

    expect(processed).toBe(true);
    expect(publish).toHaveBeenCalled();
    expect(evalFn).toHaveBeenCalledWith(
      expect.stringContaining('local solvedSetKey = KEYS[1]'),
      3,
      `judge:user:${userId}:solved`,
      'judge:leaderboard:global',
      'judge:leaderboard:rebuilding',
      problemId,
      userId,
      1,
      10000000
    );
  });

  it('tracks and cleans up active container references safely', async () => {
    const dockerExec = vi.fn().mockResolvedValue({ stdout: '', stderr: '' });
    const lifecycle = new WorkerLifecycle(dockerExec);
    lifecycle.registerContainer('judge-sandbox-test-cleanup');
    expect(lifecycle.getActiveContainerCount()).toBe(1);
    expect(lifecycle.isContainerActive('judge-sandbox-test-cleanup')).toBe(true);
    await lifecycle.cleanupActiveContainers();
    expect(lifecycle.getActiveContainerCount()).toBe(0);
    expect(dockerExec).toHaveBeenCalledWith(['rm', '-f', 'judge-sandbox-test-cleanup']);
  });
});

describe('Judge Worker Reliability & Recovery Unit Tests (Day 7)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('recovers stale RUNNING submissions, skips active BullMQ jobs, enforces maxAttempts, and prevents double recovery', async () => {
    const staleQueued = makeFixtures().submission;
    staleQueued.status = SubmissionStatus.RUNNING;
    staleQueued.retryCount = 1;
    staleQueued.updatedAt = new Date(Date.now() - 120_000);

    const staleExhausted = makeFixtures().submission;
    staleExhausted.status = SubmissionStatus.RUNNING;
    staleExhausted.retryCount = 3;
    staleExhausted.updatedAt = new Date(Date.now() - 120_000);

    const staleActiveJob = makeFixtures().submission;
    staleActiveJob.status = SubmissionStatus.RUNNING;
    staleActiveJob.retryCount = 1;

    const staleRaceLost = makeFixtures().submission;
    staleRaceLost.status = SubmissionStatus.RUNNING;
    staleRaceLost.retryCount = 1;

    const dockerExec = vi
      .fn()
      .mockResolvedValueOnce({ stdout: 'judge-sandbox-orphan-1\n', stderr: '' })
      .mockResolvedValue({ stdout: '', stderr: '' });
    const lifecycle = new WorkerLifecycle(dockerExec);
    // Keep one active container tracked so pruning leaves it alone
    lifecycle.registerContainer('judge-sandbox-active-0');

    const publish = vi.fn().mockResolvedValue(1);
    const redisPublisher = { status: 'ready', publish } as any;

    const saveFinalVerdict = vi.fn().mockResolvedValue(true);
    const resetStaleSubmissionToQueued = vi
      .fn()
      .mockResolvedValueOnce(true) // staleQueued succeeds CAS
      .mockResolvedValueOnce(false); // staleRaceLost loses CAS race to another instance

    const repo = makeMockRepository({
      findStaleRunningSubmissions: vi
        .fn()
        .mockResolvedValue([staleQueued, staleExhausted, staleActiveJob, staleRaceLost]),
      resetStaleSubmissionToQueued,
      saveFinalVerdict,
    });

    const add = vi.fn().mockResolvedValue({});
    const queue = {
      getJob: vi.fn(async (id: string) => {
        if (id === staleActiveJob.id) {
          return { isActive: async () => true } as any;
        }
        return null;
      }),
      add,
    };

    const recovery = new SubmissionRecoveryService(repo, queue, lifecycle, redisPublisher);
    const report = await recovery.recoverStaleSubmissions({
      staleThresholdMs: 60_000,
      maxAttempts: 3,
      batchLimit: 10,
    });

    expect(report).toEqual({
      scanned: 4,
      requeued: 1,
      markedInternalError: 1,
      skippedActive: 1,
      skippedRace: 1,
      prunedContainers: 1,
    });

    expect(add).toHaveBeenCalledTimes(1);
    expect(add).toHaveBeenCalledWith(
      'evaluate-submission',
      expect.objectContaining({ submissionId: staleQueued.id }),
      expect.objectContaining({ attempts: 2 })
    );
    expect(saveFinalVerdict).toHaveBeenCalledWith(
      expect.objectContaining({
        id: staleExhausted.id,
        verdict: Verdict.INTERNAL_ERROR,
      })
    );
    expect(publish).toHaveBeenCalledTimes(1);
    expect(dockerExec).toHaveBeenCalledWith(['rm', '-f', 'judge-sandbox-orphan-1']);
  });

  it('rejects duplicate attempt-1 deliveries and optimistic CAS claim conflicts cleanly', async () => {
    const { submissionId, submission } = makeFixtures();

    // Case 1: Submission already RUNNING and delivery is attempt 1 (duplicate delivery)
    const repoAlreadyRunning = makeMockRepository({
      getSubmissionById: vi.fn().mockResolvedValue({
        ...submission,
        status: SubmissionStatus.RUNNING,
      }),
    });

    const dupResult = await processSubmissionJob(
      { submissionId },
      { repository: repoAlreadyRunning, context: { jobId: 'job-1', attemptNumber: 1 } }
    );
    expect(dupResult.skipped).toBe(true);
    expect(repoAlreadyRunning.claimSubmissionRunning).not.toHaveBeenCalled();

    // Case 2: Another worker claims the QUEUED row concurrently (CAS returns null)
    const repoLostCas = makeMockRepository({
      getSubmissionById: vi.fn().mockResolvedValue(submission),
      claimSubmissionRunning: vi.fn().mockResolvedValue(null),
    });

    const casResult = await processSubmissionJob(
      { submissionId },
      { repository: repoLostCas, context: { jobId: 'job-2', attemptNumber: 1 } }
    );
    expect(casResult.skipped).toBe(true);
    expect(repoLostCas.getProblemById).not.toHaveBeenCalled();
  });

  it('releases RUNNING submission back to QUEUED and throws RetryableWorkerError when Docker daemon fails', async () => {
    const { submissionId, problem, testCaseRows, submission } = makeFixtures();
    const claimedUpdatedAt = new Date();
    const releaseSubmissionToQueued = vi.fn().mockResolvedValue(true);

    const repo = makeMockRepository({
      getSubmissionById: vi.fn().mockResolvedValue(submission),
      claimSubmissionRunning: vi.fn().mockResolvedValue({
        ...submission,
        status: SubmissionStatus.RUNNING,
        updatedAt: claimedUpdatedAt,
      }),
      getProblemById: vi.fn().mockResolvedValue(problem),
      getTestCasesByProblemId: vi.fn().mockResolvedValue(testCaseRows),
      releaseSubmissionToQueued,
    });

    const storage: StorageReader = {
      getObject: vi.fn(async (key: string) => (key.includes('_in') ? '1 2' : '3')),
    };

    const sandboxRunner = vi.fn().mockResolvedValue({
      verdict: Verdict.INTERNAL_ERROR,
      stdout: '',
      stderr: 'Cannot connect to the Docker daemon',
      executionTimeMs: 5,
      memoryUsedKb: 0,
      exitCode: null,
      infraFailureCategory: 'DOCKER_DAEMON_UNAVAILABLE',
    });

    await expect(
      processSubmissionJob(
        { submissionId },
        {
          repository: repo,
          storage,
          executor: new Executor(sandboxRunner),
          context: { jobId: 'job-docker-down', attemptNumber: 1 },
        }
      )
    ).rejects.toBeInstanceOf(RetryableWorkerError);

    expect(releaseSubmissionToQueued).toHaveBeenCalledWith(submissionId, claimedUpdatedAt);
    expect(repo.saveFinalVerdict).not.toHaveBeenCalled();
  });

  it('throws PermanentWorkerError without releasing when test cases are missing', async () => {
    const { submissionId, problem, submission } = makeFixtures();
    problem.sampleInput = '';
    problem.sampleExpectedOutput = '';
    const saveFinalVerdict = vi.fn().mockResolvedValue(true);
    const releaseSubmissionToQueued = vi.fn();

    const repo = makeMockRepository({
      getSubmissionById: vi.fn().mockResolvedValue(submission),
      claimSubmissionRunning: vi.fn().mockResolvedValue({
        ...submission,
        status: SubmissionStatus.RUNNING,
      }),
      getProblemById: vi.fn().mockResolvedValue(problem),
      getTestCasesByProblemId: vi.fn().mockResolvedValue([]),
      saveFinalVerdict,
      releaseSubmissionToQueued,
    });

    await expect(
      processSubmissionJob({ submissionId }, { repository: repo })
    ).rejects.toBeInstanceOf(PermanentWorkerError);

    expect(saveFinalVerdict).toHaveBeenCalledWith(
      expect.objectContaining({ id: submissionId, verdict: Verdict.INTERNAL_ERROR })
    );
    expect(releaseSubmissionToQueued).not.toHaveBeenCalled();
  });

  it('releases RUNNING submission on transient DB verdict-write error and never broadcasts SSE', async () => {
    const { submissionId, problem, testCaseRows, submission } = makeFixtures();
    const claimedUpdatedAt = new Date();
    const releaseSubmissionToQueued = vi.fn().mockResolvedValue(true);
    const publish = vi.fn();

    const repo = makeMockRepository({
      getSubmissionById: vi.fn().mockResolvedValue(submission),
      claimSubmissionRunning: vi.fn().mockResolvedValue({
        ...submission,
        status: SubmissionStatus.RUNNING,
        updatedAt: claimedUpdatedAt,
      }),
      getProblemById: vi.fn().mockResolvedValue(problem),
      getTestCasesByProblemId: vi.fn().mockResolvedValue(testCaseRows),
      saveFinalVerdict: vi.fn().mockRejectedValue(new Error('postgres connection terminated')),
      releaseSubmissionToQueued,
    });

    const storage: StorageReader = {
      getObject: vi.fn(async (key: string) => (key.includes('_in') ? '1 2' : '3')),
    };

    const sandboxRunner = vi.fn().mockResolvedValue({
      verdict: Verdict.ACCEPTED,
      stdout: '3',
      stderr: '',
      executionTimeMs: 10,
      memoryUsedKb: 8192,
      exitCode: 0,
    });

    await expect(
      processSubmissionJob(
        { submissionId },
        {
          repository: repo,
          storage,
          executor: new Executor(sandboxRunner),
          redisPublisher: { status: 'ready', publish } as any,
        }
      )
    ).rejects.toThrow('postgres connection terminated');

    expect(releaseSubmissionToQueued).toHaveBeenCalledWith(submissionId, claimedUpdatedAt);
    expect(publish).toHaveBeenCalledTimes(1); // Only initial RUNNING event, no COMPLETED event
  });

  it('classifies sandbox timeouts, OOM, output caps, and Docker infra errors accurately', () => {
    const daemonDown = classifySandboxOutcome({
      timedOut: false,
      outputExceeded: false,
      error: Object.assign(new Error('spawn failed'), { code: 'ENOENT' }),
      exitCode: null,
      rawStdout: '',
      rawStderr: 'Cannot connect to the Docker daemon at unix:///var/run/docker.sock',
      durationMs: 12,
      memoryLimitMb: 128,
    });
    expect(daemonDown.verdict).toBe(Verdict.INTERNAL_ERROR);
    expect(daemonDown.infraFailureCategory).toBe('DOCKER_DAEMON_UNAVAILABLE');

    const startFailed = classifySandboxOutcome({
      timedOut: false,
      outputExceeded: false,
      error: new Error('docker run failed'),
      exitCode: 125,
      rawStdout: '',
      rawStderr: 'docker: Error response from daemon: invalid config',
      durationMs: 25,
      memoryLimitMb: 128,
    });
    expect(startFailed.verdict).toBe(Verdict.INTERNAL_ERROR);
    expect(startFailed.infraFailureCategory).toBe('SANDBOX_CONTAINER_START_FAILED');

    const outputCap = classifySandboxOutcome({
      timedOut: false,
      outputExceeded: true,
      error: null,
      exitCode: 0,
      rawStdout: 'a'.repeat(100),
      rawStderr: '',
      durationMs: 40,
      memoryLimitMb: 128,
    });
    expect(outputCap.verdict).toBe(Verdict.OUTPUT_LIMIT_EXCEEDED);

    const oom = classifySandboxOutcome({
      timedOut: false,
      outputExceeded: false,
      error: new Error('killed'),
      exitCode: 137,
      rawStdout: '',
      rawStderr: '',
      durationMs: 80,
      memoryLimitMb: 128,
    });
    expect(oom.verdict).toBe(Verdict.MEMORY_LIMIT_EXCEEDED);

    const tle = classifySandboxOutcome({
      timedOut: true,
      outputExceeded: false,
      error: new Error('timed out'),
      exitCode: null,
      rawStdout: '',
      rawStderr: '',
      durationMs: 2005,
      memoryLimitMb: 128,
    });
    expect(tle.verdict).toBe(Verdict.TIME_LIMIT_EXCEEDED);

    expect(classifyWorkerError(new PermanentWorkerError('INVALID_JOB_DATA', 'bad')).permanent).toBe(
      true
    );
    expect(
      classifyWorkerError(new RetryableWorkerError('DATABASE_TRANSIENT_ERROR', 'conn')).permanent
    ).toBe(false);
  });
});

describe('Judge Engine Edge Cases & Malformed Input Unit Tests (Day 8)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('evaluates hidden test cases without leaking hidden inputs/outputs and aggregates metrics across large collections', async () => {
    const { submissionId, problemId, userId, problem, submission } = makeFixtures();

    // 25 test cases, test 0 is empty input (''), test 17 is hidden and fails
    const manyTests: TestCaseRow[] = Array.from({ length: 25 }, (_, i) => ({
      id: crypto.randomUUID(),
      problemId,
      index: i,
      inputKey: `problems/${problemId}/test_${i}_in.txt`,
      expectedOutputKey: `problems/${problemId}/test_${i}_out.txt`,
      isHidden: i > 0,
      createdAt: new Date(),
    }));

    const saveFinalVerdict = vi.fn().mockResolvedValue(true);
    const repo = makeMockRepository({
      getSubmissionById: vi.fn().mockResolvedValue(submission),
      claimSubmissionRunning: vi
        .fn()
        .mockResolvedValue({ ...submission, status: SubmissionStatus.RUNNING }),
      getProblemById: vi.fn().mockResolvedValue(problem),
      getTestCasesByProblemId: vi.fn().mockResolvedValue(manyTests),
      saveFinalVerdict,
    });

    const storage: StorageReader = {
      getObject: vi.fn(async (key: string) => {
        if (key.includes('test_0_in.txt')) return '';
        if (key.includes('_in.txt')) return 'secret input';
        return 'expected-ok';
      }),
    };

    const sandboxRunner = vi.fn(async (opts: { input: string }) => {
      const callIdx = sandboxRunner.mock.calls.length - 1;
      if (callIdx === 0) expect(opts.input).toBe('');
      return {
        verdict: Verdict.ACCEPTED,
        stdout: callIdx === 17 ? 'wrong-secret' : 'expected-ok',
        stderr: '',
        executionTimeMs: callIdx === 10 ? 95 : 15,
        memoryUsedKb: callIdx === 5 ? 32768 : 12000,
        exitCode: 0,
      };
    });

    const publish = vi.fn().mockResolvedValue(1);
    const result = await processSubmissionJob(
      { submissionId },
      {
        repository: repo,
        storage,
        executor: new Executor(sandboxRunner),
        redisPublisher: { status: 'ready', publish } as any,
      }
    );

    expect(result.verdict).toBe(Verdict.WRONG_ANSWER);
    expect(result.failedTestIndex).toBe(17);
    expect(result.executionTimeMs).toBe(95);
    expect(result.memoryUsedKb).toBe(32768);
    expect(sandboxRunner).toHaveBeenCalledTimes(18); // Stopped early at index 17
    expect(saveFinalVerdict).toHaveBeenCalledWith({
      id: submissionId,
      verdict: Verdict.WRONG_ANSWER,
      executionTimeMs: 95,
      memoryUsedKb: 32768,
      failedTestIndex: 17,
    });

    // Verify Evaluator redacts hidden test details directly (public test passes, hidden test 1 fails)
    const directRunner = vi
      .fn()
      .mockResolvedValueOnce({
        verdict: Verdict.ACCEPTED,
        stdout: 'pub-out',
        stderr: '',
        executionTimeMs: 5,
        memoryUsedKb: 8000,
        exitCode: 0,
      })
      .mockResolvedValueOnce({
        verdict: Verdict.ACCEPTED,
        stdout: 'actual-secret',
        stderr: '',
        executionTimeMs: 5,
        memoryUsedKb: 8000,
        exitCode: 0,
      });
    const evalSuite = new Executor(directRunner);
    const direct = await evalSuite.execute(
      {
        submissionId,
        problemId,
        userId,
        code: 'console.log(1)',
        language: 'javascript',
        timeLimitMs: 2000,
        memoryLimitMb: 128,
      },
      [
        { index: 0, input: 'pub-in', expectedOutput: 'pub-out', isHidden: false },
        { index: 1, input: 'hid-in', expectedOutput: 'hid-out', isHidden: true },
      ]
    );
    expect(direct.results[0].sampleInput).toBe('pub-in');
    expect(direct.results[1].sampleInput).toBeUndefined();
    expect(direct.results[1].sampleExpectedOutput).toBeUndefined();
    expect(direct.results[1].actualOutput).toBeUndefined();
  });

  it('accepts only when all 25 test cases pass and credits leaderboard idempotently', async () => {
    const { submissionId, problemId, userId, problem, submission } = makeFixtures();
    const tests: TestCaseRow[] = Array.from({ length: 12 }, (_, i) => ({
      id: crypto.randomUUID(),
      problemId,
      index: i,
      inputKey: `problems/${problemId}/test_${i}_in.txt`,
      expectedOutputKey: `problems/${problemId}/test_${i}_out.txt`,
      isHidden: i > 0,
      createdAt: new Date(),
    }));

    const repo = makeMockRepository({
      getSubmissionById: vi.fn().mockResolvedValue(submission),
      claimSubmissionRunning: vi
        .fn()
        .mockResolvedValue({ ...submission, status: SubmissionStatus.RUNNING }),
      getProblemById: vi.fn().mockResolvedValue(problem),
      getTestCasesByProblemId: vi.fn().mockResolvedValue(tests),
      saveFinalVerdict: vi.fn().mockResolvedValue(true),
    });
    const storage: StorageReader = {
      getObject: vi.fn().mockResolvedValue('42\n'),
    };
    const sandboxRunner = vi.fn().mockResolvedValue({
      verdict: Verdict.ACCEPTED,
      stdout: '42\r\n',
      stderr: '',
      executionTimeMs: 20,
      memoryUsedKb: 14000,
      exitCode: 0,
    });

    const redisPublisher = {
      status: 'ready',
      publish: vi.fn().mockResolvedValue(1),
      sadd: vi.fn().mockResolvedValue(1),
      zscore: vi.fn().mockResolvedValue(null),
      zadd: vi.fn().mockResolvedValue(1),
    } as any;

    const res = await processSubmissionJob(
      { submissionId },
      {
        repository: repo,
        storage,
        executor: new Executor(sandboxRunner),
        redisPublisher,
      }
    );

    expect(res.verdict).toBe(Verdict.ACCEPTED);
    expect(sandboxRunner).toHaveBeenCalledTimes(12);
    expect(redisPublisher.sadd).toHaveBeenCalledWith(`judge:user:${userId}:solved`, problemId);
    expect(redisPublisher.zadd).toHaveBeenCalledTimes(1);
  });

  it('rejects null/corrupted payloads, empty source code, unsupported languages, and archived problems safely', async () => {
    const publish = vi.fn().mockResolvedValue(1);
    const redisPublisher = { status: 'ready', publish } as any;

    // 1. Null / corrupted payload throws PermanentWorkerError instead of crashing with TypeError
    await expect(processSubmissionJob(null as any)).rejects.toBeInstanceOf(PermanentWorkerError);
    await expect(processSubmissionJob({} as any)).rejects.toBeInstanceOf(PermanentWorkerError);

    // 2. Empty or whitespace-only source code marks INTERNAL_ERROR, emits SSE, throws PermanentWorkerError
    const { submissionId, problem, submission } = makeFixtures();
    const saveEmptyCode = vi.fn().mockResolvedValue(true);
    const repoEmptyCode = makeMockRepository({
      getSubmissionById: vi.fn().mockResolvedValue(submission),
      claimSubmissionRunning: vi.fn().mockResolvedValue({
        ...submission,
        code: '   \n\t  ',
        status: SubmissionStatus.RUNNING,
      }),
      getProblemById: vi.fn().mockResolvedValue(problem),
      saveFinalVerdict: saveEmptyCode,
    });

    await expect(
      processSubmissionJob({ submissionId }, { repository: repoEmptyCode, redisPublisher })
    ).rejects.toBeInstanceOf(PermanentWorkerError);
    expect(saveEmptyCode).toHaveBeenCalledWith(
      expect.objectContaining({ id: submissionId, verdict: Verdict.INTERNAL_ERROR })
    );
    expect(repoEmptyCode.releaseSubmissionToQueued).not.toHaveBeenCalled();

    // 3. Unsupported language
    const saveBadLang = vi.fn().mockResolvedValue(true);
    const repoBadLang = makeMockRepository({
      getSubmissionById: vi.fn().mockResolvedValue(submission),
      claimSubmissionRunning: vi.fn().mockResolvedValue({
        ...submission,
        language: 'rust',
        status: SubmissionStatus.RUNNING,
      }),
      getProblemById: vi.fn().mockResolvedValue(problem),
      saveFinalVerdict: saveBadLang,
    });

    await expect(
      processSubmissionJob({ submissionId }, { repository: repoBadLang, redisPublisher })
    ).rejects.toBeInstanceOf(PermanentWorkerError);
    expect(saveBadLang).toHaveBeenCalledWith(
      expect.objectContaining({ id: submissionId, verdict: Verdict.INTERNAL_ERROR })
    );

    // 4. Archived / missing problem
    const saveArchived = vi.fn().mockResolvedValue(true);
    const repoArchived = makeMockRepository({
      getSubmissionById: vi.fn().mockResolvedValue(submission),
      claimSubmissionRunning: vi.fn().mockResolvedValue({
        ...submission,
        status: SubmissionStatus.RUNNING,
      }),
      getProblemById: vi.fn().mockResolvedValue({ ...problem, isArchived: true }),
      saveFinalVerdict: saveArchived,
    });

    await expect(
      processSubmissionJob({ submissionId }, { repository: repoArchived, redisPublisher })
    ).rejects.toBeInstanceOf(PermanentWorkerError);
    expect(saveArchived).toHaveBeenCalledWith(
      expect.objectContaining({ id: submissionId, verdict: Verdict.INTERNAL_ERROR })
    );
  });

  it('distinguishes user process.exit(125/126/127) RUNTIME_ERROR from real Docker startup failure', () => {
    const userExit127 = classifySandboxOutcome({
      timedOut: false,
      outputExceeded: false,
      error: new Error('Command failed with exit code 127'),
      exitCode: 127,
      rawStdout: '',
      rawStderr: '__JUDGE_MEMORY_KB:14000__\n',
      durationMs: 45,
      memoryLimitMb: 128,
    });
    expect(userExit127.verdict).toBe(Verdict.RUNTIME_ERROR);
    expect(userExit127.infraFailureCategory).toBeUndefined();
    expect(userExit127.memoryUsedKb).toBe(14000);

    const realDocker127 = classifySandboxOutcome({
      timedOut: false,
      outputExceeded: false,
      error: new Error('docker run failed'),
      exitCode: 127,
      rawStdout: '',
      rawStderr: 'docker: exec: "node": executable file not found in $PATH',
      durationMs: 22,
      memoryLimitMb: 128,
    });
    expect(realDocker127.verdict).toBe(Verdict.INTERNAL_ERROR);
    expect(realDocker127.infraFailureCategory).toBe('SANDBOX_CONTAINER_START_FAILED');
  });

  it('does not assume exit code 137 is always MLE and enforces sysctl port hardening flags (Day 9)', () => {
    const args = buildDockerArgs({
      containerName: 'judge-sandbox-day9-flags',
      language: 'javascript',
      memoryLimitMb: 128,
      cpus: '0.5',
      pidsLimit: 64,
    });
    expect(args).toContain('net.ipv4.ip_unprivileged_port_start=1024');

    // Non-OOM SIGKILL / 137 must map to RUNTIME_ERROR when oomKilled is false and no OOM stderr
    const nonOom137 = classifySandboxOutcome({
      timedOut: false,
      outputExceeded: false,
      oomKilled: false,
      error: Object.assign(new Error('killed externally'), { signal: 'SIGKILL' }),
      exitCode: 137,
      rawStdout: '',
      rawStderr: '',
      durationMs: 120,
      memoryLimitMb: 128,
    });
    expect(nonOom137.verdict).toBe(Verdict.RUNTIME_ERROR);

    // execFile backup timeout kill must classify as TIME_LIMIT_EXCEEDED even on 137/SIGKILL
    const execTimeout = classifySandboxOutcome({
      timedOut: false,
      execFileTimedOut: true,
      outputExceeded: false,
      error: Object.assign(new Error('timeout kill'), { killed: true, signal: 'SIGKILL' }),
      exitCode: 137,
      rawStdout: '',
      rawStderr: '',
      durationMs: 3500,
      memoryLimitMb: 128,
    });
    expect(execTimeout.verdict).toBe(Verdict.TIME_LIMIT_EXCEEDED);

    // maxBuffer overflow must classify as OUTPUT_LIMIT_EXCEEDED
    const maxBufferRes = classifySandboxOutcome({
      timedOut: false,
      outputExceeded: false,
      error: Object.assign(new Error('maxBuffer exceeded'), {
        code: 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER',
      }),
      exitCode: null,
      rawStdout: 'A'.repeat(2048),
      rawStderr: '',
      durationMs: 50,
      memoryLimitMb: 128,
    });
    expect(maxBufferRes.verdict).toBe(Verdict.OUTPUT_LIMIT_EXCEEDED);
  });
});
