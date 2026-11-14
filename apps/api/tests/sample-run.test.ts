import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { LIMITS, REDIS_KEYS, Role } from '@judge/shared';
import { memoryDb } from '../src/config/db.js';
import { env } from '../src/config/env.js';

const USER_A = '11111111-1111-4111-8111-111111111111';
const USER_B = '22222222-2222-4222-8222-222222222222';
const PROBLEM_ID = '33333333-3333-4333-8333-333333333333';

const { mockRedisStore, mockSampleAdd, mockJudgeAdd, state } = vi.hoisted(() => ({
  mockRedisStore: new Map<string, string>(),
  mockSampleAdd: vi.fn().mockResolvedValue({ id: 'job-1' }),
  mockJudgeAdd: vi.fn().mockResolvedValue({ id: 'judge-job-1' }),
  state: {
    redisOnline: true,
    dbSubmissionInserts: 0,
    testCasesQueried: false,
  },
}));

vi.mock('../src/config/redis.js', () => ({
  isRedisHealthy: () => state.redisOnline,
  redisClient: {
    get: vi.fn(async (key: string) => mockRedisStore.get(key) ?? null),
    set: vi.fn(async (key: string, val: string, _ex?: string, _ttl?: number, nx?: string) => {
      if (nx === 'NX' && mockRedisStore.has(key)) return null;
      mockRedisStore.set(key, val);
      return 'OK';
    }),
    del: vi.fn(async (key: string) => (mockRedisStore.delete(key) ? 1 : 0)),
    incr: vi.fn(async (key: string) => {
      const next = Number(mockRedisStore.get(key) || '0') + 1;
      mockRedisStore.set(key, String(next));
      return next;
    }),
    expire: vi.fn(async () => 1),
    ttl: vi.fn(async () => 60),
  },
  redisSubscriber: { on: vi.fn(), subscribe: vi.fn() },
}));

vi.mock('../src/config/queue.js', () => ({
  judgeQueue: { add: mockJudgeAdd },
  sampleRunQueue: { add: mockSampleAdd },
}));

vi.mock('../src/db/index.js', () => ({
  db: {
    select: () => ({
      from: (table: unknown) => {
        const tableName = (table as Record<symbol, string>)?.[Symbol.for('drizzle:Name')] || '';
        if (tableName === 'test_cases') {
          state.testCasesQueried = true;
        }
        return {
          where: () => ({
            limit: async () => {
              if (tableName === 'users') {
                return Array.from(memoryDb.users.values()).map((u) => ({
                  id: u.id,
                  username: u.username,
                  email: u.email,
                  role: u.role,
                }));
              }
              if (tableName === 'problems') {
                return [
                  {
                    id: PROBLEM_ID,
                    sampleInput: 'TRUSTED_SAMPLE_INPUT',
                    sampleExpectedOutput: 'TRUSTED_SAMPLE_OUTPUT',
                    timeLimitMs: 1500,
                    memoryLimitMb: 128,
                    visibility: 'public',
                    setterId: USER_A,
                    isArchived: false,
                  },
                ];
              }
              return [];
            },
          }),
        };
      },
    }),
    insert: () => {
      state.dbSubmissionInserts += 1;
      return { values: () => ({ returning: async () => [] }) };
    },
  },
  pool: { query: vi.fn(), end: vi.fn() },
  checkDatabaseConnection: vi.fn().mockResolvedValue(true),
  closeDatabase: vi.fn().mockResolvedValue(undefined),
}));

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

    const req = {
      method: method.toUpperCase(),
      url: path,
      originalUrl: path,
      path: path.split('?')[0],
      headers,
      body: options.body ?? {},
      query: {},
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

describe('Day 14 — Sample Execution Backend & Security', () => {
  beforeEach(() => {
    mockRedisStore.clear();
    mockSampleAdd.mockClear();
    mockJudgeAdd.mockClear();
    state.redisOnline = true;
    state.dbSubmissionInserts = 0;
    state.testCasesQueried = false;

    memoryDb.users.clear();
    memoryDb.users.set(USER_A, {
      id: USER_A,
      username: 'user_a',
      email: 'a@example.com',
      password_hash: 'h',
      role: Role.USER,
      created_at: new Date(),
      updated_at: new Date(),
    });
    memoryDb.users.set(USER_B, {
      id: USER_B,
      username: 'user_b',
      email: 'b@example.com',
      password_hash: 'h',
      role: Role.USER,
      created_at: new Date(),
      updated_at: new Date(),
    });
  });

  it('rejects unauthenticated requests, unsupported languages, empty/oversized code, and client-supplied limits or customInput', async () => {
    const unauth = await dispatchHttp('POST', '/api/submissions/run-sample', {
      body: { problemId: PROBLEM_ID, code: 'console.log(1)', language: 'javascript' },
    });
    expect(unauth.status).toBe(401);

    const cookieA = cookieFor(USER_A);

    const badLang = await dispatchHttp('POST', '/api/submissions/run-sample', {
      headers: { Cookie: cookieA },
      body: { problemId: PROBLEM_ID, code: 'fn main(){}', language: 'rust' },
    });
    expect(badLang.status).toBe(400);

    const emptyCode = await dispatchHttp('POST', '/api/submissions/run-sample', {
      headers: { Cookie: cookieA },
      body: { problemId: PROBLEM_ID, code: '', language: 'javascript' },
    });
    expect(emptyCode.status).toBe(400);

    const oversized = await dispatchHttp('POST', '/api/submissions/run-sample', {
      headers: { Cookie: cookieA },
      body: {
        problemId: PROBLEM_ID,
        code: 'a'.repeat(LIMITS.MAX_CODE_SIZE_BYTES + 1),
        language: 'javascript',
      },
    });
    expect(oversized.status).toBe(400);

    const customInputAttempt = await dispatchHttp('POST', '/api/submissions/run-sample', {
      headers: { Cookie: cookieA },
      body: {
        problemId: PROBLEM_ID,
        code: 'console.log(1)',
        language: 'javascript',
        customInput: 'EVIL_INPUT',
      },
    });
    expect(customInputAttempt.status).toBe(400);

    const overrideLimitsAttempt = await dispatchHttp('POST', '/api/submissions/run-sample', {
      headers: { Cookie: cookieA },
      body: {
        problemId: PROBLEM_ID,
        code: 'console.log(2)',
        language: 'javascript',
        timeLimitMs: 999999,
      },
    });
    expect(overrideLimitsAttempt.status).toBe(400);
  });

  it('enqueues sample run with trusted DB input/limits, never touches hidden tests or submissions, and enforces job ownership', async () => {
    const cookieA = cookieFor(USER_A);
    const cookieB = cookieFor(USER_B);

    const res = await dispatchHttp('POST', '/api/submissions/run-sample', {
      headers: { Cookie: cookieA },
      body: { problemId: PROBLEM_ID, code: 'console.log(1)', language: 'javascript' },
    });
    expect(res.status).toBe(202);
    const { runId, status } = res.body.data;
    expect(status).toBe('QUEUED');
    expect(runId).toBeTruthy();

    // Never touched test_cases, official judgeQueue, or submissions table
    expect(state.testCasesQueried).toBe(false);
    expect(state.dbSubmissionInserts).toBe(0);
    expect(mockJudgeAdd).not.toHaveBeenCalled();
    expect(mockSampleAdd).toHaveBeenCalledTimes(1);
    expect(mockSampleAdd.mock.calls[0][1]).toMatchObject({
      type: 'SAMPLE_RUN',
      runId,
      problemId: PROBLEM_ID,
      userId: USER_A,
      sampleInput: 'TRUSTED_SAMPLE_INPUT',
      timeLimitMs: 1500,
      memoryLimitMb: 128,
    });

    // Owner can read result
    const ownerGet = await dispatchHttp('GET', `/api/submissions/run-sample/${runId}`, {
      headers: { Cookie: cookieA },
    });
    expect(ownerGet.status).toBe(200);
    expect(ownerGet.body.data.sampleRun.runId).toBe(runId);

    // Another user cannot read User A's sample run
    memoryDb.users.delete(USER_A);
    const otherGet = await dispatchHttp('GET', `/api/submissions/run-sample/${runId}`, {
      headers: { Cookie: cookieB },
    });
    expect(otherGet.status).toBe(403);

    // Restore USER_A for missing runId check
    memoryDb.users.set(USER_A, {
      id: USER_A,
      username: 'user_a',
      email: 'a@example.com',
      password_hash: 'h',
      role: Role.USER,
      created_at: new Date(),
      updated_at: new Date(),
    });

    // Missing runId returns 404
    const missingGet = await dispatchHttp(
      'GET',
      '/api/submissions/run-sample/44444444-4444-4444-8444-444444444444',
      { headers: { Cookie: cookieA } }
    );
    expect(missingGet.status).toBe(404);
  });

  it('enforces duplicate double-click guard, rate limit, and returns 503 when Redis is unavailable', async () => {
    const cookieA = cookieFor(USER_A);

    const first = await dispatchHttp('POST', '/api/submissions/run-sample', {
      headers: { Cookie: cookieA },
      body: { problemId: PROBLEM_ID, code: 'console.log("dup")', language: 'javascript' },
    });
    expect(first.status).toBe(202);

    const duplicate = await dispatchHttp('POST', '/api/submissions/run-sample', {
      headers: { Cookie: cookieA },
      body: { problemId: PROBLEM_ID, code: 'console.log("dup")', language: 'javascript' },
    });
    expect(duplicate.status).toBe(429);

    // Simulate exceeding 10/min rate limit
    mockRedisStore.set(REDIS_KEYS.SAMPLE_RUN_RATE(USER_A), '10');
    const rateLimited = await dispatchHttp('POST', '/api/submissions/run-sample', {
      headers: { Cookie: cookieA },
      body: { problemId: PROBLEM_ID, code: 'console.log("rate")', language: 'javascript' },
    });
    expect(rateLimited.status).toBe(429);

    // Clear rate limit, take Redis offline -> 503 safe error
    mockRedisStore.clear();
    state.redisOnline = false;
    const unavailable = await dispatchHttp('POST', '/api/submissions/run-sample', {
      headers: { Cookie: cookieA },
      body: { problemId: PROBLEM_ID, code: 'console.log("down")', language: 'javascript' },
    });
    expect(unavailable.status).toBe(503);
  });
});
