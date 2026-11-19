import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { Role, Verdict, SubmissionStatus, ProblemDifficulty, TestCaseResult } from '@judge/shared';
import { env } from '../src/config/env.js';
import { memoryDb } from '../src/config/db.js';

const USER_A = '11111111-1111-4111-8111-111111111111';
const USER_B = '22222222-2222-4222-8222-222222222222';
const PROBLEM_1_ID = '33333333-3333-4333-8333-333333333333';
const PROBLEM_2_ID = '44444444-4444-4444-8444-444444444444';

const { submissionsStore, problemsStore } = vi.hoisted(() => ({
  submissionsStore: new Map<string, any>(),
  problemsStore: new Map<string, any>(),
}));

vi.mock('../src/config/redis.js', () => ({
  isRedisHealthy: () => true,
  redisClient: {
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue('OK'),
    del: vi.fn().mockResolvedValue(1),
  },
  redisSubscriber: { on: vi.fn(), subscribe: vi.fn() },
}));

vi.mock('../src/config/queue.js', () => ({
  judgeQueue: { add: vi.fn(), getJob: vi.fn().mockResolvedValue(null) },
  sampleRunQueue: { add: vi.fn() },
}));

function extractAllValues(cond: any, found: any[] = []): any[] {
  if (!cond) return found;
  if (typeof cond !== 'object') {
    found.push(cond);
    return found;
  }
  if ('value' in cond && (typeof cond.value === 'string' || typeof cond.value === 'number')) {
    found.push(cond.value);
  }
  if (Array.isArray(cond.queryChunks)) {
    for (const chunk of cond.queryChunks) {
      extractAllValues(chunk, found);
    }
  }
  return found;
}

vi.mock('../src/db/index.js', () => {
  return {
    db: {
      transaction: async (fn: any) => fn(),
      select: (selectFields?: any) => {
        let isCountQuery = false;
        if (selectFields && typeof selectFields === 'object' && 'count' in selectFields) {
          isCountQuery = true;
        }

        const builder: any = {
          currentTable: null,
          whereCond: null,
          limitVal: 100,
          offsetVal: 0,
          from(table: any) {
            builder.currentTable = table;
            return builder;
          },
          leftJoin(_table: any, _cond: any) {
            return builder;
          },
          where(cond: any) {
            builder.whereCond = cond;
            return builder;
          },
          orderBy() {
            return builder;
          },
          limit(n: number) {
            builder.limitVal = n;
            return builder;
          },
          offset(n: number) {
            builder.offsetVal = n;
            return builder;
          },
          then(resolve: any) {
            const tableName =
              (builder.currentTable as Record<symbol, string>)?.[Symbol.for('drizzle:Name')] || '';
            const values = extractAllValues(builder.whereCond);

            if (tableName === 'users') {
              const targetId = values.find((v) => memoryDb.users.has(v));
              if (targetId) {
                const u = memoryDb.users.get(targetId)!;
                return resolve([{ id: u.id, username: u.username, email: u.email, role: u.role }]);
              }
              return resolve(
                Array.from(memoryDb.users.values()).map((u) => ({
                  id: u.id,
                  username: u.username,
                  email: u.email,
                  role: u.role,
                }))
              );
            }

            if (tableName === 'problems') {
              const targetId = values.find((v) => problemsStore.has(v));
              if (targetId) {
                return resolve([problemsStore.get(targetId)]);
              }
              return resolve(Array.from(problemsStore.values()));
            }

            if (tableName === 'submissions') {
              // Single submission lookup by ID
              const targetSubId = values.find((v) => submissionsStore.has(v));
              if (
                targetSubId &&
                (builder.limitVal === 1 ||
                  (!isCountQuery && !values.includes(USER_A) && !values.includes(USER_B)))
              ) {
                return resolve([submissionsStore.get(targetSubId)]);
              }

              let list = Array.from(submissionsStore.values());

              if (values.includes(USER_A)) {
                list = list.filter((s) => s.userId === USER_A);
              } else if (values.includes(USER_B)) {
                list = list.filter((s) => s.userId === USER_B);
              }

              if (values.includes(PROBLEM_1_ID)) {
                list = list.filter((s) => s.problemId === PROBLEM_1_ID);
              } else if (values.includes(PROBLEM_2_ID)) {
                list = list.filter((s) => s.problemId === PROBLEM_2_ID);
              }

              if (values.includes('python')) {
                list = list.filter((s) => s.language === 'python');
              } else if (values.includes('javascript')) {
                list = list.filter((s) => s.language === 'javascript');
              }

              if (values.includes(Verdict.ACCEPTED)) {
                list = list.filter((s) => s.verdict === Verdict.ACCEPTED);
              } else if (values.includes(Verdict.WRONG_ANSWER)) {
                list = list.filter((s) => s.verdict === Verdict.WRONG_ANSWER);
              }

              if (isCountQuery) {
                return resolve([{ count: list.length }]);
              }

              // Sort by createdAt desc
              list.sort(
                (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
              );

              // Paginate
              const paged = list.slice(
                builder.offsetVal,
                builder.offsetVal + (builder.limitVal || 20)
              );

              // Attach problem metadata
              const enriched = paged.map((s) => {
                const p = problemsStore.get(s.problemId);
                return {
                  ...s,
                  problemTitle: p?.title,
                  problemSlug: p?.slug,
                  problemDifficulty: p?.difficulty,
                  contestTitle: undefined,
                };
              });

              return resolve(enriched);
            }

            return resolve([]);
          },
        };

        return builder;
      },
    },
    checkDatabaseConnection: vi.fn().mockResolvedValue(true),
    closeDatabase: vi.fn().mockResolvedValue(undefined),
  };
});

import { app } from '../src/app.js';

function cookieFor(userId: string) {
  const token = jwt.sign({ id: userId, role: Role.USER }, env.JWT_SECRET, { expiresIn: '15m' });
  return `${env.AUTH_COOKIE_NAME}=${token}`;
}

function dispatchHttp(
  method: string,
  path: string,
  options: { headers?: Record<string, string>; body?: unknown } = {}
): Promise<{ status: number; body: any }> {
  return new Promise((resolve, reject) => {
    const headers: Record<string, string> = {};
    for (const [k, v] of Object.entries(options.headers || {})) {
      headers[k.toLowerCase()] = v;
    }

    const [pathname, queryStr] = path.split('?');
    const query: Record<string, string> = {};
    if (queryStr) {
      const sp = new URLSearchParams(queryStr);
      for (const [k, v] of sp.entries()) {
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
    const res = {
      locals: {},
      status(code: number) {
        statusCode = code;
        return this;
      },
      json(payload: unknown) {
        resolve({ status: statusCode, body: payload });
        return this;
      },
      send(payload: unknown) {
        resolve({ status: statusCode, body: payload });
        return this;
      },
      setHeader: vi.fn(),
      getHeader: vi.fn(),
      removeHeader: vi.fn(),
      end() {
        resolve({ status: statusCode, body: undefined });
        return this;
      },
    } as unknown as Response;

    (app as unknown as (r: Request, s: Response, n: NextFunction) => void)(req, res, (err) => {
      if (err) reject(err);
    });
  });
}

describe('Phase 4 — Submission History and Source Code Inspector API', () => {
  beforeEach(() => {
    submissionsStore.clear();
    problemsStore.clear();
    memoryDb.users.clear();

    memoryDb.users.set(USER_A, {
      id: USER_A,
      username: 'alice',
      email: 'alice@example.com',
      password_hash: 'hash_a',
      role: Role.USER,
      created_at: new Date(),
      updated_at: new Date(),
    });

    memoryDb.users.set(USER_B, {
      id: USER_B,
      username: 'bob',
      email: 'bob@example.com',
      password_hash: 'hash_b',
      role: Role.USER,
      created_at: new Date(),
      updated_at: new Date(),
    });

    problemsStore.set(PROBLEM_1_ID, {
      id: PROBLEM_1_ID,
      title: 'Two Sum',
      slug: 'two-sum',
      statement: 'Add two numbers',
      difficulty: ProblemDifficulty.EASY,
      timeLimitMs: 1000,
      memoryLimitMb: 128,
      visibility: 'public',
      setterId: USER_A,
      isArchived: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    problemsStore.set(PROBLEM_2_ID, {
      id: PROBLEM_2_ID,
      title: 'Reverse Linked List',
      slug: 'reverse-linked-list',
      statement: 'Reverse nodes in list',
      difficulty: ProblemDifficulty.MEDIUM,
      timeLimitMs: 2000,
      memoryLimitMb: 256,
      visibility: 'public',
      setterId: USER_A,
      isArchived: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  });

  describe('GET /api/submissions (List Submissions)', () => {
    it('returns 401 Unauthorized when unauthenticated', async () => {
      const res = await dispatchHttp('GET', '/api/submissions');
      expect(res.status).toBe(401);
    });

    it('returns empty submission list with pagination metadata when user has no submissions', async () => {
      const res = await dispatchHttp('GET', '/api/submissions', {
        headers: { Cookie: cookieFor(USER_A) },
      });

      expect(res.status).toBe(200);
      expect(res.body.data.items).toEqual([]);
      expect(res.body.data.pagination).toEqual({
        page: 1,
        limit: 20,
        total: 0,
        totalPages: 0,
        hasNextPage: false,
        hasPreviousPage: false,
      });
    });

    it('returns user submissions, populates problem metadata, and strictly OMITS source code', async () => {
      const subId1 = '10000000-0000-0000-0000-000000000001';
      const subId2 = '10000000-0000-0000-0000-000000000002';

      submissionsStore.set(subId1, {
        id: subId1,
        problemId: PROBLEM_1_ID,
        userId: USER_A,
        code: 'def two_sum(): pass',
        language: 'python',
        status: SubmissionStatus.COMPLETED,
        verdict: Verdict.ACCEPTED,
        executionTimeMs: 45,
        memoryUsedKb: 12400,
        failedTestIndex: null,
        testCaseResults: null,
        retryCount: 0,
        createdAt: new Date('2026-11-17T10:00:00Z'),
        updatedAt: new Date('2026-11-17T10:00:00Z'),
      });

      submissionsStore.set(subId2, {
        id: subId2,
        problemId: PROBLEM_2_ID,
        userId: USER_A,
        code: 'const reverseList = () => {};',
        language: 'javascript',
        status: SubmissionStatus.COMPLETED,
        verdict: Verdict.WRONG_ANSWER,
        executionTimeMs: 72,
        memoryUsedKb: 18200,
        failedTestIndex: 1,
        testCaseResults: null,
        retryCount: 0,
        createdAt: new Date('2026-11-17T11:00:00Z'),
        updatedAt: new Date('2026-11-17T11:00:00Z'),
      });

      const res = await dispatchHttp('GET', '/api/submissions', {
        headers: { Cookie: cookieFor(USER_A) },
      });

      expect(res.status).toBe(200);
      const items = res.body.data.items;
      expect(items.length).toBe(2);

      // Verify code is completely OMITTED from summary items
      for (const item of items) {
        expect(item.code).toBeUndefined();
      }

      // Verify problem title is populated
      const sub2Summary = items.find((s: any) => s.id === subId2);
      expect(sub2Summary).toBeDefined();
      expect(sub2Summary.problemTitle).toBe('Reverse Linked List');
      expect(sub2Summary.verdict).toBe(Verdict.WRONG_ANSWER);
      expect(sub2Summary.language).toBe('javascript');

      // Verify pagination
      expect(res.body.data.pagination.total).toBe(2);
      expect(res.body.data.pagination.page).toBe(1);
    });

    it('enforces user isolation: User A cannot see User B submissions', async () => {
      const userASub = '10000000-0000-0000-0000-000000000001';
      const userBSub = '20000000-0000-0000-0000-000000000002';

      submissionsStore.set(userASub, {
        id: userASub,
        problemId: PROBLEM_1_ID,
        userId: USER_A,
        code: 'console.log("Alice")',
        language: 'javascript',
        status: SubmissionStatus.COMPLETED,
        verdict: Verdict.ACCEPTED,
        createdAt: new Date(),
        updatedAt: new Date(),
        retryCount: 0,
      });

      submissionsStore.set(userBSub, {
        id: userBSub,
        problemId: PROBLEM_1_ID,
        userId: USER_B,
        code: 'console.log("Bob secret solution")',
        language: 'javascript',
        status: SubmissionStatus.COMPLETED,
        verdict: Verdict.ACCEPTED,
        createdAt: new Date(),
        updatedAt: new Date(),
        retryCount: 0,
      });

      // User A lists submissions
      const resA = await dispatchHttp('GET', '/api/submissions', {
        headers: { Cookie: cookieFor(USER_A) },
      });
      expect(resA.status).toBe(200);
      expect(resA.body.data.items.length).toBe(1);
      expect(resA.body.data.items[0].id).toBe(userASub);

      // User B lists submissions
      const resB = await dispatchHttp('GET', '/api/submissions', {
        headers: { Cookie: cookieFor(USER_B) },
      });
      expect(resB.status).toBe(200);
      expect(resB.body.data.items.length).toBe(1);
      expect(resB.body.data.items[0].id).toBe(userBSub);
    });

    it('filters submissions by verdict abbreviation (AC) and full verdict name (ACCEPTED)', async () => {
      const subAc = '10000000-0000-0000-0000-000000000001';
      const subWa = '10000000-0000-0000-0000-000000000002';

      submissionsStore.set(subAc, {
        id: subAc,
        problemId: PROBLEM_1_ID,
        userId: USER_A,
        code: 'code ac',
        language: 'python',
        status: SubmissionStatus.COMPLETED,
        verdict: Verdict.ACCEPTED,
        createdAt: new Date(),
        updatedAt: new Date(),
        retryCount: 0,
      });

      submissionsStore.set(subWa, {
        id: subWa,
        problemId: PROBLEM_1_ID,
        userId: USER_A,
        code: 'code wa',
        language: 'python',
        status: SubmissionStatus.COMPLETED,
        verdict: Verdict.WRONG_ANSWER,
        createdAt: new Date(),
        updatedAt: new Date(),
        retryCount: 0,
      });

      // Query with abbreviation ?verdict=AC
      const resAbbr = await dispatchHttp('GET', '/api/submissions?verdict=AC', {
        headers: { Cookie: cookieFor(USER_A) },
      });
      expect(resAbbr.status).toBe(200);
      expect(resAbbr.body.data.items.length).toBe(1);
      expect(resAbbr.body.data.items[0].id).toBe(subAc);

      // Query with full name ?verdict=ACCEPTED
      const resFull = await dispatchHttp('GET', '/api/submissions?verdict=ACCEPTED', {
        headers: { Cookie: cookieFor(USER_A) },
      });
      expect(resFull.status).toBe(200);
      expect(resFull.body.data.items.length).toBe(1);
      expect(resFull.body.data.items[0].id).toBe(subAc);
    });

    it('filters submissions by language (?language=python)', async () => {
      const subPy = '10000000-0000-0000-0000-000000000001';
      const subJs = '10000000-0000-0000-0000-000000000002';

      submissionsStore.set(subPy, {
        id: subPy,
        problemId: PROBLEM_1_ID,
        userId: USER_A,
        code: 'python code',
        language: 'python',
        status: SubmissionStatus.COMPLETED,
        verdict: Verdict.ACCEPTED,
        createdAt: new Date(),
        updatedAt: new Date(),
        retryCount: 0,
      });

      submissionsStore.set(subJs, {
        id: subJs,
        problemId: PROBLEM_1_ID,
        userId: USER_A,
        code: 'javascript code',
        language: 'javascript',
        status: SubmissionStatus.COMPLETED,
        verdict: Verdict.ACCEPTED,
        createdAt: new Date(),
        updatedAt: new Date(),
        retryCount: 0,
      });

      const res = await dispatchHttp('GET', '/api/submissions?language=python', {
        headers: { Cookie: cookieFor(USER_A) },
      });

      expect(res.status).toBe(200);
      expect(res.body.data.items.length).toBe(1);
      expect(res.body.data.items[0].id).toBe(subPy);
      expect(res.body.data.items[0].language).toBe('python');
    });
  });

  describe('GET /api/submissions/:id (Submission Details & Source Inspector)', () => {
    it('returns 401 Unauthorized when unauthenticated', async () => {
      const subId = '10000000-0000-0000-0000-000000000001';
      const res = await dispatchHttp('GET', `/api/submissions/${subId}`);
      expect(res.status).toBe(401);
    });

    it('returns 404 Not Found for non-existent submission', async () => {
      const nonExistent = '99999999-9999-9999-9999-999999999999';
      const res = await dispatchHttp('GET', `/api/submissions/${nonExistent}`, {
        headers: { Cookie: cookieFor(USER_A) },
      });
      expect(res.status).toBe(404);
    });

    it('returns 403 Forbidden when User B attempts to access User A submission', async () => {
      const userASub = '10000000-0000-0000-0000-000000000001';
      submissionsStore.set(userASub, {
        id: userASub,
        problemId: PROBLEM_1_ID,
        userId: USER_A,
        code: 'const privateCode = 42;',
        language: 'javascript',
        status: SubmissionStatus.COMPLETED,
        verdict: Verdict.ACCEPTED,
        createdAt: new Date(),
        updatedAt: new Date(),
        retryCount: 0,
      });

      const res = await dispatchHttp('GET', `/api/submissions/${userASub}`, {
        headers: { Cookie: cookieFor(USER_B) },
      });
      expect(res.status).toBe(403);
    });

    it('returns complete submission details including source code and sanitized testcases for owner', async () => {
      const subId = '10000000-0000-0000-0000-000000000001';
      const rawTestCases: TestCaseResult[] = [
        {
          index: 1,
          verdict: Verdict.ACCEPTED,
          executionTimeMs: 12,
          memoryUsedKb: 5400,
          isHidden: false,
          sampleInput: '1 2',
          sampleExpectedOutput: '3',
          actualOutput: '3',
        },
        {
          index: 2,
          verdict: Verdict.ACCEPTED,
          executionTimeMs: 15,
          memoryUsedKb: 5600,
          isHidden: true,
          sampleInput: 'SECRET_INPUT_DO_NOT_LEAK',
          sampleExpectedOutput: 'SECRET_EXPECTED',
          actualOutput: 'SECRET_ACTUAL',
        },
      ];

      submissionsStore.set(subId, {
        id: subId,
        problemId: PROBLEM_1_ID,
        userId: USER_A,
        code: 'def add(a, b):\n    return a + b\n',
        language: 'python',
        status: SubmissionStatus.COMPLETED,
        verdict: Verdict.ACCEPTED,
        executionTimeMs: 15,
        memoryUsedKb: 5600,
        failedTestIndex: null,
        testCaseResults: rawTestCases,
        retryCount: 0,
        createdAt: new Date('2026-11-17T12:00:00Z'),
        updatedAt: new Date('2026-11-17T12:00:00Z'),
      });

      const res = await dispatchHttp('GET', `/api/submissions/${subId}`, {
        headers: { Cookie: cookieFor(USER_A) },
      });

      expect(res.status).toBe(200);
      const sub = res.body.data.submission;
      expect(sub.id).toBe(subId);
      expect(sub.problemTitle).toBe('Two Sum');
      expect(sub.code).toBe('def add(a, b):\n    return a + b\n');
      expect(sub.language).toBe('python');

      // Check testcases sanitization: hidden test case input/output must not leak!
      expect(sub.testCaseResults).toHaveLength(2);
      const publicTc = sub.testCaseResults[0];
      const hiddenTc = sub.testCaseResults[1];

      expect(publicTc.isHidden).toBe(false);
      expect(publicTc.sampleInput).toBe('1 2');

      expect(hiddenTc.isHidden).toBe(true);
      expect(hiddenTc.sampleInput).toBeUndefined();
      expect(hiddenTc.sampleExpectedOutput).toBeUndefined();
      expect(hiddenTc.actualOutput).toBeUndefined();
    });
  });
});
