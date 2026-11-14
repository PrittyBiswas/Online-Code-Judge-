import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { SubmissionStatus, ProblemDifficulty, Role } from '@judge/shared';
import { memoryDb } from '../src/config/db.js';
import { problems, submissions, users } from '../src/db/schema.js';
import { env } from '../src/config/env.js';

const TEST_SETTER_ID = '11111111-1111-4111-8111-111111111111';
const TEST_USER_ID = '22222222-2222-4222-8222-222222222222';
const OTHER_USER_ID = '33333333-3333-4333-8333-333333333333';

const { mockRedisStore, mockJudgeAdd, mockJudgeGetJob, state } = vi.hoisted(() => ({
  mockRedisStore: new Map<string, string>(),
  mockJudgeAdd: vi.fn().mockResolvedValue({ id: 'judge-job-1' }),
  mockJudgeGetJob: vi.fn().mockResolvedValue(null),
  state: { redisOnline: true },
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
  judgeQueue: { add: mockJudgeAdd, getJob: mockJudgeGetJob },
  sampleRunQueue: { add: vi.fn() },
}));

function mapProblem(p: any) {
  return {
    id: p.id,
    title: p.title,
    slug: p.slug,
    statement: p.statement,
    difficulty: p.difficulty,
    tags: p.tags,
    timeLimitMs: p.time_limit_ms,
    memoryLimitMb: p.memory_limit_mb,
    sampleInput: p.sample_input,
    sampleExpectedOutput: p.sample_expected_output,
    visibility: p.visibility ?? 'public',
    setterId: p.setter_id,
    isArchived: p.is_archived,
    createdAt: p.created_at,
    updatedAt: p.updated_at,
  };
}

function mapSubmission(s: any) {
  return {
    id: s.id,
    problemId: s.problem_id,
    userId: s.user_id,
    code: s.code,
    language: s.language,
    status: s.status,
    verdict: s.verdict,
    executionTimeMs: s.execution_time_ms,
    memoryUsedKb: s.memory_used_kb,
    failedTestIndex: s.failed_test_index,
    retryCount: s.retry_count,
    createdAt: s.created_at,
    updatedAt: s.updated_at,
  };
}

vi.mock('../src/db/index.js', () => {
  const buildTx = () => ({
    insert: (table: unknown) => ({
      values: (vals: any) => {
        if (table === problems) {
          const now = new Date();
          const row = {
            id: vals.id,
            title: vals.title,
            slug: vals.slug,
            statement: vals.statement,
            difficulty: vals.difficulty,
            tags: vals.tags || [],
            time_limit_ms: vals.timeLimitMs ?? 2000,
            memory_limit_mb: vals.memoryLimitMb ?? 128,
            sample_input: vals.sampleInput ?? '',
            sample_expected_output: vals.sampleExpectedOutput ?? '',
            setter_id: vals.setterId,
            is_archived: false,
            created_at: now,
            updated_at: now,
          };
          memoryDb.problems.set(row.id, row);
          return { returning: async () => [mapProblem(row)] };
        }
        return Promise.resolve();
      },
    }),
  });

  return {
    db: {
      transaction: async (fn: (tx: ReturnType<typeof buildTx>) => Promise<any>) => fn(buildTx()),
      select: () => ({
        from: (table: unknown) => ({
          where: () => ({
            limit: async () => {
              if (table === problems) {
                return Array.from(memoryDb.problems.values()).map(mapProblem);
              }
              if (table === users) {
                return Array.from(memoryDb.users.values()).map((u) => ({
                  id: u.id,
                  username: u.username,
                  email: u.email,
                  role: u.role,
                }));
              }
              return Array.from(memoryDb.submissions.values()).map(mapSubmission);
            },
            orderBy: () => ({
              limit: async (n: number) =>
                Array.from(memoryDb.submissions.values())
                  .sort((a, b) => b.created_at.getTime() - a.created_at.getTime())
                  .slice(0, n)
                  .map(mapSubmission),
            }),
          }),
        }),
      }),
      insert: (table: unknown) => ({
        values: (vals: any) => ({
          returning: async () => {
            if (table === submissions) {
              const id = crypto.randomUUID();
              const now = new Date();
              const row = {
                id,
                problem_id: vals.problemId,
                user_id: vals.userId,
                code: vals.code,
                language: vals.language,
                status: vals.status,
                verdict: null,
                execution_time_ms: null,
                memory_used_kb: null,
                failed_test_index: null,
                retry_count: vals.retryCount ?? 0,
                created_at: now,
                updated_at: now,
              };
              memoryDb.submissions.set(id, row);
              return [mapSubmission(row)];
            }
            return [];
          },
        }),
      }),
      delete: (table: unknown) => ({
        where: async () => {
          if (table === submissions) {
            memoryDb.submissions.clear();
          }
        },
      }),
    },
    pool: { query: vi.fn(), end: vi.fn() },
    checkDatabaseConnection: vi.fn().mockResolvedValue(true),
    closeDatabase: vi.fn().mockResolvedValue(undefined),
  };
});

import { submissionsService } from '../src/modules/submissions/submissions.service.js';
import { problemsService } from '../src/modules/problems/problems.service.js';
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

describe('Submissions Service & Day 15 Official Submission API (AC-SJ-01, AC-SJ-10, AC-SJ-11)', () => {
  let problemId: string;

  beforeEach(async () => {
    memoryDb.problems.clear();
    memoryDb.submissions.clear();
    memoryDb.users.clear();
    mockRedisStore.clear();
    mockJudgeAdd.mockClear();
    mockJudgeAdd.mockResolvedValue({ id: 'judge-job-1' });
    mockJudgeGetJob.mockClear();
    mockJudgeGetJob.mockResolvedValue(null);
    state.redisOnline = true;

    memoryDb.users.set(TEST_USER_ID, {
      id: TEST_USER_ID,
      username: 'user_a',
      email: 'a@example.com',
      password_hash: 'h',
      role: Role.USER,
      created_at: new Date(),
      updated_at: new Date(),
    });

    const p = await problemsService.createProblem(TEST_SETTER_ID, {
      title: 'Simple Echo',
      statement: 'Print the input.',
      difficulty: ProblemDifficulty.EASY,
      tags: [],
      timeLimitMs: 1500,
      memoryLimitMb: 64,
      sampleInput: 'Hello 42',
      sampleExpectedOutput: 'Hello 42',
    });
    problemId = p.id;
  });

  it('AC-SJ-01: returns 202 Accepted immediately with submission id and QUEUED status', async () => {
    const start = Date.now();
    const result = await submissionsService.submitCode(TEST_USER_ID, {
      problemId,
      code: 'console.log("Hello 42");',
      language: 'javascript',
    });
    const elapsed = Date.now() - start;

    expect(result.id).toBeDefined();
    expect(result.status).toBe(SubmissionStatus.QUEUED);
    expect(elapsed).toBeLessThan(500);
    expect(mockJudgeAdd).toHaveBeenCalledTimes(1);

    const stored = memoryDb.submissions.get(result.id);
    expect(stored).toBeDefined();
    expect(stored!.status).toBe(SubmissionStatus.QUEUED);
  });

  it('lists submissions for user with cursor pagination', async () => {
    for (let i = 0; i < 3; i++) {
      await submissionsService.submitCode(TEST_USER_ID, {
        problemId,
        code: `console.log(${i});`,
        language: 'javascript',
      });
    }

    const res = await submissionsService.listSubmissions(TEST_USER_ID, { limit: 2 });
    expect(res.items).toHaveLength(2);
    expect(res.nextCursor).toBeDefined();
  });

  it('enforces auth, validation, queue-failure compensation, ownership on GET /:id, and rate limits', async () => {
    const unauth = await dispatchHttp('POST', '/api/submissions', {
      body: { problemId, code: 'console.log(1)', language: 'javascript' },
    });
    expect(unauth.status).toBe(401);

    const userCookie = cookieFor(TEST_USER_ID);

    const badLang = await dispatchHttp('POST', '/api/submissions', {
      headers: { Cookie: userCookie },
      body: { problemId, code: 'fn main(){}', language: 'rust' },
    });
    expect(badLang.status).toBe(400);

    // Queue enqueue failure compensates by deleting the newly inserted QUEUED row
    mockJudgeAdd.mockRejectedValueOnce(new Error('BullMQ write failed'));
    const queueFailRes = await dispatchHttp('POST', '/api/submissions', {
      headers: { Cookie: userCookie },
      body: { problemId, code: 'console.log("queue-fail")', language: 'javascript' },
    });
    expect(queueFailRes.status).toBe(503);
    expect(memoryDb.submissions.size).toBe(0);

    // Valid HTTP 202 submission
    const okRes = await dispatchHttp('POST', '/api/submissions', {
      headers: { Cookie: userCookie },
      body: { problemId, code: 'console.log("ok-submit")', language: 'javascript' },
    });
    expect(okRes.status).toBe(202);
    expect(okRes.body.data.status).toBe(SubmissionStatus.QUEUED);
    const subId = okRes.body.data.id as string;

    // Duplicate double-click rejected with 429
    const dupRes = await dispatchHttp('POST', '/api/submissions', {
      headers: { Cookie: userCookie },
      body: { problemId, code: 'console.log("ok-submit")', language: 'javascript' },
    });
    expect(dupRes.status).toBe(429);

    // Owner can read GET /api/submissions/:id
    const ownerGet = await dispatchHttp('GET', `/api/submissions/${subId}`, {
      headers: { Cookie: userCookie },
    });
    expect(ownerGet.status).toBe(200);
    expect(ownerGet.body.data.submission.id).toBe(subId);

    // Another user cannot read User A's submission
    memoryDb.users.clear();
    memoryDb.users.set(OTHER_USER_ID, {
      id: OTHER_USER_ID,
      username: 'user_b',
      email: 'b@example.com',
      password_hash: 'h',
      role: Role.USER,
      created_at: new Date(),
      updated_at: new Date(),
    });
    const otherGet = await dispatchHttp('GET', `/api/submissions/${subId}`, {
      headers: { Cookie: cookieFor(OTHER_USER_ID) },
    });
    expect(otherGet.status).toBe(403);
  });

  it('preserves DB row when BullMQ accepted the job before timeout or when enqueue status is ambiguous', async () => {
    memoryDb.users.set(TEST_USER_ID, {
      id: TEST_USER_ID,
      username: 'user_a',
      email: 'a@example.com',
      password_hash: 'h',
      role: Role.USER,
      created_at: new Date(),
      updated_at: new Date(),
    });
    const userCookie = cookieFor(TEST_USER_ID);

    // Case 1: judgeQueue.add times out/errors, but getJob confirms BullMQ accepted the job -> 202 + row kept
    mockJudgeAdd.mockRejectedValueOnce(new Error('Queue enqueue timeout'));
    mockJudgeGetJob.mockResolvedValueOnce({ id: 'accepted-job' });

    const acceptedDespiteTimeout = await dispatchHttp('POST', '/api/submissions', {
      headers: { Cookie: userCookie },
      body: { problemId, code: 'console.log("timeout-accepted")', language: 'javascript' },
    });
    expect(acceptedDespiteTimeout.status).toBe(202);
    expect(acceptedDespiteTimeout.body.data.status).toBe(SubmissionStatus.QUEUED);
    expect(memoryDb.submissions.size).toBe(1);

    // Case 2: judgeQueue.add errors AND getJob errors (ambiguous) -> 503 + DB row NOT deleted
    mockJudgeAdd.mockRejectedValueOnce(new Error('Queue enqueue timeout'));
    mockJudgeGetJob.mockRejectedValueOnce(new Error('Redis lookup timeout'));

    const ambiguousRes = await dispatchHttp('POST', '/api/submissions', {
      headers: { Cookie: userCookie },
      body: { problemId, code: 'console.log("ambiguous")', language: 'javascript' },
    });
    expect(ambiguousRes.status).toBe(503);
    expect(memoryDb.submissions.size).toBe(2);
  });
});
