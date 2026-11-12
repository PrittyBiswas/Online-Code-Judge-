import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { eq, inArray } from 'drizzle-orm';
import { ProblemDifficulty, REDIS_KEYS, Role } from '@judge/shared';
import { db, checkDatabaseConnection, closeDatabase } from '../src/db/index.js';
import { problems, submissions, testCases, users } from '../src/db/schema.js';
import { authService } from '../src/modules/auth/auth.service.js';
import { usersService } from '../src/modules/users/users.service.js';
import { problemsService } from '../src/modules/problems/problems.service.js';
import { minioService } from '../src/config/minio.js';
import { redisClient, isRedisHealthy } from '../src/config/redis.js';
import { env } from '../src/config/env.js';
import { app } from '../src/app.js';

function dispatchHttp(
  method: string,
  path: string,
  options: { headers?: Record<string, string>; body?: unknown } = {}
): Promise<{ status: number; body: any; headers: Record<string, string | string[]> }> {
  return new Promise((resolve, reject) => {
    const headers: Record<string, string> = {};
    for (const [k, v] of Object.entries(options.headers || {})) {
      headers[k.toLowerCase()] = v;
    }

    const [pathname, searchPart] = path.split('?');
    const query: Record<string, string> = {};
    if (searchPart) {
      for (const [k, v] of new URLSearchParams(searchPart).entries()) {
        query[k] = v;
      }
    }

    const req = {
      method: method.toUpperCase(),
      url: path,
      originalUrl: path,
      path: pathname,
      headers,
      body: options.body ?? {},
      query,
      ip: '127.0.0.1',
      socket: { remoteAddress: '127.0.0.1' },
      header(name: string) {
        return headers[name.toLowerCase()];
      },
      get(name: string) {
        return headers[name.toLowerCase()];
      },
    } as unknown as Request;

    let statusCode = 200;
    const responseHeaders: Record<string, string | string[]> = {};
    const res = {
      locals: {},
      status(code: number) {
        statusCode = code;
        return this;
      },
      json(payload: unknown) {
        resolve({ status: statusCode, body: payload, headers: responseHeaders });
        return this;
      },
      send(payload: unknown) {
        resolve({ status: statusCode, body: payload, headers: responseHeaders });
        return this;
      },
      setHeader(name: string, value: string | string[]) {
        responseHeaders[name.toLowerCase()] = value;
      },
      getHeader(name: string) {
        return responseHeaders[name.toLowerCase()];
      },
      removeHeader(name: string) {
        delete responseHeaders[name.toLowerCase()];
      },
      end() {
        resolve({ status: statusCode, body: undefined, headers: responseHeaders });
        return this;
      },
    } as unknown as Response;

    (app as unknown as (r: Request, s: Response, n: NextFunction) => void)(req, res, (err) => {
      if (err) reject(err);
    });
  });
}

describe('Day 12 Live Integration: Problem Search, Filtering, Pagination, MinIO & Redis Cache', () => {
  const runTag = crypto.randomUUID().slice(0, 8);
  const createdUserIds: string[] = [];
  const createdProblemIds: string[] = [];
  const createdMinioKeys: string[] = [];

  let setterId = '';
  let setterCookie = '';
  let userId = '';
  let userCookie = '';

  beforeAll(async () => {
    const dbOk = await checkDatabaseConnection();
    expect(dbOk).toBe(true);

    const minioOk = await minioService.isHealthy();
    expect(minioOk).toBe(true);

    if (!isRedisHealthy()) {
      await redisClient.connect().catch(() => {});
    }
    expect(isRedisHealthy()).toBe(true);

    // Create a PROBLEM_SETTER and an ordinary USER
    const setterEmail = `d12_setter_${runTag}@example.com`;
    const setterReg = await authService.register({
      username: `d12_setter_${runTag}`,
      email: setterEmail,
      password: 'StrongPassword123!',
    });
    setterId = setterReg.user.id;
    createdUserIds.push(setterId);
    await usersService.updateUser(setterId, { role: Role.PROBLEM_SETTER });
    const setterLogin = await dispatchHttp('POST', '/api/auth/login', {
      body: { email: setterEmail, password: 'StrongPassword123!' },
    });
    expect(setterLogin.status).toBe(200);
    const setCookieHeader = setterLogin.headers['set-cookie'];
    const rawSetterCookie = Array.isArray(setCookieHeader) ? setCookieHeader[0] : setCookieHeader;
    setterCookie = rawSetterCookie.split(';')[0];

    const userEmail = `d12_user_${runTag}@example.com`;
    const userReg = await authService.register({
      username: `d12_user_${runTag}`,
      email: userEmail,
      password: 'StrongPassword123!',
    });
    userId = userReg.user.id;
    createdUserIds.push(userId);
    const userLogin = await dispatchHttp('POST', '/api/auth/login', {
      body: { email: userEmail, password: 'StrongPassword123!' },
    });
    expect(userLogin.status).toBe(200);
    const rawUserCookie = Array.isArray(userLogin.headers['set-cookie'])
      ? userLogin.headers['set-cookie'][0]
      : userLogin.headers['set-cookie'];
    userCookie = rawUserCookie.split(';')[0];
  });

  afterAll(async () => {
    if (createdMinioKeys.length > 0) {
      await minioService.deleteObjects(createdMinioKeys);
    }
    if (createdProblemIds.length > 0) {
      await db.delete(submissions).where(inArray(submissions.problemId, createdProblemIds));
      await db.delete(problems).where(inArray(problems.id, createdProblemIds));
    }
    if (createdUserIds.length > 0) {
      await db.delete(problems).where(inArray(problems.setterId, createdUserIds));
      await db.delete(users).where(inArray(users.id, createdUserIds));
    }
    await closeDatabase();
  });

  it('enforces RBAC, validates payloads, and hides private test cases & MinIO credentials', async () => {
    const unauth = await dispatchHttp('POST', '/api/problems', {
      body: { title: 'Unauth Problem', statement: 'Should be rejected with 401.' },
    });
    expect(unauth.status).toBe(401);

    const forbidden = await dispatchHttp('POST', '/api/problems', {
      headers: { Cookie: userCookie },
      body: { title: 'User Problem', statement: 'Ordinary user cannot create problems.' },
    });
    expect(forbidden.status).toBe(403);

    const malformed = await dispatchHttp('POST', '/api/problems', {
      headers: { Cookie: setterCookie },
      body: { title: 'A', statement: 'short' },
    });
    expect(malformed.status).toBe(400);

    const secretIn = `TOP_SECRET_INPUT_${runTag}`;
    const secretOut = `TOP_SECRET_OUTPUT_${runTag}`;
    const createRes = await dispatchHttp('POST', '/api/problems', {
      headers: { Cookie: setterCookie },
      body: {
        title: `Binary Graph ${runTag}`,
        statement: `Traverse a weighted graph using binary lifting ${runTag}.`,
        difficulty: ProblemDifficulty.HARD,
        tags: ['graphs', `scope-${runTag}`],
        sampleInput: '1 2',
        sampleExpectedOutput: '3',
        testCases: [{ input: secretIn, expectedOutput: secretOut, isHidden: true }],
      },
    });
    expect(createRes.status).toBe(201);
    const problem = createRes.body.data.problem;
    createdProblemIds.push(problem.id);

    // Check MinIO objects exist for the worker
    const tcRows = await db.select().from(testCases).where(eq(testCases.problemId, problem.id));
    expect(tcRows).toHaveLength(1);
    createdMinioKeys.push(tcRows[0].inputKey, tcRows[0].expectedOutputKey);
    expect(await minioService.getObject(tcRows[0].inputKey)).toBe(secretIn);
    expect(await minioService.getObject(tcRows[0].expectedOutputKey)).toBe(secretOut);

    // Public detail & listing must never leak hidden test contents or MinIO keys/secrets
    const detailRes = await dispatchHttp('GET', `/api/problems/${problem.id}`);
    expect(detailRes.status).toBe(200);
    const detailJson = JSON.stringify(detailRes.body);
    expect(detailJson).not.toContain(secretIn);
    expect(detailJson).not.toContain(secretOut);
    expect(detailJson).not.toContain(tcRows[0].inputKey);
    expect(detailJson).not.toContain(env.MINIO_ROOT_PASSWORD);

    const listRes = await dispatchHttp('GET', `/api/problems?tag=scope-${runTag}`);
    expect(listRes.status).toBe(200);
    const listJson = JSON.stringify(listRes.body);
    expect(listJson).not.toContain(secretIn);
    expect(listJson).not.toContain(secretOut);
    expect(listJson).not.toContain(tcRows[0].inputKey);

    const missingRes = await dispatchHttp(
      'GET',
      '/api/problems/00000000-0000-4000-8000-000000000000'
    );
    expect(missingRes.status).toBe(404);
  });

  it('supports PostgreSQL FTS, strict AND filtering, and stable cursor pagination with duplicate timestamps', async () => {
    const scopeTag = `pgsuite-${runTag}`;
    const sharedTime = new Date('2026-01-15T12:00:00.000Z');

    const p1 = await problemsService.createProblem(setterId, {
      title: `Dynamic Knapsack ${runTag}`,
      statement: `Optimize knapsack capacity with dynamic programming ${runTag}.`,
      difficulty: ProblemDifficulty.MEDIUM,
      tags: ['dp', scopeTag],
    });
    const p2 = await problemsService.createProblem(setterId, {
      title: `Easy Array Sum ${runTag}`,
      statement: `Compute prefix sums on an array ${runTag}.`,
      difficulty: ProblemDifficulty.EASY,
      tags: ['arrays', scopeTag],
    });
    const p3 = await problemsService.createProblem(setterId, {
      title: `Hard Graph Shortest Path ${runTag}`,
      statement: `Find shortest path in directed graph ${runTag}.`,
      difficulty: ProblemDifficulty.HARD,
      tags: ['graphs', scopeTag],
    });
    const p4 = await problemsService.createProblem(setterId, {
      title: `Array Duplicate Time A ${runTag}`,
      statement: `Tie-breaker test A ${runTag}.`,
      difficulty: ProblemDifficulty.EASY,
      tags: ['arrays', scopeTag],
    });
    const p5 = await problemsService.createProblem(setterId, {
      title: `Array Duplicate Time B ${runTag}`,
      statement: `Tie-breaker test B ${runTag}.`,
      difficulty: ProblemDifficulty.EASY,
      tags: ['arrays', scopeTag],
    });

    createdProblemIds.push(p1.id, p2.id, p3.id, p4.id, p5.id);

    // Force identical createdAt on p4 and p5 to prove UUID tie-breaker works with zero skips/dups
    await db
      .update(problems)
      .set({ createdAt: sharedTime })
      .where(inArray(problems.id, [p4.id, p5.id]));

    // FTS by title & description + empty search + SQL injection safety
    const titleSearch = await problemsService.listProblems({
      search: `Knapsack ${runTag}`,
      tag: scopeTag,
    });
    expect(titleSearch.items.map((p) => p.id)).toEqual([p1.id]);

    const descSearch = await problemsService.listProblems({
      search: `prefix ${runTag}`,
      tag: scopeTag,
    });
    expect(descSearch.items.map((p) => p.id)).toEqual([p2.id]);

    const sqlInjSearch = await problemsService.listProblems({
      search: `'; DROP TABLE problems; --`,
      tag: scopeTag,
    });
    expect(sqlInjSearch.items).toHaveLength(0);

    // AND semantics: search + difficulty + category
    const andMatch = await problemsService.listProblems({
      search: `graph ${runTag}`,
      difficulty: ProblemDifficulty.HARD,
      category: 'graphs',
      tag: scopeTag,
    });
    expect(andMatch.items.map((p) => p.id)).toEqual([p3.id]);

    const andMismatch = await problemsService.listProblems({
      search: `graph ${runTag}`,
      difficulty: ProblemDifficulty.EASY,
      category: 'graphs',
      tag: scopeTag,
    });
    expect(andMismatch.items).toHaveLength(0);

    // Cursor pagination across all 5 scoped items (limit: 2 -> pages of 2, 2, 1)
    const page1 = await problemsService.listProblems({ tag: scopeTag, limit: 2 });
    expect(page1.items).toHaveLength(2);
    expect(page1.nextCursor).toBeTruthy();

    const page2 = await problemsService.listProblems({
      tag: scopeTag,
      limit: 2,
      cursor: page1.nextCursor!,
    });
    expect(page2.items).toHaveLength(2);
    expect(page2.nextCursor).toBeTruthy();

    const page3 = await problemsService.listProblems({
      tag: scopeTag,
      limit: 2,
      cursor: page2.nextCursor!,
    });
    expect(page3.items).toHaveLength(1);
    expect(page3.nextCursor).toBeNull();

    const collectedIds = [...page1.items, ...page2.items, ...page3.items].map((p) => p.id);
    expect(new Set(collectedIds).size).toBe(5);
    expect(collectedIds.sort()).toEqual([p1.id, p2.id, p3.id, p4.id, p5.id].sort());
  });

  it('caches in Redis, invalidates on PUT/DELETE, and protects submission-referenced problems', async () => {
    // 1. Problem without submissions -> hard delete + MinIO cleanup + cache invalidation
    const temp = await problemsService.createProblem(setterId, {
      title: `Disposable Cache Problem ${runTag}`,
      statement: `Will be updated and hard-deleted ${runTag}.`,
      difficulty: ProblemDifficulty.EASY,
      tags: [`cache-${runTag}`],
      testCases: [{ input: 'TEMP_IN', expectedOutput: 'TEMP_OUT', isHidden: true }],
    });
    createdProblemIds.push(temp.id);

    const [tempTc] = await db.select().from(testCases).where(eq(testCases.problemId, temp.id));
    createdMinioKeys.push(tempTc.inputKey, tempTc.expectedOutputKey);

    // Populate detail + list caches
    await problemsService.getProblem(temp.id);
    expect(await redisClient.get(REDIS_KEYS.PROBLEM_CACHE(temp.id))).toBeTruthy();
    const listBefore = await problemsService.listProblems({ tag: `cache-${runTag}` });
    expect(listBefore.items).toHaveLength(1);

    // Update invalidates both detail and list caches
    const updateRes = await dispatchHttp('PUT', `/api/problems/${temp.id}`, {
      headers: { Cookie: setterCookie },
      body: { title: `Renamed Cache Problem ${runTag}` },
    });
    expect(updateRes.status).toBe(200);
    expect(await redisClient.get(REDIS_KEYS.PROBLEM_CACHE(temp.id))).toBeNull();
    const listAfterUpdate = await problemsService.listProblems({ tag: `cache-${runTag}` });
    expect(listAfterUpdate.items[0].title).toBe(`Renamed Cache Problem ${runTag}`);

    // Delete with no submissions -> hard delete + MinIO object deletion + cache invalidation
    const delRes = await dispatchHttp('DELETE', `/api/problems/${temp.id}`, {
      headers: { Cookie: setterCookie },
    });
    expect(delRes.status).toBe(200);
    expect(delRes.body.data.archived).toBe(false);
    expect(await minioService.getObject(tempTc.inputKey)).toBeNull();
    expect(await redisClient.get(REDIS_KEYS.PROBLEM_CACHE(temp.id))).toBeNull();
    const listAfterDel = await problemsService.listProblems({ tag: `cache-${runTag}` });
    expect(listAfterDel.items).toHaveLength(0);

    // 2. Problem WITH submissions -> safe archival (preserves submission & MinIO objects)
    const refProb = await problemsService.createProblem(setterId, {
      title: `Referenced Problem ${runTag}`,
      statement: `Referenced by a user submission ${runTag}.`,
      difficulty: ProblemDifficulty.MEDIUM,
      tags: [`ref-${runTag}`],
      testCases: [{ input: 'REF_IN', expectedOutput: 'REF_OUT', isHidden: true }],
    });
    createdProblemIds.push(refProb.id);

    const [refTc] = await db.select().from(testCases).where(eq(testCases.problemId, refProb.id));
    createdMinioKeys.push(refTc.inputKey, refTc.expectedOutputKey);

    await db.insert(submissions).values({
      problemId: refProb.id,
      userId,
      code: 'console.log(1);',
      language: 'javascript',
      status: 'COMPLETED',
      verdict: 'ACCEPTED',
    });

    const archiveRes = await dispatchHttp('DELETE', `/api/problems/${refProb.id}`, {
      headers: { Cookie: setterCookie },
    });
    expect(archiveRes.status).toBe(200);
    expect(archiveRes.body.data.archived).toBe(true);

    // Hidden from public GET & list, while MinIO object & submission remain intact
    const getArchived = await dispatchHttp('GET', `/api/problems/${refProb.id}`);
    expect(getArchived.status).toBe(404);
    expect(await minioService.getObject(refTc.inputKey)).toBe('REF_IN');
  });
});

