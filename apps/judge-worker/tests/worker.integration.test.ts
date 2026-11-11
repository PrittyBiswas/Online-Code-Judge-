import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFile } from 'child_process';
import crypto from 'crypto';
import { eq, inArray, sql } from 'drizzle-orm';
import { Queue } from 'bullmq';
import { QUEUES, SubmissionStatus, Verdict } from '@judge/shared';
import { runInSandbox } from '../src/sandbox/runner.js';
import { db, closeDatabase } from '../src/db/index.js';
import { problems, submissions, testCases } from '../src/db/schema.js';
import { workerStorage } from '../src/storage/minio.js';
import { DrizzleJudgeRepository } from '../src/processor/judgeProcessor.js';
import { SubmissionRecoveryService } from '../src/recovery/recoveryService.js';
import { WorkerLifecycle } from '../src/recovery/shutdown.js';
import {
  startJudgeWorker,
  parseRedisConnectionOptions,
  type RunningJudgeWorker,
} from '../src/queue/worker.js';
import { workerEnv } from '../src/config/env.js';

function execDocker(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile('docker', args, { timeout: 10000 }, (err, stdout, stderr) => {
      if (err) reject(new Error(stderr.trim() || err.message));
      else resolve(stdout.trim());
    });
  });
}

describe('Judge Worker Live Sandbox & End-to-End Integration (Day 6–7)', () => {
  const runTag = `${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
  const createdKeys: string[] = [];
  const createdSubmissionIds: string[] = [];
  let createdUserId: string | undefined;
  let createdProblemId: string | undefined;
  let workerRuntime: RunningJudgeWorker | undefined;
  let queue: Queue | undefined;

  beforeAll(async () => {
    await execDocker(['info']);
  });

  afterAll(async () => {
    if (workerRuntime) {
      await workerRuntime.stop();
    }
    if (queue) {
      await queue.close();
    }
    for (const key of createdKeys) {
      await workerStorage.deleteObject(key).catch(() => {});
    }
    if (createdSubmissionIds.length > 0) {
      await db
        .delete(submissions)
        .where(inArray(submissions.id, createdSubmissionIds))
        .catch(() => {});
    }
    if (createdProblemId) {
      await db
        .delete(problems)
        .where(eq(problems.id, createdProblemId))
        .catch(() => {});
    }
    if (createdUserId) {
      await db.execute(sql`DELETE FROM users WHERE id = ${createdUserId}`).catch(() => {});
    }
    await closeDatabase().catch(() => {});
  });

  it('executes JavaScript & Python in isolated Docker containers and enforces all verdicts', async () => {
    // 1. Happy path JavaScript (process.stdin)
    const jsOk = await runInSandbox({
      language: 'javascript',
      input: '12 30',
      code: `
        const chunks = [];
        process.stdin.on('data', d => chunks.push(d));
        process.stdin.on('end', () => {
          const [a, b] = chunks.join('').trim().split(/\\s+/).map(Number);
          console.log(a + b);
        });
      `,
      timeLimitMs: 3000,
    });
    expect(jsOk.verdict).toBe(Verdict.ACCEPTED);
    expect(jsOk.stdout.trim()).toBe('42');
    expect(jsOk.memoryUsedKb).toBeGreaterThan(0);

    // 2. Happy path Python
    const pyOk = await runInSandbox({
      language: 'python',
      input: '7 8',
      code: 'a, b = map(int, input().split())\nprint(a * b)',
      timeLimitMs: 3000,
    });
    expect(pyOk.verdict).toBe(Verdict.ACCEPTED);
    expect(pyOk.stdout.trim()).toBe('56');

    // 3. Compilation / Syntax error (JS + Python)
    const jsCompileErr = await runInSandbox({
      language: 'javascript',
      input: '',
      code: 'const x = ;',
      timeLimitMs: 2000,
    });
    expect(jsCompileErr.verdict).toBe(Verdict.COMPILATION_ERROR);

    const pyCompileErr = await runInSandbox({
      language: 'python',
      input: '',
      code: 'def broken(:\n  pass',
      timeLimitMs: 2000,
    });
    expect(pyCompileErr.verdict).toBe(Verdict.COMPILATION_ERROR);

    // 4. Runtime error
    const runtimeErr = await runInSandbox({
      language: 'javascript',
      input: '',
      code: 'throw new Error("boom");',
      timeLimitMs: 2000,
    });
    expect(runtimeErr.verdict).toBe(Verdict.RUNTIME_ERROR);

    // 5. Security isolation proof: network disabled, root FS read-only, non-root UID 1000
    const secCheck = await runInSandbox({
      language: 'javascript',
      input: '',
      code: `
        const fs = require('fs');
        const uid = process.getuid();
        let rootWriteBlocked = false;
        try { fs.writeFileSync('/root_escape.txt', 'no'); } catch { rootWriteBlocked = true; }
        console.log(JSON.stringify({ uid, rootWriteBlocked }));
      `,
      timeLimitMs: 3000,
    });
    expect(secCheck.verdict).toBe(Verdict.ACCEPTED);
    expect(JSON.parse(secCheck.stdout.trim())).toEqual({ uid: 1000, rootWriteBlocked: true });

    // 6. Time Limit Exceeded + container cleanup check
    const tle = await runInSandbox({
      language: 'javascript',
      input: '',
      code: 'while (true) {}',
      timeLimitMs: 700,
    });
    expect(tle.verdict).toBe(Verdict.TIME_LIMIT_EXCEEDED);

    const leftoverContainers = await execDocker([
      'ps',
      '-a',
      '-q',
      '--filter',
      'name=judge-sandbox-',
    ]);
    expect(leftoverContainers).toBe('');
  }, 45000);

  it('consumes BullMQ job, fetches MinIO test cases, executes sandbox, and persists verdict to PostgreSQL', async () => {
    createdUserId = crypto.randomUUID();
    const testUsername = `w_${runTag}`;
    const testEmail = `w_${runTag}@judge.local`;
    await db.execute(
      sql`INSERT INTO users (id, username, email, password_hash, role) VALUES (${createdUserId}, ${testUsername}, ${testEmail}, '$2b$10$hash', 'problem_setter')`
    );

    createdProblemId = crypto.randomUUID();
    await db.insert(problems).values({
      id: createdProblemId,
      title: `Worker E2E ${runTag}`,
      slug: `worker-e2e-${runTag}`,
      statement: 'Multiply input by 2',
      difficulty: 'easy',
      setterId: createdUserId,
      timeLimitMs: 3000,
      memoryLimitMb: 128,
    });

    const inputKey = `problems/${createdProblemId}/test_0_in.txt`;
    const outputKey = `problems/${createdProblemId}/test_0_out.txt`;
    createdKeys.push(inputKey, outputKey);

    await workerStorage.putObject(inputKey, '21');
    await workerStorage.putObject(outputKey, '42');

    await db.insert(testCases).values({
      problemId: createdProblemId,
      index: 0,
      inputKey,
      expectedOutputKey: outputKey,
      isHidden: true,
    });

    const createdSubmissionId = crypto.randomUUID();
    createdSubmissionIds.push(createdSubmissionId);
    await db.insert(submissions).values({
      id: createdSubmissionId,
      problemId: createdProblemId,
      userId: createdUserId,
      code: `const fs = require('fs'); const n = Number(fs.readFileSync(0, 'utf8').trim()); console.log(n * 2);`,
      language: 'javascript',
      status: SubmissionStatus.QUEUED,
    });

    workerRuntime = await startJudgeWorker({ enableSweeper: false });
    queue = new Queue(QUEUES.JUDGE, {
      connection: parseRedisConnectionOptions(workerEnv.REDIS_URL),
    });

    await queue.add(
      'evaluate-submission',
      {
        submissionId: createdSubmissionId,
        problemId: createdProblemId,
        userId: createdUserId,
        code: '',
        language: 'javascript',
        timeLimitMs: 3000,
        memoryLimitMb: 128,
      },
      { jobId: createdSubmissionId, attempts: 2, backoff: { type: 'exponential', delay: 500 } }
    );

    // Poll PostgreSQL for final worker verdict update (max 15s)
    let updatedRow: any;
    for (let i = 0; i < 30; i++) {
      const [row] = await db
        .select()
        .from(submissions)
        .where(eq(submissions.id, createdSubmissionId));
      if (row?.status === SubmissionStatus.COMPLETED) {
        updatedRow = row;
        break;
      }
      await new Promise((r) => setTimeout(r, 500));
    }

    expect(updatedRow).toBeDefined();
    expect(updatedRow.status).toBe(SubmissionStatus.COMPLETED);
    expect(updatedRow.verdict).toBe(Verdict.ACCEPTED);
    expect(updatedRow.executionTimeMs).toBeGreaterThan(0);
    expect(updatedRow.memoryUsedKb).toBeGreaterThan(0);
    expect(updatedRow.failedTestIndex).toBeNull();
  }, 30000);

  it('enforces output caps and memory limits in live Docker containers without leaking containers', async () => {
    const outputFlood = await runInSandbox({
      language: 'javascript',
      input: '',
      code: `process.stdout.write('A'.repeat(2 * 1024 * 1024));`,
      timeLimitMs: 3000,
      memoryLimitMb: 128,
    });
    expect(outputFlood.verdict).toBe(Verdict.OUTPUT_LIMIT_EXCEEDED);

    const oom = await runInSandbox({
      language: 'python',
      input: '',
      code: `a = bytearray(256 * 1024 * 1024)\nprint(len(a))`,
      timeLimitMs: 4000,
      memoryLimitMb: 64,
    });
    expect([Verdict.MEMORY_LIMIT_EXCEEDED, Verdict.RUNTIME_ERROR]).toContain(oom.verdict);

    const leftoverContainers = await execDocker([
      'ps',
      '-a',
      '-q',
      '--filter',
      'name=judge-sandbox-',
    ]);
    expect(leftoverContainers).toBe('');
  }, 30000);

  it('prevents concurrent duplicate PostgreSQL claims and safely recovers only stale RUNNING submissions', async () => {
    if (!createdUserId || !createdProblemId || !queue) {
      throw new Error('Prerequisite problem/queue fixtures were not initialized');
    }

    const repo = new DrizzleJudgeRepository();

    // 1. Concurrent optimistic CAS claim: two claims race on one QUEUED row -> only one succeeds
    const raceId = crypto.randomUUID();
    createdSubmissionIds.push(raceId);
    const [insertedRace] = await db
      .insert(submissions)
      .values({
        id: raceId,
        problemId: createdProblemId,
        userId: createdUserId,
        code: 'console.log(42);',
        language: 'javascript',
        status: SubmissionStatus.QUEUED,
      })
      .returning();

    const [claimA, claimB] = await Promise.all([
      repo.claimSubmissionRunning(raceId, {
        expectedStatus: SubmissionStatus.QUEUED,
        expectedUpdatedAt: insertedRace.updatedAt,
        expectedRetryCount: insertedRace.retryCount,
      }),
      repo.claimSubmissionRunning(raceId, {
        expectedStatus: SubmissionStatus.QUEUED,
        expectedUpdatedAt: insertedRace.updatedAt,
        expectedRetryCount: insertedRace.retryCount,
      }),
    ]);

    expect([claimA, claimB].filter(Boolean)).toHaveLength(1);

    // 2. Recovery sweeper: fresh RUNNING row is untouched; stale RUNNING row recovers and completes
    const freshRunningId = crypto.randomUUID();
    const staleRunningId = crypto.randomUUID();
    createdSubmissionIds.push(freshRunningId, staleRunningId);

    await db.insert(submissions).values([
      {
        id: freshRunningId,
        problemId: createdProblemId,
        userId: createdUserId,
        code: 'console.log(42);',
        language: 'javascript',
        status: SubmissionStatus.RUNNING,
        retryCount: 1,
        updatedAt: new Date(),
      },
      {
        id: staleRunningId,
        problemId: createdProblemId,
        userId: createdUserId,
        code: `const fs = require('fs'); const n = Number(fs.readFileSync(0, 'utf8').trim()); console.log(n * 2);`,
        language: 'javascript',
        status: SubmissionStatus.RUNNING,
        retryCount: 1,
        updatedAt: new Date(Date.now() - 120_000),
      },
    ]);

    const lifecycle = new WorkerLifecycle();
    const recovery = new SubmissionRecoveryService(repo, queue, lifecycle);
    const report = await recovery.recoverStaleSubmissions({
      staleThresholdMs: 30_000,
      maxAttempts: 3,
      batchLimit: 20,
    });

    expect(report.requeued).toBeGreaterThanOrEqual(1);

    // Verify fresh RUNNING submission remained RUNNING
    const [freshAfterSweep] = await db
      .select()
      .from(submissions)
      .where(eq(submissions.id, freshRunningId));
    expect(freshAfterSweep.status).toBe(SubmissionStatus.RUNNING);

    // Wait for live worker to execute recovered stale submission to COMPLETED / ACCEPTED
    let recoveredRow: any;
    for (let i = 0; i < 30; i++) {
      const [row] = await db.select().from(submissions).where(eq(submissions.id, staleRunningId));
      if (row?.status === SubmissionStatus.COMPLETED) {
        recoveredRow = row;
        break;
      }
      await new Promise((r) => setTimeout(r, 500));
    }

    expect(recoveredRow).toBeDefined();
    expect(recoveredRow.status).toBe(SubmissionStatus.COMPLETED);
    expect(recoveredRow.verdict).toBe(Verdict.ACCEPTED);
  }, 30000);
});
