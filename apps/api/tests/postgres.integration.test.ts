import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Server } from 'http';
import crypto from 'crypto';
import { eq, inArray } from 'drizzle-orm';
import { Role, ProblemDifficulty, REDIS_KEYS, SubmissionStatus, Verdict } from '@judge/shared';
import { db, checkDatabaseConnection, closeDatabase } from '../src/db/index.js';
import { redisClient, redisSubscriber, isRedisHealthy } from '../src/config/redis.js';
import { problems, submissions, testCases, users } from '../src/db/schema.js';
import { authService } from '../src/modules/auth/auth.service.js';
import { usersService } from '../src/modules/users/users.service.js';
import { problemsService } from '../src/modules/problems/problems.service.js';
import { submissionsService } from '../src/modules/submissions/submissions.service.js';
import { leaderboardService } from '../src/modules/leaderboard/leaderboard.service.js';
import { AppError } from '../src/utils/app-error.js';
import { app } from '../src/app.js';

let server: Server;
let baseUrl: string;

async function dispatchHttp(
  method: string,
  url: string,
  options: { body?: unknown; headers?: Record<string, string> } = {}
): Promise<{ status: number; body: any; setCookies: string[]; cookieHeader: string }> {
  const res = await fetch(`${baseUrl}${url}`, {
    method,
    headers: {
      ...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {}),
    },
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });
  const text = await res.text();
  const setCookies =
    typeof res.headers.getSetCookie === 'function'
      ? res.headers.getSetCookie()
      : res.headers.get('set-cookie')
        ? [res.headers.get('set-cookie') as string]
        : [];
  const cookieHeader = setCookies.map((c) => c.split(';')[0]).join('; ');
  return {
    status: res.status,
    body: text ? JSON.parse(text) : null,
    setCookies,
    cookieHeader,
  };
}

describe('Day 5 PostgreSQL CRUD Integration Tests', () => {
  const runTag = `${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
  const createdUserIds: string[] = [];
  const createdProblemIds: string[] = [];

  beforeAll(async () => {
    const connected = await checkDatabaseConnection();
    if (!connected) {
      throw new Error(
        'PostgreSQL is unreachable for integration tests. Start Docker Postgres and verify DATABASE_URL.'
      );
    }

    if (redisClient.status === 'wait') {
      await redisClient.connect();
    }
    if (redisSubscriber.status === 'wait') {
      await redisSubscriber.connect();
    }
    await new Promise((r) => setTimeout(r, 100));

    await new Promise<void>((resolve) => {
      server = app.listen(0, '127.0.0.1', () => {
        const addr = server.address();
        if (!addr || typeof addr === 'string') {
          throw new Error('Failed to bind ephemeral HTTP port');
        }
        baseUrl = `http://127.0.0.1:${addr.port}`;
        resolve();
      });
    });
  });

  afterAll(async () => {
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
    if (createdProblemIds.length > 0) {
      await db.delete(submissions).where(inArray(submissions.problemId, createdProblemIds));
      await db.delete(problems).where(inArray(problems.id, createdProblemIds));
    }
    if (createdUserIds.length > 0) {
      await db.delete(submissions).where(inArray(submissions.userId, createdUserIds));
      await db.delete(problems).where(inArray(problems.setterId, createdUserIds));
      await db.delete(users).where(inArray(users.id, createdUserIds));
      if (isRedisHealthy()) {
        for (const uid of createdUserIds) {
          await redisClient.del(`judge:user:${uid}:solved`).catch(() => {});
          await redisClient.zrem(REDIS_KEYS.GLOBAL_LEADERBOARD, uid).catch(() => {});
        }
      }
    }
    if (redisSubscriber.status === 'ready') {
      await redisSubscriber.quit().catch(() => {});
    }
    if (redisClient.status === 'ready') {
      await redisClient.quit().catch(() => {});
    }
    await closeDatabase();
  });

  it('Users CRUD: creates, retrieves, updates, enforces uniqueness, and hides password hashes', async () => {
    const reg = await authService.register({
      username: `u_${runTag}`,
      email: `u_${runTag}@judge.local`,
      password: 'Password123!',
    });
    createdUserIds.push(reg.user.id);

    expect(reg.user.username).toBe(`u_${runTag}`);
    expect((reg.user as any).passwordHash).toBeUndefined();
    expect((reg.user as any).password_hash).toBeUndefined();

    // Verify stored password hash is bcrypt in DB
    const [rawRow] = await db.select().from(users).where(eq(users.id, reg.user.id));
    expect(rawRow.passwordHash.startsWith('$2')).toBe(true);

    // Retrieve by ID & username/email without exposing hash
    const profile = await usersService.getProfile(reg.user.id);
    expect(profile.email).toBe(`u_${runTag}@judge.local`);
    expect((profile as any).passwordHash).toBeUndefined();

    const byUsername = await usersService.findByUsernameOrEmail(`U_${runTag}`);
    expect(byUsername?.id).toBe(reg.user.id);

    // Update user role/username
    const updated = await usersService.updateUser(reg.user.id, { role: Role.PROBLEM_SETTER });
    expect(updated.role).toBe(Role.PROBLEM_SETTER);

    // Duplicate username/email rejection
    await expect(
      authService.register({
        username: `u_${runTag}`,
        email: `other_${runTag}@judge.local`,
        password: 'Password123!',
      })
    ).rejects.toMatchObject({ statusCode: 409 });

    await expect(
      authService.register({
        username: `u2_${runTag}`,
        email: `u_${runTag}@judge.local`,
        password: 'Password123!',
      })
    ).rejects.toMatchObject({ statusCode: 409 });

    // Missing and invalid user ID handling
    await expect(usersService.getProfile(crypto.randomUUID())).rejects.toMatchObject({
      statusCode: 404,
    });
    await expect(usersService.getProfile('not-a-uuid')).rejects.toMatchObject({ statusCode: 404 });
  });

  it('Problems CRUD & Transactions: creates, queries by ID/slug, lists, updates, rejects bad setter, and rolls back failures', async () => {
    const setter = await authService.register({
      username: `setter_${runTag}`,
      email: `setter_${runTag}@judge.local`,
      password: 'SetterPass123!',
    });
    createdUserIds.push(setter.user.id);

    const created = await problemsService.createProblem(setter.user.id, {
      title: `Two Sum ${runTag}`,
      statement: 'Find two numbers adding up to target.',
      difficulty: ProblemDifficulty.MEDIUM,
      tags: ['array', `tag-${runTag}`],
      timeLimitMs: 1500,
      memoryLimitMb: 128,
      sampleInput: '2 7',
      sampleExpectedOutput: '9',
      testCases: [
        { input: '1 2', expectedOutput: '3', isHidden: true },
        { input: '4 5', expectedOutput: '9', isHidden: true },
      ],
    });
    createdProblemIds.push(created.id);

    const byId = await problemsService.getProblem(created.id);
    const bySlug = await problemsService.getProblem(created.slug);
    expect(byId.id).toBe(created.id);
    expect(bySlug.slug).toBe(created.slug);
    expect((bySlug as any).testCases).toBeUndefined();

    // Verify 2 test_cases rows persisted with keys
    const storedTests = await db
      .select()
      .from(testCases)
      .where(eq(testCases.problemId, created.id));
    expect(storedTests).toHaveLength(2);

    // List & filter by unique tag
    const listed = await problemsService.listProblems({ tag: `tag-${runTag}`, limit: 10 });
    expect(listed.items.some((p) => p.id === created.id)).toBe(true);

    // Update problem
    const updated = await problemsService.updateProblem(created.id, {
      difficulty: ProblemDifficulty.HARD,
      timeLimitMs: 2500,
    });
    expect(updated.difficulty).toBe(ProblemDifficulty.HARD);
    expect(updated.timeLimitMs).toBe(2500);

    // Invalid setter FK rejection
    await expect(
      problemsService.createProblem('00000000-0000-4000-8000-000000000000', {
        title: `Bad Setter ${runTag}`,
        statement: 'Should fail FK.',
        difficulty: ProblemDifficulty.EASY,
      })
    ).rejects.toBeInstanceOf(AppError);

    // Transaction rollback verification: duplicate test_cases (problem_id, index) must roll back parent problem
    const rollbackProblemId = crypto.randomUUID();
    await expect(
      db.transaction(async (tx) => {
        await tx.insert(problems).values({
          id: rollbackProblemId,
          title: `Rollback ${runTag}`,
          slug: `rollback-${runTag}`,
          statement: 'Must roll back cleanly.',
          setterId: setter.user.id,
        });
        await tx.insert(testCases).values([
          {
            problemId: rollbackProblemId,
            index: 0,
            inputKey: 'k1',
            expectedOutputKey: 'o1',
          },
          {
            problemId: rollbackProblemId,
            index: 0, // violates uq_problem_test_index
            inputKey: 'k2',
            expectedOutputKey: 'o2',
          },
        ]);
      })
    ).rejects.toThrow();

    const rolledBackRows = await db
      .select()
      .from(problems)
      .where(eq(problems.id, rollbackProblemId));
    expect(rolledBackRows).toHaveLength(0);
  });

  it('Submissions CRUD & HTTP API compatibility: submit, fetch, list user/problem, update status, and enforce FKs', async () => {
    const httpReg = await dispatchHttp('POST', '/api/auth/register', {
      body: {
        username: `http_${runTag}`,
        email: `http_${runTag}@judge.local`,
        password: 'HttpUserPass123!',
        role: Role.ADMIN,
      },
    });
    expect(httpReg.status).toBe(201);
    expect(httpReg.body.data.user.passwordHash).toBeUndefined();
    expect(httpReg.body.data.user.role).toBe(Role.USER); // Server ignores client-supplied role
    expect(httpReg.body.data.token).toBeUndefined(); // JWT is strictly in HTTP-only cookie
    const userId = httpReg.body.data.user.id as string;
    const cookie = httpReg.cookieHeader;
    expect(cookie).toContain('token=');
    createdUserIds.push(userId);

    // Promote user to ADMIN in PostgreSQL (trusted server-side role assignment)
    await db.update(users).set({ role: Role.ADMIN }).where(eq(users.id, userId));

    const httpProblem = await dispatchHttp('POST', '/api/problems', {
      headers: { Cookie: cookie },
      body: {
        title: `HTTP Problem ${runTag}`,
        statement: 'Print output.',
        difficulty: ProblemDifficulty.EASY,
        tags: [`http-${runTag}`],
        sampleInput: 'hi',
        sampleExpectedOutput: 'hi',
      },
    });
    expect(httpProblem.status).toBe(201);
    const problemId = httpProblem.body.data.problem.id as string;
    createdProblemIds.push(problemId);

    const httpSubmit = await dispatchHttp('POST', '/api/submissions', {
      headers: { Cookie: cookie },
      body: {
        problemId,
        code: 'console.log("hi");',
        language: 'javascript',
      },
    });
    expect(httpSubmit.status).toBe(202);
    expect(httpSubmit.body.data.status).toBe(SubmissionStatus.QUEUED);
    const submissionId = httpSubmit.body.data.id as string;

    const httpGetSub = await dispatchHttp('GET', `/api/submissions/${submissionId}`, {
      headers: { Cookie: cookie },
    });
    expect(httpGetSub.status).toBe(200);
    expect(httpGetSub.body.data.submission.status).toBe(SubmissionStatus.QUEUED);
    expect(httpGetSub.body.data.submission.verdict).toBeUndefined();

    // Service-level listing & status/metrics update
    const userSubs = await submissionsService.listSubmissions(userId, { limit: 10 });
    expect(userSubs.items.some((s) => s.id === submissionId)).toBe(true);

    const probSubs = await submissionsService.listProblemSubmissions(problemId, 10);
    expect(probSubs.some((s) => s.id === submissionId)).toBe(true);

    const updatedSub = await submissionsService.updateSubmissionResult(submissionId, {
      status: SubmissionStatus.COMPLETED,
      verdict: Verdict.ACCEPTED,
      executionTimeMs: 42,
      memoryUsedKb: 10240,
    });
    expect(updatedSub.status).toBe(SubmissionStatus.COMPLETED);
    expect(updatedSub.verdict).toBe(Verdict.ACCEPTED);
    expect(updatedSub.executionTimeMs).toBe(42);
    expect(updatedSub.memoryUsedKb).toBe(10240);

    // Invalid user / problem foreign key rejection
    await expect(
      submissionsService.submitCode('00000000-0000-4000-8000-000000000000', {
        problemId,
        code: 'console.log(1);',
        language: 'javascript',
      })
    ).rejects.toMatchObject({ statusCode: 400 });

    await expect(
      submissionsService.submitCode(userId, {
        problemId: '00000000-0000-4000-8000-000000000000',
        code: 'console.log(1);',
        language: 'javascript',
      })
    ).rejects.toMatchObject({ statusCode: 404 });

    // Missing submission HTTP 404
    const missingRes = await dispatchHttp(
      'GET',
      '/api/submissions/00000000-0000-4000-8000-000000000000',
      { headers: { Cookie: cookie } }
    );
    expect(missingRes.status).toBe(404);
  });

  it('HTTP malformed submissions, SSE live updates (/api/submissions/:id/live), and leaderboard integration', async () => {
    const reg = await dispatchHttp('POST', '/api/auth/register', {
      body: {
        username: `edge_${runTag}`,
        email: `edge_${runTag}@judge.local`,
        password: 'EdgeUserPass123!',
      },
    });
    expect(reg.status).toBe(201);
    const userId = reg.body.data.user.id as string;
    createdUserIds.push(userId);
    await db.update(users).set({ role: Role.ADMIN }).where(eq(users.id, userId));

    const loginRes = await dispatchHttp('POST', '/api/auth/login', {
      body: {
        email: `EDGE_${runTag}@judge.local`,
        password: 'EdgeUserPass123!',
      },
    });
    expect(loginRes.status).toBe(200);
    expect(loginRes.body.data.user.role).toBe(Role.ADMIN);
    expect(loginRes.body.data.token).toBeUndefined();
    const cookie = loginRes.cookieHeader;

    const meRes = await dispatchHttp('GET', '/api/auth/me', { headers: { Cookie: cookie } });
    expect(meRes.status).toBe(200);
    expect(meRes.body.data.user.id).toBe(userId);
    expect(meRes.body.data.user.passwordHash).toBeUndefined();

    const probRes = await dispatchHttp('POST', '/api/problems', {
      headers: { Cookie: cookie },
      body: {
        title: `Edge SSE Problem ${runTag}`,
        statement: 'Return echo',
        difficulty: ProblemDifficulty.EASY,
        tags: [`edge-${runTag}`],
        sampleInput: '1',
        sampleExpectedOutput: '1',
      },
    });
    expect(probRes.status).toBe(201);
    const problemId = probRes.body.data.problem.id as string;
    createdProblemIds.push(problemId);

    // 1. Malformed payloads rejected cleanly with HTTP 400 (not 500)
    const emptyCodeRes = await dispatchHttp('POST', '/api/submissions', {
      headers: { Cookie: cookie },
      body: { problemId, code: '', language: 'javascript' },
    });
    expect(emptyCodeRes.status).toBe(400);

    const missingCodeRes = await dispatchHttp('POST', '/api/submissions', {
      headers: { Cookie: cookie },
      body: { problemId, language: 'javascript' },
    });
    expect(missingCodeRes.status).toBe(400);

    const badLangRes = await dispatchHttp('POST', '/api/submissions', {
      headers: { Cookie: cookie },
      body: { problemId, code: 'print(1)', language: 'rust' },
    });
    expect(badLangRes.status).toBe(400);

    const missingProbRes = await dispatchHttp('POST', '/api/submissions', {
      headers: { Cookie: cookie },
      body: { code: 'console.log(1)', language: 'javascript' },
    });
    expect(missingProbRes.status).toBe(400);

    // 2. Valid submission -> verify SSE catch-up stream & Redis Pub/Sub live verdict event
    const subRes = await dispatchHttp('POST', '/api/submissions', {
      headers: { Cookie: cookie },
      body: { problemId, code: 'console.log(1)', language: 'javascript' },
    });
    expect(subRes.status).toBe(202);
    const submissionId = subRes.body.data.id as string;

    // Wait briefly so SSE Redis subscriber is active before streaming
    const ssePromise = fetch(`${baseUrl}/api/submissions/${submissionId}/live`, {
      signal: AbortSignal.timeout(8000),
    }).then(async (res) => {
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toContain('text/event-stream');
      return res.text();
    });

    await new Promise((r) => setTimeout(r, 250));
    await redisClient.publish(
      REDIS_KEYS.CHANNEL_SUBMISSION_EVENTS,
      JSON.stringify({
        submissionId,
        status: Verdict.ACCEPTED,
        verdict: Verdict.ACCEPTED,
        executionTimeMs: 35,
        memoryUsedKb: 16384,
        timestamp: Date.now(),
      })
    );

    const sseBody = await ssePromise;
    expect(sseBody).toContain('data:');
    expect(sseBody).toContain(Verdict.ACCEPTED);

    // 3. Leaderboard integration: idempotent solve recording + HTTP retrieval
    await leaderboardService.recordSolve(userId, problemId, 5);
    await leaderboardService.recordSolve(userId, problemId, 99); // Duplicate solve must not double-count

    const lbRes = await dispatchHttp('GET', '/api/leaderboard');
    expect(lbRes.status).toBe(200);
    const entry = (lbRes.body.data.leaderboard as any[]).find((e) => e.userId === userId);
    expect(entry).toBeDefined();
    expect(entry.problemsSolved).toBe(1);
    expect(entry.totalPenaltySeconds).toBe(5);
  }, 15000);
});
