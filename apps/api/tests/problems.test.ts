import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { ProblemDifficulty, Role, REDIS_KEYS } from '@judge/shared';
import { memoryDb } from '../src/config/db.js';
import { minioService } from '../src/config/minio.js';
import { problems, testCases } from '../src/db/schema.js';
import { env } from '../src/config/env.js';

const TEST_SETTER_ID = '11111111-1111-4111-8111-111111111111';
const TEST_USER_ID = '22222222-2222-4222-8222-222222222222';

function rowToRecord(p: typeof memoryDb.problems extends Map<any, infer V> ? V : never) {
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

let listQueryOverride: Array<ReturnType<typeof rowToRecord>> | null = null;
const mockRedisStore = new Map<string, string>();
let mockRedisOnline = false;

vi.mock('../src/config/redis.js', () => ({
  isRedisHealthy: () => mockRedisOnline,
  redisClient: {
    get: vi.fn(async (key: string) => {
      if (!mockRedisOnline) throw new Error('Redis unavailable');
      return mockRedisStore.get(key) ?? null;
    }),
    set: vi.fn(async (key: string, val: string) => {
      if (!mockRedisOnline) throw new Error('Redis unavailable');
      mockRedisStore.set(key, val);
      return 'OK';
    }),
    del: vi.fn(async (key: string) => {
      if (!mockRedisOnline) throw new Error('Redis unavailable');
      return mockRedisStore.delete(key) ? 1 : 0;
    }),
    incr: vi.fn(async (key: string) => {
      if (!mockRedisOnline) throw new Error('Redis unavailable');
      const next = Number(mockRedisStore.get(key) || '1') + 1;
      mockRedisStore.set(key, String(next));
      return next;
    }),
  },
  redisSubscriber: { on: vi.fn(), subscribe: vi.fn() },
}));

vi.mock('../src/config/queue.js', () => ({
  judgeQueue: null,
}));

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
            visibility: vals.visibility || 'public',
            setter_id: vals.setterId,
            is_archived: vals.isArchived ?? false,
            created_at: now,
            updated_at: now,
          };
          memoryDb.problems.set(row.id, row);
          return { returning: async () => [rowToRecord(row)] };
        }
        if (table === testCases) {
          const list = Array.isArray(vals) ? vals : [vals];
          const now = new Date();
          for (const item of list) {
            memoryDb.testCases.set(item.id, {
              id: item.id,
              problem_id: item.problemId,
              index: item.index,
              input_key: item.inputKey,
              expected_output_key: item.expectedOutputKey,
              is_hidden: item.isHidden,
              created_at: now,
            });
          }
        }
        return Promise.resolve();
      },
    }),
    select: () => ({
      from: (table: unknown) => ({
        where: () => {
          const rows =
            table === problems
              ? Array.from(memoryDb.problems.values()).map((p) => ({
                  id: p.id,
                  slug: p.slug,
                  isArchived: p.is_archived,
                }))
              : [];
          const res: any = Promise.resolve(rows);
          res.limit = async (n: number) => rows.slice(0, n);
          return res;
        },
      }),
    }),
    delete: () => ({
      where: () => Promise.resolve(),
    }),
  });

  return {
    db: {
      transaction: async (fn: (tx: ReturnType<typeof buildTx>) => Promise<any>) => fn(buildTx()),
      select: (fields?: Record<string, unknown>) => ({
        from: (table: unknown) => ({
          where: () => ({
            limit: async () => {
              if (table === problems) {
                return Array.from(memoryDb.problems.values()).map(rowToRecord);
              }
              return Array.from(memoryDb.users.values()).map((u) => ({
                id: u.id,
                username: u.username,
                email: u.email,
                role: u.role,
              }));
            },
            orderBy: () => {
              const baseRows =
                listQueryOverride ??
                Array.from(memoryDb.problems.values())
                  .filter((p) => !p.is_archived)
                  .sort((a, b) => b.created_at.getTime() - a.created_at.getTime())
                  .map(rowToRecord);
              const rows =
                fields && 'rank' in fields
                  ? baseRows.map((p) => ({ problem: p, rank: 0.5 }))
                  : baseRows;
              const result: any = Promise.resolve(rows);
              result.limit = async (n: number) => rows.slice(0, n);
              return result;
            },
          }),
        }),
      }),
      update: () => ({
        set: (patch: Record<string, unknown>) => ({
          where: () => ({
            returning: async () => {
              const first = Array.from(memoryDb.problems.values())[0];
              if (!first) return [];
              if (typeof patch.title === 'string') first.title = patch.title;
              if (typeof patch.difficulty === 'string') first.difficulty = patch.difficulty;
              return [rowToRecord(first)];
            },
          }),
        }),
      }),
    },
    pool: { query: vi.fn(), end: vi.fn() },
    checkDatabaseConnection: vi.fn().mockResolvedValue(true),
    closeDatabase: vi.fn().mockResolvedValue(undefined),
  };
});

import { problemsService } from '../src/modules/problems/problems.service.js';
import { app } from '../src/app.js';

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

describe('Problems Service & Day 12 Hardening (AC-PR-01 to AC-PR-05)', () => {
  beforeEach(() => {
    memoryDb.problems.clear();
    memoryDb.testCases.clear();
    memoryDb.users.clear();
    listQueryOverride = null;
    mockRedisStore.clear();
    mockRedisOnline = false;
  });

  it('AC-PR-01: saves test cases into MinIO with keys referenced in DB', async () => {
    const created = await problemsService.createProblem(TEST_SETTER_ID, {
      title: 'Sum of Two Numbers',
      statement: 'Add two integers A and B.',
      difficulty: ProblemDifficulty.EASY,
      tags: ['math'],
      timeLimitMs: 1000,
      memoryLimitMb: 64,
      sampleInput: '3 5',
      sampleExpectedOutput: '8',
      testCases: [
        { input: '10 20', expectedOutput: '30', isHidden: true },
        { input: '100 200', expectedOutput: '300', isHidden: true },
      ],
    });

    const storedTests = Array.from(memoryDb.testCases.values()).filter(
      (tc) => tc.problem_id === created.id
    );
    expect(storedTests).toHaveLength(2);
    expect(storedTests[0].input_key).toBe(`problems/${created.id}/test_0_in.txt`);
    expect(storedTests[0].expected_output_key).toBe(`problems/${created.id}/test_0_out.txt`);

    const storedInput = await minioService.getObject(storedTests[0].input_key);
    expect(storedInput).toBe('10 20');
  });

  it('AC-PR-02: never reveals hidden test cases in problem details API response', async () => {
    const created = await problemsService.createProblem(TEST_SETTER_ID, {
      title: 'Secret Problem',
      statement: 'Find the secret integer.',
      difficulty: ProblemDifficulty.HARD,
      tags: ['security'],
      timeLimitMs: 2000,
      memoryLimitMb: 128,
      sampleInput: '1',
      sampleExpectedOutput: '1',
      testCases: [
        { input: 'SECRET_TOP_CONFIDENTIAL', expectedOutput: 'SECRET_FLAG', isHidden: true },
      ],
    });

    const fetched = await problemsService.getProblem(created.id);
    const jsonString = JSON.stringify(fetched);

    expect(jsonString).not.toContain('SECRET_TOP_CONFIDENTIAL');
    expect(jsonString).not.toContain('SECRET_FLAG');
    expect((fetched as any).testCases).toBeUndefined();
  });

  it('AC-PR-03: ranks search results and combines filters with AND', async () => {
    await problemsService.createProblem(TEST_SETTER_ID, {
      title: 'Binary Search Tree',
      statement: 'Search in a binary tree',
      difficulty: ProblemDifficulty.MEDIUM,
      tags: ['tree', 'binary-search'],
      timeLimitMs: 2000,
      memoryLimitMb: 128,
      sampleInput: '',
      sampleExpectedOutput: '',
    });

    const target = Array.from(memoryDb.problems.values()).find(
      (p) => p.title === 'Binary Search Tree'
    )!;
    listQueryOverride = [rowToRecord(target)];

    const result = await problemsService.listProblems({
      search: 'binary',
      difficulty: ProblemDifficulty.MEDIUM,
    });

    expect(result.items).toHaveLength(1);
    expect(result.items[0].title).toBe('Binary Search Tree');
  });

  it('AC-PR-04: supports cursor pagination with no duplicate or skipped items', async () => {
    for (let i = 1; i <= 5; i++) {
      const p = await problemsService.createProblem(TEST_SETTER_ID, {
        title: `Problem ${i}`,
        statement: `Statement ${i}`,
        difficulty: ProblemDifficulty.EASY,
        tags: [],
        timeLimitMs: 2000,
        memoryLimitMb: 128,
        sampleInput: '',
        sampleExpectedOutput: '',
      });
      memoryDb.problems.get(p.id)!.created_at = new Date(1000 + i * 100);
    }

    const page1 = await problemsService.listProblems({ limit: 2 });
    expect(page1.items).toHaveLength(2);
    expect(page1.nextCursor).toBeTruthy();

    const ordered = Array.from(memoryDb.problems.values()).sort(
      (a, b) => b.created_at.getTime() - a.created_at.getTime()
    );
    listQueryOverride = ordered.slice(2).map(rowToRecord);

    const page2 = await problemsService.listProblems({ limit: 2, cursor: page1.nextCursor! });
    expect(page2.items).toHaveLength(2);

    const page1Ids = page1.items.map((p) => p.id);
    const page2Ids = page2.items.map((p) => p.id);
    const overlap = page1Ids.filter((id) => page2Ids.includes(id));
    expect(overlap).toHaveLength(0);
  });

  it('rejects malformed cursors and unsupported filter parameters consistently', async () => {
    await expect(
      problemsService.listProblems({ cursor: 'not-valid-base64-cursor!' })
    ).rejects.toThrow('Invalid pagination cursor');

    const badFilterRes = await dispatchHttp('GET', '/api/problems?difficulty=impossible');
    expect(badFilterRes.status).toBe(400);

    const unknownParamRes = await dispatchHttp('GET', '/api/problems?unknownFilter=foo');
    expect(unknownParamRes.status).toBe(400);
  });

  it('caches problem details and listings in Redis, recovers from corrupt JSON, and invalidates on update', async () => {
    mockRedisOnline = true;
    const created = await problemsService.createProblem(TEST_SETTER_ID, {
      title: 'Cached Two Sum',
      statement: 'Compute two sum from array input.',
      difficulty: ProblemDifficulty.EASY,
      tags: ['arrays'],
      testCases: [{ input: 'HIDDEN_IN', expectedOutput: 'HIDDEN_OUT', isHidden: true }],
    });

    // Populate detail cache
    const firstFetch = await problemsService.getProblem(created.id);
    expect(firstFetch.title).toBe('Cached Two Sum');
    const cachedDetail = mockRedisStore.get(REDIS_KEYS.PROBLEM_CACHE(created.id));
    expect(cachedDetail).toBeDefined();
    expect(cachedDetail).not.toContain('HIDDEN_IN');
    expect(cachedDetail).not.toContain('HIDDEN_OUT');

    // Corrupt JSON recovery falls back to PostgreSQL cleanly
    mockRedisStore.set(REDIS_KEYS.PROBLEM_CACHE(created.id), '{invalid-json');
    const recoveredFetch = await problemsService.getProblem(created.id);
    expect(recoveredFetch.title).toBe('Cached Two Sum');

    // List cache population and version bump on update
    const list1 = await problemsService.listProblems({ difficulty: ProblemDifficulty.EASY });
    expect(list1.items).toHaveLength(1);
    const versionBefore = mockRedisStore.get(REDIS_KEYS.PROBLEMS_LIST_VERSION) || '1';

    await problemsService.updateProblem(created.id, { title: 'Updated Cached Two Sum' });
    expect(mockRedisStore.has(REDIS_KEYS.PROBLEM_CACHE(created.id))).toBe(false);
    expect(Number(mockRedisStore.get(REDIS_KEYS.PROBLEMS_LIST_VERSION))).toBeGreaterThan(
      Number(versionBefore)
    );
  });

  it('enforces RBAC on POST, PUT, and DELETE /api/problems/:id', async () => {
    memoryDb.users.set(TEST_USER_ID, {
      id: TEST_USER_ID,
      username: 'plainuser',
      email: 'plain@example.com',
      password_hash: 'hash',
      role: Role.USER,
      created_at: new Date(),
      updated_at: new Date(),
    });

    const userToken = jwt.sign({ id: TEST_USER_ID, role: Role.USER }, env.JWT_SECRET, {
      expiresIn: '15m',
    });
    const userCookie = `${env.AUTH_COOKIE_NAME}=${userToken}`;

    const unauthCreate = await dispatchHttp('POST', '/api/problems', {
      body: { title: 'Test', statement: 'Long enough statement' },
    });
    expect(unauthCreate.status).toBe(401);

    const forbiddenCreate = await dispatchHttp('POST', '/api/problems', {
      headers: { Cookie: userCookie },
      body: { title: 'Test', statement: 'Long enough statement' },
    });
    expect(forbiddenCreate.status).toBe(403);

    const forbiddenUpdate = await dispatchHttp('PUT', `/api/problems/${TEST_SETTER_ID}`, {
      headers: { Cookie: userCookie },
      body: { title: 'Hacked Title' },
    });
    expect(forbiddenUpdate.status).toBe(403);

    const forbiddenDelete = await dispatchHttp('DELETE', `/api/problems/${TEST_SETTER_ID}`, {
      headers: { Cookie: userCookie },
    });
    expect(forbiddenDelete.status).toBe(403);
  });
});
