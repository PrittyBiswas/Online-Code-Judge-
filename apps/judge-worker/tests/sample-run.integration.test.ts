import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Queue } from 'bullmq';
import crypto from 'crypto';
import { QUEUES, REDIS_KEYS, SampleRunJobData, SampleRunResult } from '@judge/shared';
import {
  startJudgeWorker,
  parseRedisConnectionOptions,
  RunningJudgeWorker,
} from '../src/queue/worker.js';
import { workerEnv } from '../src/config/env.js';

describe('Day 14 Live Integration: Sample Run Queue + Host Worker + Docker Sandbox', () => {
  let running: RunningJudgeWorker;
  let sampleQueue: Queue<SampleRunJobData>;
  const createdRedisKeys: string[] = [];

  beforeAll(async () => {
    running = await startJudgeWorker({ enableSweeper: false });
    sampleQueue = new Queue<SampleRunJobData>(QUEUES.SAMPLE_RUN, {
      connection: parseRedisConnectionOptions(workerEnv.REDIS_URL),
    });
  }, 30000);

  afterAll(async () => {
    for (const key of createdRedisKeys) {
      await running?.redisPublisher.del(key).catch(() => {});
    }
    await sampleQueue?.close().catch(() => {});
    await running?.stop();
  }, 30000);

  async function waitForSampleResult(runId: string): Promise<SampleRunResult> {
    const key = REDIS_KEYS.SAMPLE_RUN_JOB(runId);
    const deadline = Date.now() + 25000;
    while (Date.now() < deadline) {
      const raw = await running.redisPublisher.get(key);
      if (raw) {
        const parsed = JSON.parse(raw) as SampleRunResult;
        if (parsed.status === 'COMPLETED' || parsed.status === 'FAILED') {
          return parsed;
        }
      }
      await new Promise((r) => setTimeout(r, 250));
    }
    throw new Error(`Timed out waiting for sample run ${runId}`);
  }

  it('executes JavaScript and Python sample runs in isolated Docker sandboxes', async () => {
    const jsRunId = crypto.randomUUID();
    const pyRunId = crypto.randomUUID();
    createdRedisKeys.push(REDIS_KEYS.SAMPLE_RUN_JOB(jsRunId), REDIS_KEYS.SAMPLE_RUN_JOB(pyRunId));

    await sampleQueue.add(
      'run-sample',
      {
        type: 'SAMPLE_RUN',
        runId: jsRunId,
        problemId: crypto.randomUUID(),
        userId: crypto.randomUUID(),
        code: "const fs = require('fs'); console.log(Number(fs.readFileSync(0, 'utf8').trim()) * 2);",
        language: 'javascript',
        sampleInput: '21',
        timeLimitMs: 2000,
        memoryLimitMb: 128,
      },
      { jobId: jsRunId }
    );

    const jsRes = await waitForSampleResult(jsRunId);
    expect(jsRes.status).toBe('COMPLETED');
    expect(jsRes.outcome).toBe('SUCCESS');
    expect(jsRes.stdout?.trim()).toBe('42');

    await sampleQueue.add(
      'run-sample',
      {
        type: 'SAMPLE_RUN',
        runId: pyRunId,
        problemId: crypto.randomUUID(),
        userId: crypto.randomUUID(),
        code: 'import sys\nprint(int(sys.stdin.read().strip()) + 8)',
        language: 'python',
        sampleInput: '34',
        timeLimitMs: 2000,
        memoryLimitMb: 128,
      },
      { jobId: pyRunId }
    );

    const pyRes = await waitForSampleResult(pyRunId);
    expect(pyRes.status).toBe('COMPLETED');
    expect(pyRes.outcome).toBe('SUCCESS');
    expect(pyRes.stdout?.trim()).toBe('42');
  }, 45000);

  it('enforces Docker timeout and output-limit protections on sample runs', async () => {
    const tleRunId = crypto.randomUUID();
    const oleRunId = crypto.randomUUID();
    createdRedisKeys.push(REDIS_KEYS.SAMPLE_RUN_JOB(tleRunId), REDIS_KEYS.SAMPLE_RUN_JOB(oleRunId));

    await sampleQueue.add(
      'run-sample',
      {
        type: 'SAMPLE_RUN',
        runId: tleRunId,
        problemId: crypto.randomUUID(),
        userId: crypto.randomUUID(),
        code: 'while (true) {}',
        language: 'javascript',
        sampleInput: '',
        timeLimitMs: 500,
        memoryLimitMb: 128,
      },
      { jobId: tleRunId }
    );

    const tleRes = await waitForSampleResult(tleRunId);
    expect(tleRes.status).toBe('COMPLETED');
    expect(tleRes.outcome).toBe('TIME_LIMIT_EXCEEDED');

    await sampleQueue.add(
      'run-sample',
      {
        type: 'SAMPLE_RUN',
        runId: oleRunId,
        problemId: crypto.randomUUID(),
        userId: crypto.randomUUID(),
        code: "process.stdout.write('A'.repeat(200000));",
        language: 'javascript',
        sampleInput: '',
        timeLimitMs: 2000,
        memoryLimitMb: 128,
      },
      { jobId: oleRunId }
    );

    const oleRes = await waitForSampleResult(oleRunId);
    expect(oleRes.status).toBe('COMPLETED');
    expect(oleRes.outcome).toBe('OUTPUT_LIMIT_EXCEEDED');
  }, 45000);
});
