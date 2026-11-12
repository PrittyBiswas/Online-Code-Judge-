import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFile } from 'child_process';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import crypto from 'crypto';
import Redis from 'ioredis';
import { eq, inArray, sql } from 'drizzle-orm';
import { Queue } from 'bullmq';
import { QUEUES, REDIS_KEYS, SubmissionStatus, Verdict } from '@judge/shared';
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

describe('Judge Worker Live Sandbox & End-to-End Integration (Day 6–8)', () => {
  const runTag = `${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
  const createdKeys: string[] = [];
  const createdSubmissionIds: string[] = [];
  const createdProblemIds: string[] = [];
  let createdUserId: string | undefined;
  let createdProblemId: string | undefined;
  let workerRuntime: RunningJudgeWorker | undefined;
  let queue: Queue | undefined;
  let redisCleanupClient: Redis | undefined;

  beforeAll(async () => {
    await execDocker(['info']);
    redisCleanupClient = new Redis(workerEnv.REDIS_URL, { lazyConnect: true });
    await redisCleanupClient.connect();
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
    if (createdProblemIds.length > 0) {
      await db
        .delete(problems)
        .where(inArray(problems.id, createdProblemIds))
        .catch(() => {});
    }
    if (createdUserId) {
      if (redisCleanupClient?.status === 'ready') {
        await redisCleanupClient.del(`judge:user:${createdUserId}:solved`).catch(() => {});
        await redisCleanupClient.zrem(REDIS_KEYS.GLOBAL_LEADERBOARD, createdUserId).catch(() => {});
      }
      await db.execute(sql`DELETE FROM users WHERE id = ${createdUserId}`).catch(() => {});
    }
    if (redisCleanupClient) {
      await redisCleanupClient.quit().catch(() => {});
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
    createdProblemIds.push(createdProblemId);
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

  it('handles JavaScript & Python edge cases: empty/Unicode/CRLF/large I/O, immediate exit, exit-127, Python TLE/RE', async () => {
    // 1. Empty input & immediate zero-output exit (JS & Python)
    const jsEmpty = await runInSandbox({
      language: 'javascript',
      input: '',
      code: 'process.exit(0);',
      timeLimitMs: 2000,
    });
    expect(jsEmpty.verdict).toBe(Verdict.ACCEPTED);
    expect(jsEmpty.stdout).toBe('');

    const pyEmpty = await runInSandbox({
      language: 'python',
      input: '',
      code: 'import sys\nsys.exit(0)',
      timeLimitMs: 2000,
    });
    expect(pyEmpty.verdict).toBe(Verdict.ACCEPTED);
    expect(pyEmpty.stdout).toBe('');

    // 2. Multi-line CRLF + Unicode handling
    const pyUnicode = await runInSandbox({
      language: 'python',
      input: 'café 🚀\r\nα+β\r\n',
      code: 'import sys\nlines = sys.stdin.read().splitlines()\nprint("|".join(lines))',
      timeLimitMs: 3000,
    });
    expect(pyUnicode.verdict).toBe(Verdict.ACCEPTED);
    expect(pyUnicode.stdout.trim()).toBe('café 🚀|α+β');

    // 3. Large input (120 KB) & large valid output (120 KB under custom cap) in JS & Python
    const largeLine = 'X'.repeat(120 * 1024);
    const jsLarge = await runInSandbox({
      language: 'javascript',
      input: largeLine,
      code: `const fs = require('fs'); const s = fs.readFileSync(0, 'utf8'); console.log(s.length); process.stdout.write(s);`,
      timeLimitMs: 3000,
      maxOutputBytes: 256 * 1024,
    });
    expect(jsLarge.verdict).toBe(Verdict.ACCEPTED);
    expect(jsLarge.stdout.startsWith(`${120 * 1024}\n`)).toBe(true);
    expect(jsLarge.stdout.trimEnd().endsWith('XXXX')).toBe(true);

    const pyLarge = await runInSandbox({
      language: 'python',
      input: largeLine,
      code: `import sys\ns = sys.stdin.read()\nprint(len(s))`,
      timeLimitMs: 3000,
    });
    expect(pyLarge.verdict).toBe(Verdict.ACCEPTED);
    expect(pyLarge.stdout.trim()).toBe(String(120 * 1024));

    // 4. Regression: user process.exit(127) / sys.exit(125) must be RUNTIME_ERROR, not SANDBOX_CONTAINER_START_FAILED
    const jsExit127 = await runInSandbox({
      language: 'javascript',
      input: '',
      code: 'process.exit(127);',
      timeLimitMs: 2000,
    });
    expect(jsExit127.verdict).toBe(Verdict.RUNTIME_ERROR);
    expect(jsExit127.infraFailureCategory).toBeUndefined();

    const pyExit125 = await runInSandbox({
      language: 'python',
      input: '',
      code: 'import sys\nsys.exit(125)',
      timeLimitMs: 2000,
    });
    expect(pyExit125.verdict).toBe(Verdict.RUNTIME_ERROR);
    expect(pyExit125.infraFailureCategory).toBeUndefined();

    // 5. Python runtime exception & infinite loop TLE
    const pyRe = await runInSandbox({
      language: 'python',
      input: '',
      code: 'print(1 / 0)',
      timeLimitMs: 2000,
    });
    expect(pyRe.verdict).toBe(Verdict.RUNTIME_ERROR);

    const pyTle = await runInSandbox({
      language: 'python',
      input: '',
      code: 'while True:\n  pass',
      timeLimitMs: 700,
    });
    expect(pyTle.verdict).toBe(Verdict.TIME_LIMIT_EXCEEDED);
  }, 45000);

  it('blocks network, root filesystem writes, privilege escalation, and fork bombs inside Docker without leaking containers', async () => {
    const attackRoot = resolve(__dirname, '../../../attack-suite');

    const netRes = await runInSandbox({
      language: 'javascript',
      input: '',
      code: readFileSync(resolve(attackRoot, 'network-attempt/index.js'), 'utf8'),
      timeLimitMs: 3000,
    });
    expect([Verdict.RUNTIME_ERROR, Verdict.TIME_LIMIT_EXCEEDED]).toContain(netRes.verdict);
    expect(netRes.stdout).not.toContain('NETWORK BREACH');

    // Direct TCP dial without DNS must fail immediately with ENETUNREACH -> RUNTIME_ERROR
    const directTcpRes = await runInSandbox({
      language: 'javascript',
      input: '',
      code: `const net = require('net'); const s = net.connect(80, '1.1.1.1'); s.on('error', () => process.exit(1));`,
      timeLimitMs: 2000,
    });
    expect(directTcpRes.verdict).toBe(Verdict.RUNTIME_ERROR);

    const fsRes = await runInSandbox({
      language: 'javascript',
      input: '',
      code: readFileSync(resolve(attackRoot, 'file-access/index.js'), 'utf8'),
      timeLimitMs: 3000,
    });
    expect(fsRes.verdict).toBe(Verdict.RUNTIME_ERROR);
    expect(fsRes.stdout).not.toContain('ROOT FS WRITE BREACH');

    const privRes = await runInSandbox({
      language: 'javascript',
      input: '',
      code: readFileSync(resolve(attackRoot, 'privilege-check/index.js'), 'utf8'),
      timeLimitMs: 3000,
    });
    // Non-root UID/GID 1000, su blocked, and chmod +s blocked are always enforced even when
    // WSL2/LinuxKit sets ip_unprivileged_port_start=0 inside isolated --network none namespaces.
    expect([Verdict.RUNTIME_ERROR, Verdict.ACCEPTED]).toContain(privRes.verdict);
    expect(privRes.stdout).toContain('Running as UID: 1000');
    expect(privRes.stdout).toContain('su blocked (expected)');
    expect(privRes.stdout).toContain('chmod +s blocked (expected)');
    expect(privRes.stdout).not.toContain('SU BREACH');
    expect(privRes.stdout).not.toContain('SETUID BREACH');

    const forkRes = await runInSandbox({
      language: 'javascript',
      input: '',
      code: readFileSync(resolve(attackRoot, 'fork-bomb/index.js'), 'utf8'),
      timeLimitMs: 1200,
    });
    expect([Verdict.RUNTIME_ERROR, Verdict.TIME_LIMIT_EXCEEDED]).toContain(forkRes.verdict);

    const leftoverContainers = await execDocker([
      'ps',
      '-a',
      '-q',
      '--filter',
      'name=judge-sandbox-',
    ]);
    expect(leftoverContainers).toBe('');
  }, 45000);

  it('processes multi-test hidden+public submissions end-to-end with SSE events and idempotent leaderboard credit', async () => {
    if (!createdUserId || !queue || !redisCleanupClient) {
      throw new Error('Prerequisite user/queue/redis fixtures were not initialized');
    }

    const multiProblemId = crypto.randomUUID();
    createdProblemIds.push(multiProblemId);
    await db.insert(problems).values({
      id: multiProblemId,
      title: `Day8 MultiTest ${runTag}`,
      slug: `day8-multitest-${runTag}`,
      statement: 'Sum two integers',
      difficulty: 'easy',
      setterId: createdUserId,
      timeLimitMs: 3000,
      memoryLimitMb: 128,
    });

    const cases = [
      { index: 0, inData: '2 3', outData: '5', isHidden: false },
      { index: 1, inData: '100 200', outData: '300', isHidden: true },
      { index: 2, inData: '0 0', outData: '0', isHidden: true },
    ];
    for (const c of cases) {
      const inKey = `problems/${multiProblemId}/test_${c.index}_in.txt`;
      const outKey = `problems/${multiProblemId}/test_${c.index}_out.txt`;
      createdKeys.push(inKey, outKey);
      await workerStorage.putObject(inKey, c.inData);
      await workerStorage.putObject(outKey, c.outData);
      await db.insert(testCases).values({
        problemId: multiProblemId,
        index: c.index,
        inputKey: inKey,
        expectedOutputKey: outKey,
        isHidden: c.isHidden,
      });
    }

    const receivedEvents: Array<{ submissionId: string; status: string; verdict?: string }> = [];
    const subClient = new Redis(workerEnv.REDIS_URL, { lazyConnect: true });
    await subClient.connect();
    await subClient.subscribe(REDIS_KEYS.CHANNEL_SUBMISSION_EVENTS);
    subClient.on('message', (_channel, raw) => {
      try {
        receivedEvents.push(JSON.parse(raw));
      } catch {}
    });

    try {
      // 1. Passing Python submission -> ACCEPTED + SSE + Leaderboard increment
      const acSubId = crypto.randomUUID();
      createdSubmissionIds.push(acSubId);
      await db.insert(submissions).values({
        id: acSubId,
        problemId: multiProblemId,
        userId: createdUserId,
        code: 'a, b = map(int, input().split())\nprint(a + b)',
        language: 'python',
        status: SubmissionStatus.QUEUED,
      });

      const scoreBefore = await redisCleanupClient.zscore(
        REDIS_KEYS.GLOBAL_LEADERBOARD,
        createdUserId
      );

      await queue.add(
        'evaluate-submission',
        {
          submissionId: acSubId,
          problemId: multiProblemId,
          userId: createdUserId,
          code: '',
          language: 'python',
          timeLimitMs: 3000,
          memoryLimitMb: 128,
        },
        { jobId: acSubId, attempts: 2 }
      );

      let acRow: any;
      for (let i = 0; i < 30; i++) {
        const [row] = await db.select().from(submissions).where(eq(submissions.id, acSubId));
        if (row?.status === SubmissionStatus.COMPLETED) {
          acRow = row;
          break;
        }
        await new Promise((r) => setTimeout(r, 400));
      }

      expect(acRow?.verdict).toBe(Verdict.ACCEPTED);
      expect(acRow?.failedTestIndex).toBeNull();

      await new Promise((r) => setTimeout(r, 200));
      const acEvents = receivedEvents.filter((e) => e.submissionId === acSubId);
      expect(acEvents.some((e) => e.status === SubmissionStatus.RUNNING)).toBe(true);
      expect(acEvents.some((e) => e.verdict === Verdict.ACCEPTED)).toBe(true);

      const solvedMember = await redisCleanupClient.sismember(
        `judge:user:${createdUserId}:solved`,
        multiProblemId
      );
      expect(solvedMember).toBe(1);
      const scoreAfterAc = await redisCleanupClient.zscore(
        REDIS_KEYS.GLOBAL_LEADERBOARD,
        createdUserId
      );
      expect(scoreAfterAc).not.toBeNull();
      expect(Number(scoreAfterAc)).toBeGreaterThan(Number(scoreBefore ?? 0));

      // 2. Hardcoded sample output passes public test 0, fails hidden test 1 -> WRONG_ANSWER @ 1
      const waSubId = crypto.randomUUID();
      createdSubmissionIds.push(waSubId);
      await db.insert(submissions).values({
        id: waSubId,
        problemId: multiProblemId,
        userId: createdUserId,
        code: 'console.log(5);',
        language: 'javascript',
        status: SubmissionStatus.QUEUED,
      });

      await queue.add(
        'evaluate-submission',
        {
          submissionId: waSubId,
          problemId: multiProblemId,
          userId: createdUserId,
          code: '',
          language: 'javascript',
          timeLimitMs: 3000,
          memoryLimitMb: 128,
        },
        { jobId: waSubId, attempts: 2 }
      );

      let waRow: any;
      for (let i = 0; i < 30; i++) {
        const [row] = await db.select().from(submissions).where(eq(submissions.id, waSubId));
        if (row?.status === SubmissionStatus.COMPLETED) {
          waRow = row;
          break;
        }
        await new Promise((r) => setTimeout(r, 400));
      }

      expect(waRow?.verdict).toBe(Verdict.WRONG_ANSWER);
      expect(waRow?.failedTestIndex).toBe(1);

      await new Promise((r) => setTimeout(r, 200));
      const waEvents = receivedEvents.filter((e) => e.submissionId === waSubId);
      expect(waEvents.some((e) => e.verdict === Verdict.WRONG_ANSWER)).toBe(true);
      const scoreAfterWa = await redisCleanupClient.zscore(
        REDIS_KEYS.GLOBAL_LEADERBOARD,
        createdUserId
      );
      expect(scoreAfterWa).toBe(scoreAfterAc);
    } finally {
      await subClient.quit().catch(() => {});
    }
  }, 30000);
});
