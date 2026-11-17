import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { LIMITS, REDIS_KEYS, Role, Verdict, SubmissionStatus, ERROR_CODES } from '@judge/shared';
import { memoryDb } from '../src/config/db.js';
import { env } from '../src/config/env.js';

const USER_A = '11111111-1111-4111-8111-111111111111';
const USER_B = '22222222-2222-4222-8222-222222222222';
const PROBLEM_ID = '33333333-3333-4333-8333-333333333333';
const SUBMISSION_ID = '44444444-4444-4444-8444-444444444444';

const { mockRedisStore, mockSampleAdd, mockJudgeAdd, state, submissionsStore } = vi.hoisted(() => ({
  mockRedisStore: new Map<string, string>(),
  mockSampleAdd: vi.fn().mockResolvedValue({ id: 'sample-job-1' }),
  mockJudgeAdd: vi.fn().mockResolvedValue({ id: 'judge-job-1' }),
  submissionsStore: new Map<string, any>(),
  state: {
    redisOnline: true,
    dbSubmissionInserts: 0,
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
  judgeQueue: { add: mockJudgeAdd, getJob: vi.fn().mockResolvedValue(null) },
  sampleRunQueue: { add: mockSampleAdd },
}));

function extractParamValue(cond: any): any {
  if (!cond) return undefined;
  if ('value' in cond && typeof cond.value === 'string') return cond.value;
  if (Array.isArray(cond.queryChunks)) {
    for (const chunk of cond.queryChunks) {
      if (
        chunk &&
        typeof chunk === 'object' &&
        'value' in chunk &&
        typeof chunk.value === 'string'
      ) {
        return chunk.value;
      }
    }
  }
  return undefined;
}

vi.mock('../src/db/index.js', () => ({
  db: {
    select: () => ({
      from: (table: unknown) => {
        const tableName = (table as Record<symbol, string>)?.[Symbol.for('drizzle:Name')] || '';
        return {
          where: (cond: any) => ({
            limit: async () => {
              if (tableName === 'users') {
                const targetId = extractParamValue(cond);
                if (targetId && memoryDb.users.has(targetId)) {
                  const u = memoryDb.users.get(targetId)!;
                  return [{ id: u.id, username: u.username, email: u.email, role: u.role }];
                }
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
                    sampleInput: 'ORIGINAL_SAMPLE_INPUT',
                    sampleExpectedOutput: 'ORIGINAL_SAMPLE_OUTPUT',
                    timeLimitMs: 1500,
                    memoryLimitMb: 128,
                    visibility: 'public',
                    setterId: USER_A,
                    isArchived: false,
                  },
                ];
              }
              if (tableName === 'submissions') {
                const targetSubId = extractParamValue(cond);
                if (targetSubId) {
                  const sub = submissionsStore.get(targetSubId);
                  return sub ? [sub] : [];
                }
                return Array.from(submissionsStore.values());
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

function cookieFor(userId: string, role: Role = Role.USER) {
  const token = jwt.sign({ id: userId, role }, env.JWT_SECRET, { expiresIn: '15m' });
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

describe('Phase 2 — Custom Input & Test Case Results Persistence API', () => {
  beforeEach(() => {
    mockRedisStore.clear();
    submissionsStore.clear();
    vi.clearAllMocks();
    state.redisOnline = true;
    state.dbSubmissionInserts = 0;

    memoryDb.users.clear();
    memoryDb.users.set(USER_A, {
      id: USER_A,
      username: 'user_a',
      email: 'a@example.com',
      password_hash: 'hash',
      role: Role.USER,
      created_at: new Date(),
      updated_at: new Date(),
    });
    memoryDb.users.set(USER_B, {
      id: USER_B,
      username: 'user_b',
      email: 'b@example.com',
      password_hash: 'hash',
      role: Role.USER,
      created_at: new Date(),
      updated_at: new Date(),
    });
  });

  describe('Custom Input Execution (POST /api/submissions/run-sample)', () => {
    it('enqueues sample run job with customInput and isCustomInput: true', async () => {
      const customText = '10 20 30\n40 50 60';
      const res = await dispatchHttp('POST', '/api/submissions/run-sample', {
        headers: { Cookie: cookieFor(USER_A) },
        body: {
          problemId: PROBLEM_ID,
          code: 'console.log("running custom");',
          language: 'javascript',
          customInput: customText,
        },
      });

      expect(res.status).toBe(202);
      expect(res.body.data.runId).toBeDefined();
      expect(res.body.data.status).toBe('QUEUED');

      // Verify BullMQ job data passed custom input and flagged isCustomInput
      expect(mockSampleAdd).toHaveBeenCalledTimes(1);
      const enqueuedData = mockSampleAdd.mock.calls[0][1];
      expect(enqueuedData.isCustomInput).toBe(true);
      expect(enqueuedData.customInput).toBe(customText);
      expect(enqueuedData.sampleInput).toBe(customText);

      // Verify Redis initial state stored isCustomInput and omitted expectedOutput
      const runId = res.body.data.runId;
      const rawStored = mockRedisStore.get(REDIS_KEYS.SAMPLE_RUN_JOB(runId));
      expect(rawStored).toBeDefined();
      const stored = JSON.parse(rawStored!);
      expect(stored.isCustomInput).toBe(true);
      expect(stored.customInput).toBe(customText);
      expect(stored.expectedOutput).toBeUndefined();

      // Verify no official submission records were created
      expect(state.dbSubmissionInserts).toBe(0);
    });

    it('accepts empty customInput string without error', async () => {
      const res = await dispatchHttp('POST', '/api/submissions/run-sample', {
        headers: { Cookie: cookieFor(USER_A) },
        body: {
          problemId: PROBLEM_ID,
          code: 'print("empty custom input")',
          language: 'python',
          customInput: '',
        },
      });

      expect(res.status).toBe(202);
      expect(res.body.data.runId).toBeDefined();
      const enqueuedData = mockSampleAdd.mock.calls[0][1];
      expect(enqueuedData.isCustomInput).toBe(true);
      expect(enqueuedData.customInput).toBe('');
    });

    it('rejects oversized custom input exceeding LIMITS.MAX_CODE_SIZE_BYTES (64KB) with 400', async () => {
      const oversized = 'A'.repeat(LIMITS.MAX_CODE_SIZE_BYTES + 1);
      const res = await dispatchHttp('POST', '/api/submissions/run-sample', {
        headers: { Cookie: cookieFor(USER_A) },
        body: {
          problemId: PROBLEM_ID,
          code: 'print("oversized")',
          language: 'python',
          customInput: oversized,
        },
      });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe(ERROR_CODES.VALIDATION_ERROR);
      expect(res.body.message).toContain('64 KB');
      expect(mockSampleAdd).not.toHaveBeenCalled();
    });
  });

  describe('Submission Test-Case Results Persistence & Security (GET /api/submissions/:id)', () => {
    it('returns sanitized test-case results for the submission owner', async () => {
      const rawSubmission = {
        id: SUBMISSION_ID,
        problemId: PROBLEM_ID,
        userId: USER_A,
        contestId: null,
        code: 'def solve(): pass',
        language: 'python',
        status: SubmissionStatus.COMPLETED,
        verdict: Verdict.WRONG_ANSWER,
        executionTimeMs: 45,
        memoryUsedKb: 8192,
        failedTestIndex: 1,
        testCaseResults: [
          {
            index: 0,
            verdict: Verdict.ACCEPTED,
            executionTimeMs: 15,
            memoryUsedKb: 4096,
            isHidden: false,
            sampleInput: 'public input 1',
            sampleExpectedOutput: 'public expected 1',
            actualOutput: 'public expected 1',
            diagnostic: 'Clean run',
          },
          {
            index: 1,
            verdict: Verdict.WRONG_ANSWER,
            executionTimeMs: 30,
            memoryUsedKb: 8192,
            isHidden: true,
            sampleInput: 'TOP_SECRET_HIDDEN_INPUT_DATA',
            sampleExpectedOutput: 'TOP_SECRET_EXPECTED_OUTPUT',
            actualOutput: 'WRONG_ACTUAL_OUTPUT',
            diagnostic: 'Secret assertion failed',
          },
          {
            index: 2,
            verdict: Verdict.NOT_EXECUTED,
            executionTimeMs: 0,
            memoryUsedKb: 0,
            isHidden: true,
            sampleInput: 'ANOTHER_HIDDEN_INPUT',
          },
        ],
        retryCount: 0,
        createdAt: new Date('2026-11-17T12:00:00Z'),
        updatedAt: new Date('2026-11-17T12:00:01Z'),
      };

      submissionsStore.set(SUBMISSION_ID, rawSubmission);

      const res = await dispatchHttp('GET', `/api/submissions/${SUBMISSION_ID}`, {
        headers: { Cookie: cookieFor(USER_A) },
      });

      expect(res.status).toBe(200);
      expect(res.body.data.submission).toBeDefined();

      const tcResults = res.body.data.submission.testCaseResults;
      expect(tcResults).toBeDefined();
      expect(tcResults).toHaveLength(3);

      // Public test case retains visible fields
      expect(tcResults[0].index).toBe(0);
      expect(tcResults[0].verdict).toBe(Verdict.ACCEPTED);
      expect(tcResults[0].isHidden).toBe(false);
      expect(tcResults[0].sampleInput).toBe('public input 1');
      expect(tcResults[0].sampleExpectedOutput).toBe('public expected 1');
      expect(tcResults[0].actualOutput).toBe('public expected 1');
      expect(tcResults[0].diagnostic).toBe('Clean run');

      // Hidden test case 1: sensitive input/output/diagnostic MUST be stripped
      expect(tcResults[1].index).toBe(1);
      expect(tcResults[1].verdict).toBe(Verdict.WRONG_ANSWER);
      expect(tcResults[1].isHidden).toBe(true);
      expect(tcResults[1].sampleInput).toBeUndefined();
      expect(tcResults[1].sampleExpectedOutput).toBeUndefined();
      expect(tcResults[1].actualOutput).toBeUndefined();
      expect(tcResults[1].diagnostic).toBeUndefined();

      // Hidden test case 2: NOT_EXECUTED verdict preserved, sensitive input stripped
      expect(tcResults[2].index).toBe(2);
      expect(tcResults[2].verdict).toBe(Verdict.NOT_EXECUTED);
      expect(tcResults[2].isHidden).toBe(true);
      expect(tcResults[2].sampleInput).toBeUndefined();
    });

    it('forbids another user from viewing the submission (403 Forbidden)', async () => {
      const rawSubmission = {
        id: SUBMISSION_ID,
        problemId: PROBLEM_ID,
        userId: USER_A,
        contestId: null,
        code: 'def solve(): pass',
        language: 'python',
        status: SubmissionStatus.COMPLETED,
        verdict: Verdict.ACCEPTED,
        executionTimeMs: 20,
        memoryUsedKb: 4096,
        failedTestIndex: null,
        testCaseResults: [],
        retryCount: 0,
        createdAt: new Date('2026-11-17T12:00:00Z'),
        updatedAt: new Date('2026-11-17T12:00:01Z'),
      };

      submissionsStore.set(SUBMISSION_ID, rawSubmission);

      // User B attempts to access User A's submission
      const res = await dispatchHttp('GET', `/api/submissions/${SUBMISSION_ID}`, {
        headers: { Cookie: cookieFor(USER_B) },
      });

      expect(res.status).toBe(403);
      expect(res.body.code).toBe(ERROR_CODES.FORBIDDEN);
      expect(res.body.message).toContain('Access denied');
    });

    it('returns 404 Not Found when submission does not exist', async () => {
      const nonExistentId = '99999999-9999-4999-8999-999999999999';
      const res = await dispatchHttp('GET', `/api/submissions/${nonExistentId}`, {
        headers: { Cookie: cookieFor(USER_A) },
      });

      expect(res.status).toBe(404);
      expect(res.body.code).toBe(ERROR_CODES.NOT_FOUND);
    });
  });
});
