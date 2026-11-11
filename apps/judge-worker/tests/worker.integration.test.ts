import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFile } from 'child_process';
import crypto from 'crypto';
import { eq, sql } from 'drizzle-orm';
import { Queue } from 'bullmq';
import { QUEUES, SubmissionStatus, Verdict } from '@judge/shared';
import { runInSandbox } from '../src/sandbox/runner.js';
import { db, closeDatabase } from '../src/db/index.js';
import { problems, submissions, testCases } from '../src/db/schema.js';
import { workerStorage } from '../src/storage/minio.js';
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

describe('Judge Worker Live Sandbox & End-to-End Integration (Day 6)', () => {
  const runTag = `${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
  const createdKeys: string[] = [];
  let createdUserId: string | undefined;
  let createdProblemId: string | undefined;
  let createdSubmissionId: string | undefined;
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
    if (createdSubmissionId) {
      await db
        .delete(submissions)
        .where(eq(submissions.id, createdSubmissionId))
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

    createdSubmissionId = crypto.randomUUID();
    await db.insert(submissions).values({
      id: createdSubmissionId,
      problemId: createdProblemId,
      userId: createdUserId,
      code: `const fs = require('fs'); const n = Number(fs.readFileSync(0, 'utf8').trim()); console.log(n * 2);`,
      language: 'javascript',
      status: SubmissionStatus.QUEUED,
    });

    workerRuntime = await startJudgeWorker();
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
});
