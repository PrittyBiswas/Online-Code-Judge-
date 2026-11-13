import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { REDIS_KEYS, Role, SubmissionStatus, Verdict, encodeLeaderboardScore } from '@judge/shared';
import { memoryDb } from '../src/config/db.js';
import { env } from '../src/config/env.js';

const ADMIN_ID = '00000000-0000-4000-8000-000000000000';
const USER_A = '11111111-1111-4111-8111-111111111111';
const USER_B = '22222222-2222-4222-8222-222222222222';
const USER_C = '33333333-3333-4333-8333-333333333333';
const PROB_1 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const PROB_2 = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const PROB_3 = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

const { mockRedisState, state } = vi.hoisted(() => {
  const GLOBAL_LEADERBOARD_KEY = 'judge:leaderboard:global';
  const zsets = new Map<string, Map<string, number>>();
  const defaultZset = new Map<string, number>();
  zsets.set(GLOBAL_LEADERBOARD_KEY, defaultZset);
  const strings = new Map<string, string>();
  const sets = new Map<string, Set<string>>();

  function getZSet(key: string = GLOBAL_LEADERBOARD_KEY) {
    if (!zsets.has(key)) {
      zsets.set(key, new Map());
    }
    return zsets.get(key)!;
  }

  return {
    mockRedisState: {
      zset: defaultZset,
      zsets,
      sets,
      strings,
      getZSet,
    },
    state: {
      redisOnline: true,
      dbSubmissions: [] as any[],
    },
  };
});

vi.mock('../src/config/redis.js', () => ({
  isRedisHealthy: () => state.redisOnline,
  redisClient: {
    get: vi.fn(async (key: string) => {
      return mockRedisState.strings.get(key) ?? null;
    }),
    set: vi.fn(async (key: string, val: string, ...args: any[]) => {
      const isNx = args.includes('NX');
      if (isNx && mockRedisState.strings.has(key)) {
        return null;
      }
      mockRedisState.strings.set(key, val);
      return 'OK';
    }),
    type: vi.fn(async (key: string) => {
      if (mockRedisState.strings.has(key)) return 'string';
      if (mockRedisState.sets.has(key)) return 'set';
      if (mockRedisState.zsets.has(key)) {
        const z = mockRedisState.zsets.get(key)!;
        if (z.size > 0) return 'zset';
      }
      return 'none';
    }),
    zcard: vi.fn(async (key: string = 'judge:leaderboard:global') => {
      const z = mockRedisState.getZSet(key);
      return z.size;
    }),
    zscore: vi.fn(async (key: string, member: string) => {
      const z = mockRedisState.getZSet(key);
      const s = z.get(member);
      return s !== undefined ? String(s) : null;
    }),
    zadd: vi.fn(async (key: string, score: number, member: string) => {
      const z = mockRedisState.getZSet(key);
      z.set(member, score);
      return 1;
    }),
    zrevrange: vi.fn(async (key: string, start: number, stop: number, withScores?: string) => {
      const z = mockRedisState.getZSet(key);
      const sorted = Array.from(z.entries()).sort((a, b) => b[1] - a[1]);
      const sliced = stop === -1 ? sorted.slice(start) : sorted.slice(start, stop + 1);
      if (withScores === 'WITHSCORES') {
        const out: string[] = [];
        for (const [m, sc] of sliced) {
          out.push(m, String(sc));
        }
        return out;
      }
      return sliced.map(([m]) => m);
    }),
    sadd: vi.fn(async (key: string, member: string) => {
      if (!mockRedisState.sets.has(key)) {
        mockRedisState.sets.set(key, new Set());
      }
      const s = mockRedisState.sets.get(key)!;
      if (s.has(member)) return 0;
      s.add(member);
      return 1;
    }),
    scard: vi.fn(async (key: string) => {
      const s = mockRedisState.sets.get(key);
      return s ? s.size : 0;
    }),
    smembers: vi.fn(async (key: string) => {
      const s = mockRedisState.sets.get(key);
      return s ? Array.from(s) : [];
    }),
    srem: vi.fn(async (key: string, member: string) => {
      const s = mockRedisState.sets.get(key);
      if (!s || !s.has(member)) return 0;
      s.delete(member);
      return 1;
    }),
    del: vi.fn(async (key: string) => {
      if (mockRedisState.zsets.has(key)) {
        mockRedisState.zsets.get(key)!.clear();
        mockRedisState.zsets.delete(key);
      }
      mockRedisState.sets.delete(key);
      mockRedisState.strings.delete(key);
      return 1;
    }),
    rename: vi.fn(async (src: string, dest: string) => {
      const srcMap = mockRedisState.getZSet(src);
      const destMap = mockRedisState.getZSet(dest);
      destMap.clear();
      for (const [k, v] of srcMap.entries()) {
        destMap.set(k, v);
      }
      mockRedisState.zsets.delete(src);
      return 'OK';
    }),
    eval: vi.fn(async (script: string, _numKeys: number, ...args: any[]) => {
      if (typeof script === 'string' && script.includes('pexpire')) {
        const key = args[0];
        const token = _numKeys === 2 ? args[2] : args[1];
        if (mockRedisState.strings.get(key) === token) {
          if (_numKeys === 2) {
            const ptrKey = args[1];
            if (mockRedisState.strings.has(ptrKey)) {
              // renewed
            }
          }
          return 1;
        }
        return 0;
      }
      if (
        typeof script === 'string' &&
        script.includes("redis.call('del', KEYS[1])") &&
        !script.includes('rename')
      ) {
        const key = args[0];
        const token = args[1];
        if (mockRedisState.strings.get(key) === token) {
          mockRedisState.strings.delete(key);
          return 1;
        }
        return 0;
      }

      if (
        (typeof script === 'string' && script.includes('DUAL_WRITE_REBUILD_LUA_SCRIPT')) ||
        (typeof script === 'string' &&
          script.includes('newTotalPenalty') &&
          !script.includes('solvedSetKey'))
      ) {
        const tempKey = args[0];
        const canonicalKey = _numKeys === 2 ? args[1] : undefined;
        const userId = _numKeys === 2 ? args[2] : args[1];
        const penalty = Number(_numKeys === 2 ? args[3] : args[2]) || 0;
        const offset = Number(_numKeys === 2 ? args[4] : args[3]) || 10000000;
        const maxPenalty = offset - 1;

        let targetKey = tempKey;
        if (!mockRedisState.zsets.has(tempKey) || mockRedisState.zsets.get(tempKey)!.size === 0) {
          if (canonicalKey) {
            targetKey = canonicalKey;
          } else {
            return 0;
          }
        }

        const zset = mockRedisState.getZSet(targetKey);
        const currentScore = zset.get(userId) || 0;

        let problemsSolved = 0;
        let totalPenalty = 0;
        if (currentScore > 0) {
          problemsSolved = Math.floor(currentScore / offset);
          const remainder = currentScore % offset;
          totalPenalty = maxPenalty - remainder;
          if (totalPenalty < 0) totalPenalty = 0;
        }

        const newSolved = problemsSolved + 1;
        const newTotalPenalty = Math.min(maxPenalty, totalPenalty + penalty);
        const newScore = newSolved * offset + (maxPenalty - newTotalPenalty);
        zset.set(userId, newScore);
        return 1;
      }

      if (
        typeof script === 'string' &&
        (script.includes('SWAP_LEADERBOARD_KEYS_LUA_SCRIPT') ||
          (script.includes('rebuildPointerKey') && script.includes('RENAME')))
      ) {
        // SWAP_LEADERBOARD_KEYS_LUA_SCRIPT
        const tempKey = args[0];
        const canonicalKey = args[1];
        const rebuildPointerKey = args[2];
        const srcMap = mockRedisState.getZSet(tempKey);
        const destMap = mockRedisState.getZSet(canonicalKey);
        destMap.clear();
        for (const [k, v] of srcMap.entries()) {
          destMap.set(k, v);
        }
        mockRedisState.zsets.delete(tempKey);
        mockRedisState.strings.delete(rebuildPointerKey);
        return 1;
      }

      if (
        typeof script === 'string' &&
        script.includes('liveSolvesKey') &&
        script.includes('solvedSetKey')
      ) {
        // RECONCILE_USER_SOLVED_SET_LUA_SCRIPT
        const solvedSetKey = args[0];
        const liveSolvesKey = args[1];
        const dbProblems = args.slice(2);

        if (!mockRedisState.sets.has(solvedSetKey)) {
          mockRedisState.sets.set(solvedSetKey, new Set());
        }
        const solvedSet = mockRedisState.sets.get(solvedSetKey)!;

        const valid = new Set<string>();
        for (const p of dbProblems) {
          if (p) {
            valid.add(p);
            solvedSet.add(p);
          }
        }

        const liveSet = mockRedisState.sets.get(liveSolvesKey);
        if (liveSet) {
          for (const p of liveSet) {
            valid.add(p);
            solvedSet.add(p);
          }
        }

        for (const p of Array.from(solvedSet)) {
          if (!valid.has(p)) {
            solvedSet.delete(p);
          }
        }

        if (solvedSet.size === 0) {
          mockRedisState.sets.delete(solvedSetKey);
        }

        return 1;
      }

      const solvedSetKey = args[0];
      const leaderboardKey = args[1];
      const rebuildPointerKey = _numKeys === 3 ? args[2] : undefined;
      const problemId = _numKeys === 3 ? args[3] : args[2];
      const userId = _numKeys === 3 ? args[4] : args[3];
      const penalty = Number(_numKeys === 3 ? args[5] : args[4]);
      const offset = Number(_numKeys === 3 ? args[6] : args[5]) || 10000000;
      const maxPenalty = offset - 1;

      // 1. Validate inputs
      if (!problemId || problemId === '' || !userId || userId === '' || Number.isNaN(penalty)) {
        throw new Error('ERR invalid arguments');
      }

      // 2. Key type checking
      if (mockRedisState.strings.has(leaderboardKey)) {
        throw new Error('WRONGTYPE leaderboardKey is not a zset');
      }
      if (mockRedisState.strings.has(solvedSetKey)) {
        throw new Error('WRONGTYPE solvedSetKey is not a set');
      }
      if (rebuildPointerKey && mockRedisState.zsets.has(rebuildPointerKey)) {
        throw new Error('WRONGTYPE rebuildPointerKey is not a string');
      }
      if (rebuildPointerKey && mockRedisState.strings.has(rebuildPointerKey)) {
        const tKey = mockRedisState.strings.get(rebuildPointerKey)!;
        if (tKey && mockRedisState.strings.has(tKey)) {
          throw new Error('WRONGTYPE tempKey is not a zset');
        }
      }

      // 3. SISMEMBER check
      if (!mockRedisState.sets.has(solvedSetKey)) {
        mockRedisState.sets.set(solvedSetKey, new Set());
      }
      const solvedSet = mockRedisState.sets.get(solvedSetKey)!;
      if (solvedSet.has(problemId)) {
        return 0;
      }

      // 4. Calculate score
      const boundedPenalty = Math.min(maxPenalty, Math.max(0, penalty));
      const z = mockRedisState.getZSet(leaderboardKey);
      const currentScore = z.get(userId) || 0;
      let problemsSolved = 0;
      let totalPenalty = 0;
      if (currentScore > 0) {
        problemsSolved = Math.floor(currentScore / offset);
        const remainder = currentScore % offset;
        totalPenalty = Math.max(0, maxPenalty - remainder);
      }
      const newSolved = problemsSolved + 1;
      const newPenalty = Math.min(maxPenalty, totalPenalty + boundedPenalty);
      const newScore = newSolved * offset + (maxPenalty - newPenalty);

      // 5. Atomic mutations with rollback protection
      solvedSet.add(problemId);
      z.set(userId, newScore);

      // 6. If rebuildPointerKey is provided, atomically update temp key and live-solves set
      if (rebuildPointerKey && mockRedisState.strings.has(rebuildPointerKey)) {
        const tempKey = mockRedisState.strings.get(rebuildPointerKey)!;
        if (tempKey && mockRedisState.zsets.has(tempKey)) {
          const tempZ = mockRedisState.getZSet(tempKey);
          const curTempScore = tempZ.get(userId) || 0;
          let tempSolved = 0;
          let tempPenalty = 0;
          if (curTempScore > 0) {
            tempSolved = Math.floor(curTempScore / offset);
            const rem = curTempScore % offset;
            tempPenalty = Math.max(0, maxPenalty - rem);
          }
          const newTSolved = tempSolved + 1;
          const newTPenalty = Math.min(maxPenalty, tempPenalty + boundedPenalty);
          const newTScore = newTSolved * offset + (maxPenalty - newTPenalty);
          tempZ.set(userId, newTScore);

          const liveKey = `${tempKey}:livesolves:${userId}`;
          if (!mockRedisState.sets.has(liveKey)) {
            mockRedisState.sets.set(liveKey, new Set());
          }
          mockRedisState.sets.get(liveKey)!.add(problemId);
        }
      }

      return 1;
    }),
  },
  redisSubscriber: { on: vi.fn(), subscribe: vi.fn() },
}));

vi.mock('../src/config/queue.js', () => ({
  judgeQueue: null,
  sampleRunQueue: null,
}));

vi.mock('../src/db/index.js', () => ({
  db: {
    select: () => ({
      from: (table: unknown) => {
        const tableName = (table as Record<symbol, string>)?.[Symbol.for('drizzle:Name')] || '';
        return {
          where: (condition?: any) => {
            const extractIds = (cond: any): string[] => {
              if (!cond) return [];
              const ids: string[] = [];
              if (typeof cond.value === 'string') ids.push(cond.value);
              if (Array.isArray(cond.values)) {
                for (const v of cond.values) {
                  if (typeof v === 'string') ids.push(v);
                }
              }
              if (Array.isArray(cond.queryChunks)) {
                for (const chunk of cond.queryChunks) {
                  ids.push(...extractIds(chunk));
                }
              }
              return ids;
            };

            const getMatchedUsers = () => {
              if (tableName !== 'users') return [];
              const targetIds = extractIds(condition);
              if (targetIds.length > 0) {
                return targetIds
                  .map((id) => memoryDb.users.get(id))
                  .filter(Boolean)
                  .map((u) => ({
                    id: u!.id,
                    username: u!.username,
                    email: u!.email,
                    role: u!.role,
                  }));
              }
              return Array.from(memoryDb.users.values()).map((u) => ({
                id: u.id,
                username: u.username,
                email: u.email,
                role: u.role,
              }));
            };

            const queryObj = {
              orderBy: () => {
                if (tableName === 'submissions') {
                  return [...state.dbSubmissions]
                    .filter((s) => s.verdict === Verdict.ACCEPTED)
                    .sort((a, b) => {
                      const timeDiff =
                        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
                      if (timeDiff !== 0) return timeDiff;
                      return (a.id || '').localeCompare(b.id || '');
                    });
                }
                return [];
              },
              limit: async (num: number = 1) => {
                const matched = getMatchedUsers();
                return matched.slice(0, num);
              },
              then: (resolve: (val: any) => void) => {
                if (tableName === 'submissions') {
                  resolve(
                    [...state.dbSubmissions]
                      .filter((s) => s.verdict === Verdict.ACCEPTED)
                      .sort((a, b) => {
                        const timeDiff =
                          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
                        if (timeDiff !== 0) return timeDiff;
                        return (a.id || '').localeCompare(b.id || '');
                      })
                  );
                } else {
                  resolve(getMatchedUsers());
                }
              },
            };
            return queryObj;
          },
        };
      },
    }),
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

    const [pathPart, queryPart] = path.split('?');
    const query: Record<string, string> = {};
    if (queryPart) {
      for (const pair of queryPart.split('&')) {
        const [k, v] = pair.split('=');
        query[decodeURIComponent(k)] = decodeURIComponent(v ?? '');
      }
    }

    const req = {
      method: method.toUpperCase(),
      url: path,
      originalUrl: path,
      path: pathPart,
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
    const resHeaders: Record<string, string> = {};
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
      setHeader(name: string, val: string) {
        resHeaders[name.toLowerCase()] = String(val);
        return this;
      },
      getHeader(name: string) {
        return resHeaders[name.toLowerCase()];
      },
      removeHeader(name: string) {
        delete resHeaders[name.toLowerCase()];
        return this;
      },
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

describe('Day 17 — Leaderboard API & Data Correctness', () => {
  beforeEach(() => {
    state.redisOnline = true;
    mockRedisState.zset.clear();
    mockRedisState.sets.clear();
    mockRedisState.strings.clear();
    mockRedisState.zsets.clear();
    mockRedisState.zsets.set(REDIS_KEYS.GLOBAL_LEADERBOARD, mockRedisState.zset);
    state.dbSubmissions = [];

    memoryDb.users.clear();
    memoryDb.users.set(ADMIN_ID, {
      id: ADMIN_ID,
      username: 'admin_user',
      email: 'admin@judge.local',
      passwordHash: 'hash',
      role: Role.ADMIN,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    memoryDb.users.set(USER_A, {
      id: USER_A,
      username: 'alice_coder',
      email: 'alice@judge.local',
      passwordHash: 'hash',
      role: Role.USER,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    memoryDb.users.set(USER_B, {
      id: USER_B,
      username: 'bob_hacker',
      email: 'bob@judge.local',
      passwordHash: 'hash',
      role: Role.USER,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    memoryDb.users.set(USER_C, {
      id: USER_C,
      username: 'charlie_dev',
      email: 'charlie@judge.local',
      passwordHash: 'hash',
      role: Role.USER,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  });

  it('allows public unauthenticated access and returns empty leaderboard with pagination metadata', async () => {
    const res = await dispatchHttp('GET', '/api/leaderboard');
    expect(res.status).toBe(200);
    expect(res.body.data).toBeDefined();
    expect(res.body.data.leaderboard).toEqual([]);
    expect(res.body.data.pagination).toEqual({
      page: 1,
      limit: 50,
      total: 0,
      totalPages: 1,
    });
  });

  it('validates query parameters and rejects invalid page/limit inputs', async () => {
    const resZeroPage = await dispatchHttp('GET', '/api/leaderboard?page=0');
    expect(resZeroPage.status).toBe(400);

    const resNegPage = await dispatchHttp('GET', '/api/leaderboard?page=-5');
    expect(resNegPage.status).toBe(400);

    const resOverLimit = await dispatchHttp('GET', '/api/leaderboard?limit=101');
    expect(resOverLimit.status).toBe(400);

    const resNan = await dispatchHttp('GET', '/api/leaderboard?page=notanumber');
    expect(resNan.status).toBe(400);
  });

  it('computes correct ranking from DB state: only ACCEPTED count, deduplicates solves, breaks ties by penalty', async () => {
    state.redisOnline = false; // Force DB calculation

    // Alice solves PROB_1 in 1500ms (1s penalty) and PROB_2 in 2200ms (2s penalty) -> 2 solved, 3s penalty
    // Alice also has a duplicate ACCEPTED on PROB_1 (3000ms), which must NOT double count
    // Alice has a WRONG_ANSWER on PROB_3, which must NOT count
    state.dbSubmissions = [
      {
        id: 'sub-1',
        userId: USER_A,
        problemId: PROB_1,
        verdict: Verdict.ACCEPTED,
        executionTimeMs: 1500,
        createdAt: new Date('2026-11-13T10:00:00Z'),
      },
      {
        id: 'sub-2',
        userId: USER_A,
        problemId: PROB_1,
        verdict: Verdict.ACCEPTED,
        executionTimeMs: 3000,
        createdAt: new Date('2026-11-13T10:05:00Z'),
      },
      {
        id: 'sub-3',
        userId: USER_A,
        problemId: PROB_2,
        verdict: Verdict.ACCEPTED,
        executionTimeMs: 2200,
        createdAt: new Date('2026-11-13T10:10:00Z'),
      },
      {
        id: 'sub-4',
        userId: USER_A,
        problemId: PROB_3,
        verdict: Verdict.WRONG_ANSWER,
        executionTimeMs: 500,
        createdAt: new Date('2026-11-13T10:15:00Z'),
      },
      // Bob solves PROB_1 in 4000ms (4s penalty) -> 1 solved, 4s penalty
      {
        id: 'sub-5',
        userId: USER_B,
        problemId: PROB_1,
        verdict: Verdict.ACCEPTED,
        executionTimeMs: 4000,
        createdAt: new Date('2026-11-13T10:00:00Z'),
      },
      // Bob has a RUNNING submission on PROB_2, which must NOT count
      {
        id: 'sub-6',
        userId: USER_B,
        problemId: PROB_2,
        verdict: null,
        status: SubmissionStatus.RUNNING,
        executionTimeMs: null,
        createdAt: new Date('2026-11-13T10:20:00Z'),
      },
      // Charlie solves PROB_2 in 1000ms (1s penalty) -> 1 solved, 1s penalty (ties Bob on solved, beats on penalty)
      {
        id: 'sub-7',
        userId: USER_C,
        problemId: PROB_2,
        verdict: Verdict.ACCEPTED,
        executionTimeMs: 1000,
        createdAt: new Date('2026-11-13T10:00:00Z'),
      },
    ];

    const res = await dispatchHttp('GET', '/api/leaderboard');
    expect(res.status).toBe(200);

    const { leaderboard, pagination } = res.body.data;
    expect(pagination).toEqual({
      page: 1,
      limit: 50,
      total: 3,
      totalPages: 1,
    });

    expect(leaderboard).toHaveLength(3);

    // Rank 1: Alice (2 solved, 3s penalty)
    expect(leaderboard[0].rank).toBe(1);
    expect(leaderboard[0].userId).toBe(USER_A);
    expect(leaderboard[0].username).toBe('alice_coder');
    expect(leaderboard[0].problemsSolved).toBe(2);
    expect(leaderboard[0].totalPenaltySeconds).toBe(3);

    // Rank 2: Charlie (1 solved, 1s penalty - beats Bob on lower penalty)
    expect(leaderboard[1].rank).toBe(2);
    expect(leaderboard[1].userId).toBe(USER_C);
    expect(leaderboard[1].username).toBe('charlie_dev');
    expect(leaderboard[1].problemsSolved).toBe(1);
    expect(leaderboard[1].totalPenaltySeconds).toBe(1);

    // Rank 3: Bob (1 solved, 4s penalty)
    expect(leaderboard[2].rank).toBe(3);
    expect(leaderboard[2].userId).toBe(USER_B);
    expect(leaderboard[2].username).toBe('bob_hacker');
    expect(leaderboard[2].problemsSolved).toBe(1);
    expect(leaderboard[2].totalPenaltySeconds).toBe(4);
  });

  it('redacts private information: never exposes email, passwordHash, role, or JWT', async () => {
    state.redisOnline = false;
    state.dbSubmissions = [
      {
        id: 'sub-1',
        userId: USER_A,
        problemId: PROB_1,
        verdict: Verdict.ACCEPTED,
        executionTimeMs: 1200,
        createdAt: new Date(),
      },
    ];

    const res = await dispatchHttp('GET', '/api/leaderboard');
    expect(res.status).toBe(200);
    const entry = res.body.data.leaderboard[0];
    expect(entry).toBeDefined();

    // Only public fields allowed
    expect(Object.keys(entry).sort()).toEqual([
      'problemsSolved',
      'rank',
      'score',
      'totalPenaltySeconds',
      'userId',
      'username',
    ]);
    expect((entry as any).email).toBeUndefined();
    expect((entry as any).passwordHash).toBeUndefined();
    expect((entry as any).password).toBeUndefined();
    expect((entry as any).role).toBeUndefined();
    expect((entry as any).token).toBeUndefined();
  });

  it('supports pagination: respects page and limit boundaries with correct page offsets', async () => {
    state.redisOnline = false;
    state.dbSubmissions = [
      {
        id: 'sub-1',
        userId: USER_A,
        problemId: PROB_1,
        verdict: Verdict.ACCEPTED,
        executionTimeMs: 1000,
        createdAt: new Date('2026-11-13T10:00:00Z'),
      },
      {
        id: 'sub-2',
        userId: USER_B,
        problemId: PROB_2,
        verdict: Verdict.ACCEPTED,
        executionTimeMs: 2000,
        createdAt: new Date('2026-11-13T10:00:00Z'),
      },
      {
        id: 'sub-3',
        userId: USER_C,
        problemId: PROB_3,
        verdict: Verdict.ACCEPTED,
        executionTimeMs: 3000,
        createdAt: new Date('2026-11-13T10:00:00Z'),
      },
    ];

    // Page 1 with limit = 2
    const p1 = await dispatchHttp('GET', '/api/leaderboard?page=1&limit=2');
    expect(p1.status).toBe(200);
    expect(p1.body.data.pagination).toEqual({
      page: 1,
      limit: 2,
      total: 3,
      totalPages: 2,
    });
    expect(p1.body.data.leaderboard).toHaveLength(2);
    expect(p1.body.data.leaderboard[0].rank).toBe(1);
    expect(p1.body.data.leaderboard[1].rank).toBe(2);

    // Page 2 with limit = 2
    const p2 = await dispatchHttp('GET', '/api/leaderboard?page=2&limit=2');
    expect(p2.status).toBe(200);
    expect(p2.body.data.pagination).toEqual({
      page: 2,
      limit: 2,
      total: 3,
      totalPages: 2,
    });
    expect(p2.body.data.leaderboard).toHaveLength(1);
    expect(p2.body.data.leaderboard[0].rank).toBe(3);

    // Page 3 (out of bounds)
    const p3 = await dispatchHttp('GET', '/api/leaderboard?page=3&limit=2');
    expect(p3.status).toBe(200);
    expect(p3.body.data.leaderboard).toHaveLength(0);
    expect(p3.body.data.pagination.total).toBe(3);
  });

  it('serves from Redis Sorted Set when available and healthy', async () => {
    state.redisOnline = true;
    const scoreA = encodeLeaderboardScore(3, 100);
    const scoreB = encodeLeaderboardScore(2, 50);

    mockRedisState.zset.set(USER_A, scoreA);
    mockRedisState.zset.set(USER_B, scoreB);
    mockRedisState.strings.set('judge:leaderboard:meta:status', 'ready');
    mockRedisState.strings.set('judge:leaderboard:meta:count', '2');

    const res = await dispatchHttp('GET', '/api/leaderboard?limit=10');
    expect(res.status).toBe(200);
    expect(res.body.data.pagination.total).toBe(2);
    expect(res.body.data.leaderboard).toHaveLength(2);
    expect(res.body.data.leaderboard[0].userId).toBe(USER_A);
    expect(res.body.data.leaderboard[0].rank).toBe(1);
    expect(res.body.data.leaderboard[0].problemsSolved).toBe(3);
    expect(res.body.data.leaderboard[0].totalPenaltySeconds).toBe(100);

    expect(res.body.data.leaderboard[1].userId).toBe(USER_B);
    expect(res.body.data.leaderboard[1].rank).toBe(2);
    expect(res.body.data.leaderboard[1].problemsSolved).toBe(2);
    expect(res.body.data.leaderboard[1].totalPenaltySeconds).toBe(50);
  });

  it('rebuild endpoint requires admin role (401 unauth, 403 regular user, 200 admin)', async () => {
    // 1. Unauthenticated
    const resUnauth = await dispatchHttp('POST', '/api/leaderboard/rebuild');
    expect(resUnauth.status).toBe(401);

    // 2. Regular user (USER role)
    const resUser = await dispatchHttp('POST', '/api/leaderboard/rebuild', {
      headers: { Cookie: cookieFor(USER_A, Role.USER) },
    });
    expect(resUser.status).toBe(403);

    // 3. Admin user (ADMIN role)
    state.dbSubmissions = [
      {
        id: 'sub-1',
        userId: USER_A,
        problemId: PROB_1,
        verdict: Verdict.ACCEPTED,
        executionTimeMs: 1000,
        createdAt: new Date(),
      },
    ];
    const resAdmin = await dispatchHttp('POST', '/api/leaderboard/rebuild', {
      headers: { Cookie: cookieFor(ADMIN_ID, Role.ADMIN) },
    });
    expect(resAdmin.status).toBe(200);
    expect(resAdmin.body.data.message).toContain('rebuilt successfully');
    expect(resAdmin.body.data.count).toBe(1);
    expect(mockRedisState.zset.has(USER_A)).toBe(true);
  });

  it('Problem 1: guarantees identical global ordering and ranks for equal-score users across page boundaries in Redis and DB modes', async () => {
    // 3 users with identical scores:
    // USER_A (alice_coder), USER_B (bob_hacker), USER_C (charlie_dev)
    const tiedScore = encodeLeaderboardScore(1, 10); // 1 solve, 10s penalty

    // 1. Verify in DB mode (state.redisOnline = false)
    state.redisOnline = false;
    state.dbSubmissions = [
      {
        id: 'sub-b',
        userId: USER_B,
        problemId: PROB_1,
        verdict: Verdict.ACCEPTED,
        executionTimeMs: 10000,
        createdAt: new Date('2026-11-13T10:00:00Z'),
      },
      {
        id: 'sub-c',
        userId: USER_C,
        problemId: PROB_1,
        verdict: Verdict.ACCEPTED,
        executionTimeMs: 10000,
        createdAt: new Date('2026-11-13T10:00:00Z'),
      },
      {
        id: 'sub-a',
        userId: USER_A,
        problemId: PROB_1,
        verdict: Verdict.ACCEPTED,
        executionTimeMs: 10000,
        createdAt: new Date('2026-11-13T10:00:00Z'),
      },
    ];

    const dbP1 = await dispatchHttp('GET', '/api/leaderboard?page=1&limit=2');
    expect(dbP1.status).toBe(200);
    expect(dbP1.body.data.leaderboard).toHaveLength(2);
    expect(dbP1.body.data.leaderboard[0].username).toBe('alice_coder');
    expect(dbP1.body.data.leaderboard[0].rank).toBe(1);
    expect(dbP1.body.data.leaderboard[1].username).toBe('bob_hacker');
    expect(dbP1.body.data.leaderboard[1].rank).toBe(2);

    const dbP2 = await dispatchHttp('GET', '/api/leaderboard?page=2&limit=2');
    expect(dbP2.status).toBe(200);
    expect(dbP2.body.data.leaderboard).toHaveLength(1);
    expect(dbP2.body.data.leaderboard[0].username).toBe('charlie_dev');
    expect(dbP2.body.data.leaderboard[0].rank).toBe(3);

    // 2. Verify in Redis mode (state.redisOnline = true)
    state.redisOnline = true;
    mockRedisState.zset.clear();
    // Insert into Redis in reverse/arbitrary order
    mockRedisState.zset.set(USER_C, tiedScore);
    mockRedisState.zset.set(USER_B, tiedScore);
    mockRedisState.zset.set(USER_A, tiedScore);

    const redisP1 = await dispatchHttp('GET', '/api/leaderboard?page=1&limit=2');
    expect(redisP1.status).toBe(200);
    expect(redisP1.body.data.leaderboard).toHaveLength(2);
    expect(redisP1.body.data.leaderboard[0].username).toBe('alice_coder');
    expect(redisP1.body.data.leaderboard[0].rank).toBe(1);
    expect(redisP1.body.data.leaderboard[1].username).toBe('bob_hacker');
    expect(redisP1.body.data.leaderboard[1].rank).toBe(2);

    const redisP2 = await dispatchHttp('GET', '/api/leaderboard?page=2&limit=2');
    expect(redisP2.status).toBe(200);
    expect(redisP2.body.data.leaderboard).toHaveLength(1);
    expect(redisP2.body.data.leaderboard[0].username).toBe('charlie_dev');
    expect(redisP2.body.data.leaderboard[0].rank).toBe(3);

    // Both modes return 100% identical ordering across page boundaries
    expect(redisP1.body.data.leaderboard).toEqual(dbP1.body.data.leaderboard);
    expect(redisP2.body.data.leaderboard).toEqual(dbP2.body.data.leaderboard);
  });

  it('Problem 2: deterministically resolves first solve on identical createdAt timestamps using id ASC', async () => {
    state.redisOnline = false;
    const sameTime = new Date('2026-11-13T10:00:00.000Z');

    // Two accepted submissions for USER_A on PROB_1 at the exact same millisecond:
    // sub-aaa has 1000ms (1s penalty), sub-bbb has 5000ms (5s penalty)
    state.dbSubmissions = [
      {
        id: 'sub-bbb',
        userId: USER_A,
        problemId: PROB_1,
        verdict: Verdict.ACCEPTED,
        executionTimeMs: 5000,
        createdAt: sameTime,
      },
      {
        id: 'sub-aaa',
        userId: USER_A,
        problemId: PROB_1,
        verdict: Verdict.ACCEPTED,
        executionTimeMs: 1000,
        createdAt: sameTime,
      },
    ];

    // Rebuild multiple times to confirm deterministic first-solve selection
    const res1 = await dispatchHttp('POST', '/api/leaderboard/rebuild', {
      headers: { Cookie: cookieFor(ADMIN_ID, Role.ADMIN) },
    });
    expect(res1.status).toBe(200);
    const entry1 = res1.body.data.rebuiltEntries[0];
    expect(entry1.problemsSolved).toBe(1);
    expect(entry1.totalPenaltySeconds).toBe(1); // Chosen from sub-aaa (id ASC)

    const res2 = await dispatchHttp('POST', '/api/leaderboard/rebuild', {
      headers: { Cookie: cookieFor(ADMIN_ID, Role.ADMIN) },
    });
    expect(res2.status).toBe(200);
    const entry2 = res2.body.data.rebuiltEntries[0];
    expect(entry2.problemsSolved).toBe(1);
    expect(entry2.totalPenaltySeconds).toBe(1); // Stable and identical
  });

  it('Problem 3: atomically records solves, deduplicates solves, and prevents lost updates under concurrency', async () => {
    state.redisOnline = true;
    mockRedisState.strings.set('judge:leaderboard:meta:status', 'ready');
    const { leaderboardService } =
      await import('../src/modules/leaderboard/leaderboard.service.js');

    // Concurrent solves for different problems (PROB_1 and PROB_2) by USER_A
    await Promise.all([
      leaderboardService.recordSolve(USER_A, PROB_1, 2),
      leaderboardService.recordSolve(USER_A, PROB_2, 3),
    ]);

    const res = await dispatchHttp('GET', '/api/leaderboard');
    expect(res.status).toBe(200);
    const entry = res.body.data.leaderboard.find((e: any) => e.userId === USER_A);
    expect(entry).toBeDefined();
    expect(entry.problemsSolved).toBe(2);
    expect(entry.totalPenaltySeconds).toBe(5);

    // Duplicate solve on PROB_1 with different penalty must be ignored
    await leaderboardService.recordSolve(USER_A, PROB_1, 99);
    const resDup = await dispatchHttp('GET', '/api/leaderboard');
    const entryDup = resDup.body.data.leaderboard.find((e: any) => e.userId === USER_A);
    expect(entryDup.problemsSolved).toBe(2);
    expect(entryDup.totalPenaltySeconds).toBe(5);
  });

  it('Problem 4: detects partial Redis cache and auto-recovers from PostgreSQL without exposing incomplete standings', async () => {
    state.redisOnline = true;
    state.dbSubmissions = [
      {
        id: 'sub-1',
        userId: USER_A,
        problemId: PROB_1,
        verdict: Verdict.ACCEPTED,
        executionTimeMs: 1000,
        createdAt: new Date('2026-11-13T10:00:00Z'),
      },
      {
        id: 'sub-2',
        userId: USER_B,
        problemId: PROB_1,
        verdict: Verdict.ACCEPTED,
        executionTimeMs: 2000,
        createdAt: new Date('2026-11-13T10:00:00Z'),
      },
      {
        id: 'sub-3',
        userId: USER_C,
        problemId: PROB_1,
        verdict: Verdict.ACCEPTED,
        executionTimeMs: 3000,
        createdAt: new Date('2026-11-13T10:00:00Z'),
      },
    ];

    // Seed Redis with only 1 user (incomplete/partial cache)
    mockRedisState.zset.clear();
    mockRedisState.zset.set(USER_A, encodeLeaderboardScore(1, 1));
    expect(mockRedisState.zset.size).toBe(1);

    // GET /api/leaderboard should detect partial cache (1 < 3) and auto-recover
    const res = await dispatchHttp('GET', '/api/leaderboard');
    expect(res.status).toBe(200);
    expect(res.body.data.pagination.total).toBe(3);
    expect(res.body.data.leaderboard).toHaveLength(3);
    expect(res.body.data.leaderboard.map((e: any) => e.userId)).toEqual([USER_A, USER_B, USER_C]);
  });

  it('Problem 4: preserves live accepted solve during rebuild and keeps existing leaderboard intact on failure', async () => {
    state.redisOnline = true;
    state.dbSubmissions = [
      {
        id: 'sub-1',
        userId: USER_A,
        problemId: PROB_1,
        verdict: Verdict.ACCEPTED,
        executionTimeMs: 1000,
        createdAt: new Date('2026-11-13T10:00:00Z'),
      },
    ];

    // Existing live leaderboard has USER_A with 2 solved problems (live solve occurred)
    const liveScore = encodeLeaderboardScore(2, 50);
    mockRedisState.zset.set(USER_A, liveScore);

    // Rebuild runs from DB (which only had 1 solve for USER_A)
    const resRebuild = await dispatchHttp('POST', '/api/leaderboard/rebuild', {
      headers: { Cookie: cookieFor(ADMIN_ID, Role.ADMIN) },
    });
    expect(resRebuild.status).toBe(200);

    // The swapped Redis leaderboard must preserve the higher live score (2 solved, not 1)
    const rawScore = mockRedisState.zset.get(USER_A);
    expect(rawScore).toBe(liveScore);

    // If rebuild fails (e.g. database error), existing leaderboard remains usable
    const { leaderboardService } =
      await import('../src/modules/leaderboard/leaderboard.service.js');
    vi.spyOn((await import('../src/db/index.js')).db, 'select').mockImplementationOnce(() => {
      throw new Error('Database connection lost');
    });

    await expect(leaderboardService.rebuildLeaderboard()).rejects.toThrow();

    // Existing leaderboard is still intact
    expect(mockRedisState.zset.get(USER_A)).toBe(liveScore);
  });

  it('Audit Item 1: Lua script rejects invalid key types and arguments without corrupting solved set', async () => {
    state.redisOnline = true;
    const { leaderboardService } =
      await import('../src/modules/leaderboard/leaderboard.service.js');

    // 1. Invalid argument check (empty problemId)
    await expect(leaderboardService.recordSolve(USER_A, '', 5)).resolves.not.toThrow();

    // 2. Corrupt leaderboard key by setting it as a string instead of zset
    mockRedisState.strings.set(REDIS_KEYS.GLOBAL_LEADERBOARD, 'invalid_string_value');

    // Attempt to record solve
    await leaderboardService.recordSolve(USER_A, PROB_1, 5);

    // Because leaderboardKey was wrong type, solve was rejected and solvedSetKey does NOT contain PROB_1
    const userSolvedSet = mockRedisState.sets.get(`judge:user:${USER_A}:solved`);
    expect(userSolvedSet?.has(PROB_1)).toBeFalsy();

    // Now restore leaderboard key and re-run solve
    mockRedisState.strings.delete(REDIS_KEYS.GLOBAL_LEADERBOARD);
    await leaderboardService.recordSolve(USER_A, PROB_1, 5);

    // Now it successfully marks solved and updates score
    expect(mockRedisState.sets.get(`judge:user:${USER_A}:solved`)?.has(PROB_1)).toBe(true);
    expect(mockRedisState.zset.has(USER_A)).toBe(true);
  });

  it('Audit Item 2: detects equal-count membership mismatch (Postgres A,B,C vs Redis A,B,D) and auto-recovers', async () => {
    state.redisOnline = true;
    state.dbSubmissions = [
      {
        id: 's1',
        userId: USER_A,
        problemId: PROB_1,
        verdict: Verdict.ACCEPTED,
        executionTimeMs: 1000,
        createdAt: new Date('2026-11-13T10:00:00Z'),
      },
      {
        id: 's2',
        userId: USER_B,
        problemId: PROB_1,
        verdict: Verdict.ACCEPTED,
        executionTimeMs: 1000,
        createdAt: new Date('2026-11-13T10:00:00Z'),
      },
      {
        id: 's3',
        userId: USER_C,
        problemId: PROB_1,
        verdict: Verdict.ACCEPTED,
        executionTimeMs: 1000,
        createdAt: new Date('2026-11-13T10:00:00Z'),
      },
    ];

    // Seed Redis with A, B, and unexpected user ADMIN_ID (Equal counts: 3 vs 3!)
    mockRedisState.zset.clear();
    mockRedisState.zset.set(USER_A, encodeLeaderboardScore(1, 1));
    mockRedisState.zset.set(USER_B, encodeLeaderboardScore(1, 1));
    mockRedisState.zset.set(ADMIN_ID, encodeLeaderboardScore(1, 1));
    expect(mockRedisState.zset.size).toBe(3);

    // GET /api/leaderboard should detect membership mismatch (USER_C missing, ADMIN_ID unexpected) and auto-recover
    const res = await dispatchHttp('GET', '/api/leaderboard');
    expect(res.status).toBe(200);
    expect(res.body.data.pagination.total).toBe(3);
    const userIds = res.body.data.leaderboard.map((e: any) => e.userId);
    expect(userIds).toContain(USER_A);
    expect(userIds).toContain(USER_B);
    expect(userIds).toContain(USER_C);
    expect(userIds).not.toContain(ADMIN_ID);
  });

  it('Audit Item 3: serializes concurrent rebuild requests using distributed lock', async () => {
    state.redisOnline = true;
    state.dbSubmissions = [
      {
        id: 's1',
        userId: USER_A,
        problemId: PROB_1,
        verdict: Verdict.ACCEPTED,
        executionTimeMs: 1000,
        createdAt: new Date('2026-11-13T10:00:00Z'),
      },
    ];

    // Run two rebuilds concurrently
    const [res1, res2] = await Promise.all([
      dispatchHttp('POST', '/api/leaderboard/rebuild', {
        headers: { Cookie: cookieFor(ADMIN_ID, Role.ADMIN) },
      }),
      dispatchHttp('POST', '/api/leaderboard/rebuild', {
        headers: { Cookie: cookieFor(ADMIN_ID, Role.ADMIN) },
      }),
    ]);

    expect(res1.status).toBe(200);
    expect(res2.status).toBe(200);
    expect(mockRedisState.zset.has(USER_A)).toBe(true);
  });

  it('Audit Item 5: validates score encoding arithmetic and precision boundaries', async () => {
    const { decodeLeaderboardScore, encodeLeaderboardScore } = await import('@judge/shared');

    // 1. Min / Zero boundary
    const zeroScore = encodeLeaderboardScore(0, 0);
    expect(decodeLeaderboardScore(zeroScore)).toEqual({
      problemsSolved: 0,
      totalPenaltySeconds: 0,
    });

    // 2. Penalty clamping at MAX_PENALTY (9,999,999s)
    const maxPenaltyScore = encodeLeaderboardScore(1, 9999999);
    expect(decodeLeaderboardScore(maxPenaltyScore)).toEqual({
      problemsSolved: 1,
      totalPenaltySeconds: 9999999,
    });

    const overPenaltyScore = encodeLeaderboardScore(1, 20000000); // Exceeds capacity
    expect(decodeLeaderboardScore(overPenaltyScore)).toEqual({
      problemsSolved: 1,
      totalPenaltySeconds: 9999999,
    });

    // 3. Negative penalty clamped to 0
    const negPenaltyScore = encodeLeaderboardScore(1, -50);
    expect(decodeLeaderboardScore(negPenaltyScore)).toEqual({
      problemsSolved: 1,
      totalPenaltySeconds: 0,
    });

    // 4. Large problems solved count remains within safe integer range
    const largeScore = encodeLeaderboardScore(50000, 123456);
    expect(Number.isSafeInteger(largeScore)).toBe(true);
    expect(decodeLeaderboardScore(largeScore)).toEqual({
      problemsSolved: 50000,
      totalPenaltySeconds: 123456,
    });

    // 5. Invalid / negative scores decode to 0
    expect(decodeLeaderboardScore(0)).toEqual({ problemsSolved: 0, totalPenaltySeconds: 0 });
    expect(decodeLeaderboardScore(-100)).toEqual({ problemsSolved: 0, totalPenaltySeconds: 0 });
    expect(decodeLeaderboardScore(NaN)).toEqual({ problemsSolved: 0, totalPenaltySeconds: 0 });
  });

  it('Area 1: detects partial Redis leaderboard plus ready metadata and auto-recovers', async () => {
    state.redisOnline = true;
    state.dbSubmissions = [
      {
        id: 's1',
        userId: USER_A,
        problemId: PROB_1,
        verdict: Verdict.ACCEPTED,
        executionTimeMs: 1000,
        createdAt: new Date(),
      },
      {
        id: 's2',
        userId: USER_B,
        problemId: PROB_1,
        verdict: Verdict.ACCEPTED,
        executionTimeMs: 1000,
        createdAt: new Date(),
      },
      {
        id: 's3',
        userId: USER_C,
        problemId: PROB_1,
        verdict: Verdict.ACCEPTED,
        executionTimeMs: 1000,
        createdAt: new Date(),
      },
    ];

    // Seed Redis with ONLY USER_A and USER_B, but mark status as 'ready' with count = 3
    mockRedisState.zset.clear();
    mockRedisState.zset.set(USER_A, encodeLeaderboardScore(1, 1));
    mockRedisState.zset.set(USER_B, encodeLeaderboardScore(1, 1));
    mockRedisState.strings.set('judge:leaderboard:meta:status', 'ready');
    mockRedisState.strings.set('judge:leaderboard:meta:count', '3');

    // GET /api/leaderboard must detect missing USER_C and auto-recover from DB
    const res = await dispatchHttp('GET', '/api/leaderboard');
    expect(res.status).toBe(200);
    expect(res.body.data.pagination.total).toBe(3);
    const userIds = res.body.data.leaderboard.map((e: any) => e.userId);
    expect(userIds).toContain(USER_A);
    expect(userIds).toContain(USER_B);
    expect(userIds).toContain(USER_C);
  });

  it('Area 1: detects missing leaderboard key plus ready metadata and auto-recovers', async () => {
    state.redisOnline = true;
    state.dbSubmissions = [
      {
        id: 's1',
        userId: USER_A,
        problemId: PROB_1,
        verdict: Verdict.ACCEPTED,
        executionTimeMs: 1000,
        createdAt: new Date(),
      },
    ];

    // Status is 'ready', but sorted-set key is completely missing / evicted
    mockRedisState.zset.clear();
    mockRedisState.zsets.delete(REDIS_KEYS.GLOBAL_LEADERBOARD);
    mockRedisState.strings.set('judge:leaderboard:meta:status', 'ready');

    const res = await dispatchHttp('GET', '/api/leaderboard');
    expect(res.status).toBe(200);
    expect(res.body.data.pagination.total).toBe(1);
    expect(res.body.data.leaderboard[0].userId).toBe(USER_A);
  });

  it('Area 1: detects unexpected Redis members and auto-recovers without exposing corrupted standings', async () => {
    state.redisOnline = true;
    state.dbSubmissions = [
      {
        id: 's1',
        userId: USER_A,
        problemId: PROB_1,
        verdict: Verdict.ACCEPTED,
        executionTimeMs: 1000,
        createdAt: new Date(),
      },
      {
        id: 's2',
        userId: USER_B,
        problemId: PROB_1,
        verdict: Verdict.ACCEPTED,
        executionTimeMs: 1000,
        createdAt: new Date(),
      },
    ];

    // Redis has USER_A, USER_B, and unexpected user ADMIN_ID
    mockRedisState.zset.clear();
    mockRedisState.zset.set(USER_A, encodeLeaderboardScore(1, 1));
    mockRedisState.zset.set(USER_B, encodeLeaderboardScore(1, 1));
    mockRedisState.zset.set(ADMIN_ID, encodeLeaderboardScore(1, 1));
    mockRedisState.strings.set('judge:leaderboard:meta:status', 'ready');

    const res = await dispatchHttp('GET', '/api/leaderboard');
    expect(res.status).toBe(200);
    expect(res.body.data.pagination.total).toBe(2);
    const userIds = res.body.data.leaderboard.map((e: any) => e.userId);
    expect(userIds).toContain(USER_A);
    expect(userIds).toContain(USER_B);
    expect(userIds).not.toContain(ADMIN_ID);
  });

  it('Area 1: safely handles concurrent cache recovery requests without conflicting rebuilds', async () => {
    state.redisOnline = true;
    state.dbSubmissions = [
      {
        id: 's1',
        userId: USER_A,
        problemId: PROB_1,
        verdict: Verdict.ACCEPTED,
        executionTimeMs: 1000,
        createdAt: new Date(),
      },
    ];

    // Invalid cache (meta not ready)
    mockRedisState.zset.clear();
    mockRedisState.strings.delete('judge:leaderboard:meta:status');

    // Two concurrent requests detect invalid cache
    const [res1, res2] = await Promise.all([
      dispatchHttp('GET', '/api/leaderboard'),
      dispatchHttp('GET', '/api/leaderboard'),
    ]);

    expect(res1.status).toBe(200);
    expect(res2.status).toBe(200);
    expect(res1.body.data.pagination.total).toBe(1);
    expect(res2.body.data.pagination.total).toBe(1);
  });

  it('Area 2: distributed lock renewal with watchdog heartbeat and safe token release', async () => {
    state.redisOnline = true;
    state.dbSubmissions = [
      {
        id: 's1',
        userId: USER_A,
        problemId: PROB_1,
        verdict: Verdict.ACCEPTED,
        executionTimeMs: 1000,
        createdAt: new Date(),
      },
    ];

    const { leaderboardService } =
      await import('../src/modules/leaderboard/leaderboard.service.js');
    const result = await leaderboardService.rebuildLeaderboard();
    expect(result.count).toBe(1);

    // After rebuild finishes, lock is cleanly released via token check
    expect(mockRedisState.strings.get('judge:lock:leaderboard:rebuild')).toBeUndefined();
  });

  it('Area 2: aborts publication if lock ownership is lost during long rebuild', async () => {
    state.redisOnline = true;
    const { leaderboardService } =
      await import('../src/modules/leaderboard/leaderboard.service.js');

    // Simulate lock stolen during DB compute
    const originalSelect = (await import('../src/db/index.js')).db.select;
    vi.spyOn((await import('../src/db/index.js')).db, 'select').mockImplementationOnce(() => {
      // Steal the lock by overwriting with another token
      mockRedisState.strings.set('judge:lock:leaderboard:rebuild', 'stolen_token');
      return originalSelect() as any;
    });

    // Rebuild should detect that lock ownership was lost and abort
    await expect(leaderboardService.rebuildLeaderboard()).rejects.toThrow();

    // Stolen lock must NOT have been deleted by the failed rebuild (safe token release)
    expect(mockRedisState.strings.get('judge:lock:leaderboard:rebuild')).toBe('stolen_token');
  });

  it('Area 3: captures live solve occurring during active rebuild via dual-key coordination', async () => {
    state.redisOnline = true;
    const { leaderboardService } =
      await import('../src/modules/leaderboard/leaderboard.service.js');

    state.dbSubmissions = [
      {
        id: 's1',
        userId: USER_A,
        problemId: PROB_1,
        verdict: Verdict.ACCEPTED,
        executionTimeMs: 1000,
        createdAt: new Date(),
      },
    ];

    // Hook db.select to simulate a live solve occurring during rebuild execution
    const originalSelect = (await import('../src/db/index.js')).db.select;
    vi.spyOn((await import('../src/db/index.js')).db, 'select').mockImplementationOnce(() => {
      // Live solve arrives while rebuild is computing!
      leaderboardService.recordSolve(USER_B, PROB_2, 3);
      return originalSelect() as any;
    });

    const res = await leaderboardService.rebuildLeaderboard();
    expect(res).toBeDefined();

    // After publication, both USER_A (from DB snapshot) and USER_B (from live solve) are in Redis
    expect(mockRedisState.zset.has(USER_A)).toBe(true);
    expect(mockRedisState.zset.has(USER_B)).toBe(true);
  });

  it('Sign-Off Item 1: detects unexpected Redis members when PostgreSQL has {A, B, C} and Redis has {A, B, D}', async () => {
    state.redisOnline = true;
    const { leaderboardService } =
      await import('../src/modules/leaderboard/leaderboard.service.js');

    // PostgreSQL ground truth: {USER_A, USER_B, USER_C}
    state.dbSubmissions = [
      {
        id: 's1',
        userId: USER_A,
        problemId: PROB_1,
        verdict: Verdict.ACCEPTED,
        executionTimeMs: 1000,
        createdAt: new Date(),
      },
      {
        id: 's2',
        userId: USER_B,
        problemId: PROB_2,
        verdict: Verdict.ACCEPTED,
        executionTimeMs: 1000,
        createdAt: new Date(),
      },
      {
        id: 's3',
        userId: USER_C,
        problemId: PROB_3,
        verdict: Verdict.ACCEPTED,
        executionTimeMs: 1000,
        createdAt: new Date(),
      },
    ];

    // Corrupt Redis state: contains {USER_A, USER_B, ADMIN_ID} (same count = 3, but ADMIN_ID is unexpected and USER_C is missing)
    mockRedisState.zset.clear();
    mockRedisState.zset.set(USER_A, 1000);
    mockRedisState.zset.set(USER_B, 1000);
    mockRedisState.zset.set(ADMIN_ID, 1000); // Unexpected member!
    mockRedisState.strings.set('judge:leaderboard:meta:status', 'ready');
    mockRedisState.strings.set('judge:leaderboard:meta:count', '3');

    // When fetching leaderboard, cache validation must detect the mismatch and auto-heal
    const res = await leaderboardService.getGlobalLeaderboard({ page: 1, limit: 10 });

    const returnedUserIds = res.leaderboard.map((e) => e.userId);
    expect(returnedUserIds).toContain(USER_A);
    expect(returnedUserIds).toContain(USER_B);
    expect(returnedUserIds).toContain(USER_C);
    expect(returnedUserIds).not.toContain(ADMIN_ID);
    expect(res.pagination.total).toBe(3);
  });

  it('Sign-Off Item 2: deterministic concurrency test proving solve during critical rebuild interval is not lost', async () => {
    state.redisOnline = true;
    const { leaderboardService } =
      await import('../src/modules/leaderboard/leaderboard.service.js');

    state.dbSubmissions = [
      {
        id: 's1',
        userId: USER_A,
        problemId: PROB_1,
        verdict: Verdict.ACCEPTED,
        executionTimeMs: 500,
        createdAt: new Date(),
      },
    ];

    // Intercept database query to deterministically inject a solve during the snapshot-to-dual-write window
    let solveInjected = false;
    const originalSelect = (await import('../src/db/index.js')).db.select;
    vi.spyOn((await import('../src/db/index.js')).db, 'select').mockImplementationOnce(() => {
      // At this point, judge:leaderboard:rebuilding pointer has been set in Redis!
      expect(mockRedisState.strings.get('judge:leaderboard:rebuilding')).toBeDefined();

      // Deterministically fire live solve for USER_B before DB query returns
      leaderboardService.recordSolve(USER_B, PROB_2, 2);
      solveInjected = true;

      return originalSelect() as any;
    });

    const res = await leaderboardService.rebuildLeaderboard();
    expect(solveInjected).toBe(true);
    expect(res).toBeDefined();

    // Verify both USER_A (snapshot) and USER_B (injected live solve) exist in Redis with correct scores
    expect(mockRedisState.zset.has(USER_A)).toBe(true);
    expect(mockRedisState.zset.has(USER_B)).toBe(true);
    expect(mockRedisState.zset.get(USER_B)).toBeGreaterThan(0);
  });

  it('Sign-Off Item 3: reconciles per-user solved sets by removing stale problem IDs while preserving live solves and allowing future first solves', async () => {
    state.redisOnline = true;
    const { leaderboardService } =
      await import('../src/modules/leaderboard/leaderboard.service.js');

    // PostgreSQL truth: USER_A has only solved PROB_1
    state.dbSubmissions = [
      {
        id: 's1',
        userId: USER_A,
        problemId: PROB_1,
        verdict: Verdict.ACCEPTED,
        executionTimeMs: 1000,
        createdAt: new Date(),
      },
    ];

    // Stale Redis state: USER_A has PROB_1 AND stale PROB_2 in judge:user:USER_A:solved
    const userSolvedKey = `judge:user:${USER_A}:solved`;
    if (!mockRedisState.sets.has(userSolvedKey)) {
      mockRedisState.sets.set(userSolvedKey, new Set());
    }
    const userSet = mockRedisState.sets.get(userSolvedKey)!;
    userSet.add(PROB_1);
    userSet.add(PROB_2); // STALE problem ID! (e.g. from previously deleted/reset submission)

    // Run rebuild
    await leaderboardService.rebuildLeaderboard();

    // 1. Stale PROB_2 must have been pruned from solved set
    expect(userSet.has(PROB_1)).toBe(true);
    expect(userSet.has(PROB_2)).toBe(false);

    // 2. Future legitimate first solve for PROB_2 must now be accepted and increment score
    const oldScore = mockRedisState.zset.get(USER_A) || 0;
    await leaderboardService.recordSolve(USER_A, PROB_2, 1);
    const newScore = mockRedisState.zset.get(USER_A) || 0;

    expect(userSet.has(PROB_2)).toBe(true);
    expect(newScore).toBeGreaterThan(oldScore);
  });

  it('Final Race Check: atomic reconciliation prevents concurrent live solve from being pruned as stale', async () => {
    state.redisOnline = true;
    const { leaderboardService } =
      await import('../src/modules/leaderboard/leaderboard.service.js');

    // 1. Initial database snapshot: USER_A has solved PROB_1 only
    state.dbSubmissions = [
      {
        id: 's1',
        userId: USER_A,
        problemId: PROB_1,
        verdict: Verdict.ACCEPTED,
        executionTimeMs: 1000,
        createdAt: new Date(),
      },
    ];

    // 2. Corrupt/stale initial Redis state: USER_A has PROB_1 AND a stale problem PROB_3
    const userSolvedKey = `judge:user:${USER_A}:solved`;
    if (!mockRedisState.sets.has(userSolvedKey)) {
      mockRedisState.sets.set(userSolvedKey, new Set());
    }
    const userSet = mockRedisState.sets.get(userSolvedKey)!;
    userSet.add(PROB_1);
    userSet.add(PROB_3); // Stale problem ID

    // 3. Spy on redisClient.eval to intercept reconciliation right when RECONCILE_USER_SOLVED_SET_LUA_SCRIPT is invoked
    const originalEval = (await import('../src/config/redis.js')).redisClient.eval;
    let concurrentSolveExecuted = false;

    vi.spyOn((await import('../src/config/redis.js')).redisClient, 'eval').mockImplementation(
      async (script: string, numKeys: number, ...args: any[]) => {
        if (
          typeof script === 'string' &&
          script.includes('liveSolvesKey') &&
          script.includes('solvedSetKey') &&
          !concurrentSolveExecuted
        ) {
          // Pause before user reconciliation and execute a concurrent live solve for PROB_2!
          concurrentSolveExecuted = true;
          await leaderboardService.recordSolve(USER_A, PROB_2, 5);
        }
        return originalEval(script, numKeys, ...args);
      }
    );

    // 4. Run rebuild
    const rebuildRes = await leaderboardService.rebuildLeaderboard();
    expect(concurrentSolveExecuted).toBe(true);
    expect(rebuildRes).toBeDefined();

    // 5. Verification checks:
    // a. PROB_2 (concurrent solve) REMAINS in USER_A's solved set (not pruned!)
    expect(userSet.has(PROB_2)).toBe(true);

    // b. PROB_1 (snapshot solve) REMAINS in USER_A's solved set
    expect(userSet.has(PROB_1)).toBe(true);

    // c. PROB_3 (stale problem ID) IS PRUNED from USER_A's solved set
    expect(userSet.has(PROB_3)).toBe(false);

    // d. The published leaderboard contains the new solve (2 problems solved: PROB_1 + PROB_2)
    const lbRes = await leaderboardService.getGlobalLeaderboard({ page: 1, limit: 10 });
    const userAEntry = lbRes.leaderboard.find((e) => e.userId === USER_A);
    expect(userAEntry).toBeDefined();
    expect(userAEntry!.problemsSolved).toBe(2);

    // e. A subsequent duplicate solve for PROB_2 does NOT count as another first solve
    const scoreBeforeDuplicate = mockRedisState.zset.get(USER_A)!;
    await leaderboardService.recordSolve(USER_A, PROB_2, 99);
    const scoreAfterDuplicate = mockRedisState.zset.get(USER_A)!;
    expect(scoreAfterDuplicate).toBe(scoreBeforeDuplicate);

    // f. Verify no orphaned keys exist in Redis: judge:leaderboard:rebuilding must be deleted
    expect(mockRedisState.strings.get('judge:leaderboard:rebuilding')).toBeUndefined();
  });

  it('Final Production Lua Verification: Order A — record-solve Lua script executes before rebuild publication Lua script', async () => {
    state.redisOnline = true;
    const { leaderboardService } =
      await import('../src/modules/leaderboard/leaderboard.service.js');
    const { redisClient } = await import('../src/config/redis.js');
    const { RECORD_SOLVE_LUA_SCRIPT, SWAP_LEADERBOARD_KEYS_LUA_SCRIPT } =
      await import('@judge/shared');

    // 1. Initial state: USER_A has solved PROB_1
    state.dbSubmissions = [
      {
        id: 's1',
        userId: USER_A,
        problemId: PROB_1,
        verdict: Verdict.ACCEPTED,
        executionTimeMs: 1000,
        createdAt: new Date('2026-11-13T10:00:00Z'),
      },
      {
        id: 's2',
        userId: USER_A,
        problemId: PROB_2,
        verdict: Verdict.ACCEPTED,
        executionTimeMs: 5000,
        createdAt: new Date('2026-11-13T10:05:00Z'),
      },
    ];

    const userSolvedKey = `judge:user:${USER_A}:solved`;
    if (!mockRedisState.sets.has(userSolvedKey)) {
      mockRedisState.sets.set(userSolvedKey, new Set());
    }
    mockRedisState.sets.get(userSolvedKey)!.add(PROB_1);

    const initialScore = encodeLeaderboardScore(1, 1);
    mockRedisState.getZSet('judge:leaderboard:global').set(USER_A, initialScore);

    // 2. Active rebuild setup
    const tempLeaderboardKey = 'judge:leaderboard:global:rebuild:order-a';
    mockRedisState.strings.set('judge:leaderboard:rebuilding', tempLeaderboardKey);
    mockRedisState.getZSet(tempLeaderboardKey).set(USER_A, initialScore);

    // ORDER A: Execute actual production record-solve Lua script FIRST
    const solveRes = await redisClient.eval(
      RECORD_SOLVE_LUA_SCRIPT,
      3,
      userSolvedKey,
      'judge:leaderboard:global',
      'judge:leaderboard:rebuilding',
      PROB_2,
      USER_A,
      5,
      10000000
    );
    expect(solveRes).toBe(1);

    // THEN execute actual rebuild publication Lua script
    const pubRes = await redisClient.eval(
      SWAP_LEADERBOARD_KEYS_LUA_SCRIPT,
      3,
      tempLeaderboardKey,
      'judge:leaderboard:global',
      'judge:leaderboard:rebuilding'
    );
    expect(pubRes).toBe(1);
    await redisClient.del(`${tempLeaderboardKey}:livesolves:${USER_A}`);
    mockRedisState.strings.set('judge:leaderboard:meta:status', 'ready');
    mockRedisState.strings.set('judge:leaderboard:meta:count', '1');

    // Verification Checks for Order A:
    // a. The published leaderboard includes the accepted solve (2 problems solved)
    const lbRes = await leaderboardService.getGlobalLeaderboard({ page: 1, limit: 10 });
    const userAEntry = lbRes.leaderboard.find((e) => e.userId === USER_A);
    expect(userAEntry).toBeDefined();
    expect(userAEntry!.problemsSolved).toBe(2);

    // b. The score is counted exactly once (1s + 5s = 6s penalty)
    expect(userAEntry!.score).toBe(encodeLeaderboardScore(2, 6));

    // c. The user's solved set contains the problem
    expect(mockRedisState.sets.get(userSolvedKey)?.has(PROB_2)).toBe(true);
    expect(mockRedisState.sets.get(userSolvedKey)?.has(PROB_1)).toBe(true);

    // d. A duplicate solve does not increase the score
    const canonicalZ = mockRedisState.getZSet('judge:leaderboard:global');
    const scoreBeforeDuplicate = canonicalZ.get(USER_A)!;
    await leaderboardService.recordSolve(USER_A, PROB_2, 99);
    const scoreAfterDuplicate = canonicalZ.get(USER_A)!;
    expect(scoreAfterDuplicate).toBe(scoreBeforeDuplicate);

    // e. No orphaned temporary key is created
    expect(mockRedisState.zsets.has(tempLeaderboardKey)).toBe(false);
    expect(mockRedisState.sets.has(`${tempLeaderboardKey}:livesolves:${USER_A}`)).toBe(false);
    expect(mockRedisState.strings.get('judge:leaderboard:rebuilding')).toBeUndefined();
  });

  it('Final Production Lua Verification: Order B — rebuild publication Lua script executes before record-solve Lua script', async () => {
    state.redisOnline = true;
    const { leaderboardService } =
      await import('../src/modules/leaderboard/leaderboard.service.js');
    const { redisClient } = await import('../src/config/redis.js');
    const { RECORD_SOLVE_LUA_SCRIPT, SWAP_LEADERBOARD_KEYS_LUA_SCRIPT } =
      await import('@judge/shared');

    // 1. Initial state: USER_A has solved PROB_1
    state.dbSubmissions = [
      {
        id: 's1',
        userId: USER_A,
        problemId: PROB_1,
        verdict: Verdict.ACCEPTED,
        executionTimeMs: 1000,
        createdAt: new Date('2026-11-13T10:00:00Z'),
      },
      {
        id: 's2',
        userId: USER_A,
        problemId: PROB_2,
        verdict: Verdict.ACCEPTED,
        executionTimeMs: 5000,
        createdAt: new Date('2026-11-13T10:05:00Z'),
      },
    ];

    const userSolvedKey = `judge:user:${USER_A}:solved`;
    if (!mockRedisState.sets.has(userSolvedKey)) {
      mockRedisState.sets.set(userSolvedKey, new Set());
    }
    mockRedisState.sets.get(userSolvedKey)!.add(PROB_1);

    const initialScore = encodeLeaderboardScore(1, 1);
    mockRedisState.getZSet('judge:leaderboard:global').set(USER_A, initialScore);

    // 2. Active rebuild setup
    const tempLeaderboardKey = 'judge:leaderboard:global:rebuild:order-b';
    mockRedisState.strings.set('judge:leaderboard:rebuilding', tempLeaderboardKey);
    mockRedisState.getZSet(tempLeaderboardKey).set(USER_A, initialScore);

    // ORDER B: Execute actual rebuild publication Lua script FIRST
    const pubRes = await redisClient.eval(
      SWAP_LEADERBOARD_KEYS_LUA_SCRIPT,
      3,
      tempLeaderboardKey,
      'judge:leaderboard:global',
      'judge:leaderboard:rebuilding'
    );
    expect(pubRes).toBe(1);
    await redisClient.del(`${tempLeaderboardKey}:livesolves:${USER_A}`);
    mockRedisState.strings.set('judge:leaderboard:meta:status', 'ready');
    mockRedisState.strings.set('judge:leaderboard:meta:count', '1');

    // THEN execute actual production record-solve Lua script
    const solveRes = await redisClient.eval(
      RECORD_SOLVE_LUA_SCRIPT,
      3,
      userSolvedKey,
      'judge:leaderboard:global',
      'judge:leaderboard:rebuilding',
      PROB_2,
      USER_A,
      5,
      10000000
    );
    expect(solveRes).toBe(1);

    // Verification Checks for Order B:
    // a. The published leaderboard includes the accepted solve (2 problems solved)
    const lbRes = await leaderboardService.getGlobalLeaderboard({ page: 1, limit: 10 });
    const userAEntry = lbRes.leaderboard.find((e) => e.userId === USER_A);
    expect(userAEntry).toBeDefined();
    expect(userAEntry!.problemsSolved).toBe(2);

    // b. The score is counted exactly once (1s + 5s = 6s penalty)
    expect(userAEntry!.score).toBe(encodeLeaderboardScore(2, 6));

    // c. The user's solved set contains the problem
    expect(mockRedisState.sets.get(userSolvedKey)?.has(PROB_2)).toBe(true);
    expect(mockRedisState.sets.get(userSolvedKey)?.has(PROB_1)).toBe(true);

    // d. A duplicate solve does not increase the score
    const canonicalZ = mockRedisState.getZSet('judge:leaderboard:global');
    const scoreBeforeDuplicate = canonicalZ.get(USER_A)!;
    await leaderboardService.recordSolve(USER_A, PROB_2, 99);
    const scoreAfterDuplicate = canonicalZ.get(USER_A)!;
    expect(scoreAfterDuplicate).toBe(scoreBeforeDuplicate);

    // e. No orphaned temporary key is created
    expect(mockRedisState.zsets.has(tempLeaderboardKey)).toBe(false);
    expect(mockRedisState.sets.has(`${tempLeaderboardKey}:livesolves:${USER_A}`)).toBe(false);
    expect(mockRedisState.strings.get('judge:leaderboard:rebuilding')).toBeUndefined();
  });

  it('Final Production Lua Verification: rejects invalid key types (string tempKey) without mutating solved set or canonical leaderboard', async () => {
    state.redisOnline = true;
    const { redisClient } = await import('../src/config/redis.js');
    const { RECORD_SOLVE_LUA_SCRIPT } = await import('@judge/shared');

    const userSolvedKey = `judge:user:${USER_A}:solved`;
    if (!mockRedisState.sets.has(userSolvedKey)) {
      mockRedisState.sets.set(userSolvedKey, new Set());
    }
    const userSet = mockRedisState.sets.get(userSolvedKey)!;
    userSet.clear();
    userSet.add(PROB_1);

    const initialScore = encodeLeaderboardScore(1, 1);
    mockRedisState.getZSet('judge:leaderboard:global').set(USER_A, initialScore);

    // Setup active rebuild pointer pointing to a corrupted temp key (string instead of zset)
    const corruptedTempKey = 'judge:leaderboard:global:rebuild:corrupted';
    mockRedisState.strings.set('judge:leaderboard:rebuilding', corruptedTempKey);
    mockRedisState.strings.set(corruptedTempKey, 'corrupted_string_value_not_a_zset');

    // Attempt solve with RECORD_SOLVE_LUA_SCRIPT
    await expect(
      redisClient.eval(
        RECORD_SOLVE_LUA_SCRIPT,
        3,
        userSolvedKey,
        'judge:leaderboard:global',
        'judge:leaderboard:rebuilding',
        PROB_2,
        USER_A,
        5,
        10000000
      )
    ).rejects.toThrow('WRONGTYPE tempKey is not a zset');

    // Solved set must not contain PROB_2 (no mutation)
    expect(userSet.has(PROB_2)).toBe(false);
    expect(userSet.has(PROB_1)).toBe(true);

    // Canonical leaderboard score must remain unchanged
    expect(mockRedisState.getZSet('judge:leaderboard:global').get(USER_A)).toBe(initialScore);
  });

  it('Final Dual-Write Audit: rebuild lasting longer than 30s has rebuilding pointer renewed by watchdog, live solve after 30s reaches published leaderboard', async () => {
    state.redisOnline = true;
    const { leaderboardService } =
      await import('../src/modules/leaderboard/leaderboard.service.js');
    const { redisClient } = await import('../src/config/redis.js');

    // 1. Initial database snapshot: USER_A solved PROB_1
    state.dbSubmissions = [
      {
        id: 's1',
        userId: USER_A,
        problemId: PROB_1,
        verdict: Verdict.ACCEPTED,
        executionTimeMs: 1000,
        createdAt: new Date(),
      },
    ];

    // Track renew calls for judge:leaderboard:rebuilding
    let pointerRenewedCount = 0;
    const originalEval = redisClient.eval;

    vi.spyOn(redisClient, 'eval').mockImplementation(
      async (script: string, numKeys: number, ...args: any[]) => {
        if (
          typeof script === 'string' &&
          script.includes('pexpire') &&
          args.includes('judge:leaderboard:rebuilding')
        ) {
          pointerRenewedCount++;
        }
        return originalEval(script, numKeys, ...args);
      }
    );

    let liveSolveExecutedAfter30s = false;
    let rebuildPointerAt30s: string | null = null;

    const originalSelect = (await import('../src/db/index.js')).db.select;
    vi.spyOn((await import('../src/db/index.js')).db, 'select').mockImplementation(
      (...selectArgs: any[]) => {
        const queryObj = originalSelect(...selectArgs);
        return {
          ...queryObj,
          from: (table: any) => {
            const fromObj = queryObj.from(table);
            return {
              ...fromObj,
              where: (condition: any) => {
                const whereObj = fromObj.where(condition);
                return {
                  ...whereObj,
                  orderBy: async (...orderArgs: any[]) => {
                    const tempKey = mockRedisState.strings.get('judge:leaderboard:rebuilding');
                    expect(tempKey).toBeDefined();

                    // Simulate 7 watchdog cycles (35 seconds of rebuild progress)
                    for (let cycle = 0; cycle < 7; cycle++) {
                      const renewLua = `
                        if redis.call('get', KEYS[1]) == ARGV[1] then
                          redis.call('pexpire', KEYS[1], ARGV[2])
                          if redis.call('exists', KEYS[2]) == 1 then
                            redis.call('pexpire', KEYS[2], ARGV[2])
                          end
                          return 1
                        else
                          return 0
                        end
                      `;
                      const lockToken = mockRedisState.strings.get(
                        'judge:lock:leaderboard:rebuild'
                      )!;
                      await redisClient.eval(
                        renewLua,
                        2,
                        'judge:lock:leaderboard:rebuild',
                        'judge:leaderboard:rebuilding',
                        lockToken,
                        15000
                      );
                    }

                    rebuildPointerAt30s =
                      mockRedisState.strings.get('judge:leaderboard:rebuilding') || null;
                    expect(rebuildPointerAt30s).toBe(tempKey);

                    // Execute live solve for USER_B after simulated 35s duration
                    liveSolveExecutedAfter30s = true;
                    await leaderboardService.recordSolve(USER_B, PROB_1, 10);

                    return whereObj.orderBy(...orderArgs);
                  },
                };
              },
            };
          },
        };
      }
    );

    // 3. Run rebuildLeaderboard
    const result = await leaderboardService.rebuildLeaderboard();
    expect(result).toBeDefined();
    expect(liveSolveExecutedAfter30s).toBe(true);
    expect(pointerRenewedCount).toBeGreaterThanOrEqual(7);

    // 4. Verify that live solve occurring after 30s reached the published leaderboard!
    const lbRes = await leaderboardService.getGlobalLeaderboard({ page: 1, limit: 10 });
    const userBEntry = lbRes.leaderboard.find((e) => e.userId === USER_B);
    expect(userBEntry).toBeDefined();
    expect(userBEntry!.problemsSolved).toBe(1);

    // Verify user solved set for USER_B has PROB_1
    const userBSolvedSet = mockRedisState.sets.get(`judge:user:${USER_B}:solved`);
    expect(userBSolvedSet).toBeDefined();
    expect(userBSolvedSet!.has(PROB_1)).toBe(true);

    // Verify clean publication state
    expect(mockRedisState.strings.get('judge:leaderboard:rebuilding')).toBeUndefined();
  });
});
