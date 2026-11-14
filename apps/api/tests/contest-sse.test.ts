import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import { EventEmitter } from 'events';
import jwt from 'jsonwebtoken';
import { REDIS_KEYS, Role, LeaderboardEntry, ContestUpdateEvent, Verdict } from '@judge/shared';
import { env } from '../src/config/env.js';

const CONTEST_A = '11111111-1111-4111-8111-111111111111';
const CONTEST_B = '22222222-2222-4222-8222-222222222222';
const USER_1 = '33333333-3333-4333-8333-333333333333';
const ADMIN_1 = '44444444-4444-4444-8444-444444444444';

const { mockSubscriber, dbState } = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { EventEmitter: EE } = require('events') as typeof import('events');
  const sub = new EE() as import('events').EventEmitter & {
    status: string;
    subscribe: ReturnType<typeof vi.fn>;
  };
  sub.status = 'ready';
  sub.subscribe = vi.fn((_ch: string, cb?: (err: Error | null) => void) => cb?.(null));

  return {
    mockSubscriber: sub,
    dbState: {
      existingContests: new Set<string>(),
      users: new Map<string, { id: string; username: string; email: string; role: Role }>(),
      leaderboardMap: new Map<string, { public: LeaderboardEntry[]; admin: LeaderboardEntry[] }>(),
    },
  };
});

vi.mock('../src/config/redis.js', () => ({
  isRedisHealthy: () => true,
  redisClient: { get: vi.fn(), set: vi.fn(), del: vi.fn() },
  redisSubscriber: mockSubscriber,
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
          where: () => ({
            limit: async () => {
              if (tableName === 'users') {
                return Array.from(dbState.users.values());
              }
              if (tableName === 'contests') {
                // If any existing contest matches
                const hasAny = dbState.existingContests.size > 0;
                if (hasAny) {
                  return Array.from(dbState.existingContests).map((id) => ({ id }));
                }
                return [];
              }
              return [];
            },
          }),
        };
      },
    }),
  },
  pool: { query: vi.fn(), end: vi.fn() },
  checkDatabaseConnection: vi.fn().mockResolvedValue(true),
  closeDatabase: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../src/modules/contests/contests.service.js', () => ({
  contestsService: {
    getContestById: vi.fn(),
    getContestLeaderboard: vi.fn(async (contestId: string, role?: Role) => {
      const entry = dbState.leaderboardMap.get(contestId);
      if (!entry) return [];
      if (role === Role.ADMIN) return entry.admin;
      return entry.public;
    }),
  },
}));

import { app } from '../src/app.js';
import { contestSseManager } from '../src/events/contest-sse.js';

function cookieFor(userId: string, role: Role = Role.USER) {
  const token = jwt.sign({ id: userId, role }, env.JWT_SECRET, { expiresIn: '15m' });
  return `${env.AUTH_COOKIE_NAME}=${token}`;
}

function openContestSseRequest(
  path: string,
  headers: Record<string, string> = {}
): {
  req: EventEmitter;
  chunks: string[];
  statusCode: number;
  responseHeaders: Record<string, string>;
  ended: boolean;
  waitForHeaders: Promise<{ status: number; body?: any }>;
  closeClient: () => void;
} {
  const reqEmitter = new EventEmitter() as EventEmitter & Record<string, any>;
  const lowerHeaders: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) {
    lowerHeaders[k.toLowerCase()] = v;
  }

  Object.assign(reqEmitter, {
    method: 'GET',
    url: path,
    originalUrl: path,
    path: path.split('?')[0],
    headers: lowerHeaders,
    body: {},
    query: {},
    ip: '127.0.0.1',
    socket: { remoteAddress: '127.0.0.1' },
    header(name: string) {
      return lowerHeaders[name.toLowerCase()];
    },
    get(name: string) {
      return lowerHeaders[name.toLowerCase()];
    },
  });

  const resEmitter = new EventEmitter() as EventEmitter & Record<string, any>;
  const state = {
    statusCode: 200,
    responseHeaders: {} as Record<string, string>,
    chunks: [] as string[],
    ended: false,
  };

  let resolveHeaders!: (v: { status: number; body?: any }) => void;
  const waitForHeaders = new Promise<{ status: number; body?: any }>((r) => {
    resolveHeaders = r;
  });

  Object.assign(resEmitter, {
    locals: {},
    status(code: number) {
      state.statusCode = code;
      return this;
    },
    writeHead(code: number, hdrs: Record<string, string>) {
      state.statusCode = code;
      for (const [k, v] of Object.entries(hdrs)) {
        state.responseHeaders[k.toLowerCase()] = v;
      }
      resolveHeaders({ status: code });
      return this;
    },
    flushHeaders: vi.fn(),
    write(chunk: string) {
      state.chunks.push(chunk);
      return true;
    },
    json(payload: unknown) {
      resolveHeaders({ status: state.statusCode, body: payload });
      return this;
    },
    send(payload: unknown) {
      resolveHeaders({ status: state.statusCode, body: payload });
      return this;
    },
    setHeader: vi.fn((k: string, v: string) => {
      state.responseHeaders[k.toLowerCase()] = v;
    }),
    getHeader: vi.fn((k: string) => state.responseHeaders[k.toLowerCase()]),
    removeHeader: vi.fn(),
    end() {
      state.ended = true;
      return this;
    },
  });

  (app as unknown as (r: Request, s: Response, n: NextFunction) => void)(
    reqEmitter as unknown as Request,
    resEmitter as unknown as Response,
    () => {}
  );

  return {
    req: reqEmitter,
    get chunks() {
      return state.chunks;
    },
    get statusCode() {
      return state.statusCode;
    },
    get responseHeaders() {
      return state.responseHeaders;
    },
    get ended() {
      return state.ended;
    },
    waitForHeaders,
    closeClient: () => {
      reqEmitter.emit('close');
      resEmitter.emit('close');
    },
  };
}

describe('Day 19 Contest Real-Time Leaderboard SSE Unit Tests', () => {
  beforeEach(() => {
    dbState.existingContests.clear();
    dbState.leaderboardMap.clear();
    dbState.users.clear();
    (contestSseManager as any).clients.clear();

    dbState.users.set(ADMIN_1, {
      id: ADMIN_1,
      username: 'admin_user',
      email: 'admin@judge.local',
      role: Role.ADMIN,
    });
    dbState.users.set(USER_1, {
      id: USER_1,
      username: 'regular_user',
      email: 'user@judge.local',
      role: Role.USER,
    });
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('rejects connection if contest ID is not a valid UUID', async () => {
    const conn = openContestSseRequest('/api/contests/not-a-uuid/leaderboard/live');
    const res = await conn.waitForHeaders;
    expect(res.status).toBe(404);
  });

  it('rejects connection with 404 if contest does not exist in database', async () => {
    // dbState.existingContests is empty
    const conn = openContestSseRequest(`/api/contests/${CONTEST_A}/leaderboard/live`);
    const res = await conn.waitForHeaders;
    expect(res.status).toBe(404);
  });

  it('establishes SSE stream with correct headers and initial connection preamble', async () => {
    dbState.existingContests.add(CONTEST_A);
    dbState.leaderboardMap.set(CONTEST_A, {
      public: [
        {
          rank: 1,
          userId: USER_1,
          username: 'coder_one',
          score: 100,
          problemsSolved: 1,
          totalPenaltySeconds: 300,
        },
      ],
      admin: [
        {
          rank: 1,
          userId: USER_1,
          username: 'coder_one',
          score: 100,
          problemsSolved: 1,
          totalPenaltySeconds: 300,
        },
      ],
    });

    const conn = openContestSseRequest(`/api/contests/${CONTEST_A}/leaderboard/live`);
    const res = await conn.waitForHeaders;

    expect(res.status).toBe(200);
    expect(conn.responseHeaders['content-type']).toBe('text/event-stream');
    expect(conn.responseHeaders['cache-control']).toBe('no-cache, no-transform');
    expect(conn.responseHeaders['connection']).toBe('keep-alive');

    // Wait microtask for initial snapshot
    await new Promise((r) => setTimeout(r, 10));

    expect(conn.chunks[0]).toBe(': connected\n\n');
    expect(conn.chunks[1]).toContain('event: leaderboard');
    expect(conn.chunks[1]).toContain('coder_one');

    expect(contestSseManager.getClientCount(CONTEST_A)).toBe(1);

    conn.closeClient();
    expect(contestSseManager.getClientCount(CONTEST_A)).toBe(0);
  });

  it('broadcasts real-time leaderboard update when Redis contest update event arrives', async () => {
    dbState.existingContests.add(CONTEST_A);
    const initialStandings: LeaderboardEntry[] = [
      {
        rank: 1,
        userId: USER_1,
        username: 'alice',
        score: 100,
        problemsSolved: 1,
        totalPenaltySeconds: 200,
      },
    ];
    dbState.leaderboardMap.set(CONTEST_A, {
      public: initialStandings,
      admin: initialStandings,
    });

    const conn = openContestSseRequest(`/api/contests/${CONTEST_A}/leaderboard/live`);
    await conn.waitForHeaders;
    await new Promise((r) => setTimeout(r, 10));

    expect(conn.chunks.length).toBe(2);

    // Now update standings in state and emit Redis pub/sub update
    const updatedStandings: LeaderboardEntry[] = [
      {
        rank: 1,
        userId: USER_1,
        username: 'alice',
        score: 200,
        problemsSolved: 2,
        totalPenaltySeconds: 450,
      },
    ];
    dbState.leaderboardMap.set(CONTEST_A, {
      public: updatedStandings,
      admin: updatedStandings,
    });

    const eventPayload: ContestUpdateEvent = {
      contestId: CONTEST_A,
      submissionId: 'sub-123',
      problemId: 'prob-456',
      userId: USER_1,
      verdict: Verdict.ACCEPTED,
      timestamp: Date.now(),
    };

    mockSubscriber.emit(
      'message',
      REDIS_KEYS.CHANNEL_CONTEST_UPDATES,
      JSON.stringify(eventPayload)
    );

    // Allow promise tick for async broadcast
    await new Promise((r) => setTimeout(r, 15));

    expect(conn.chunks.length).toBe(3);
    expect(conn.chunks[2]).toContain('event: leaderboard');
    expect(conn.chunks[2]).toContain('"score":200');

    conn.closeClient();
  });

  it('enforces strict contest isolation: updates for contest B do not affect contest A', async () => {
    dbState.existingContests.add(CONTEST_A);
    dbState.existingContests.add(CONTEST_B);

    dbState.leaderboardMap.set(CONTEST_A, {
      public: [
        {
          rank: 1,
          userId: USER_1,
          username: 'alice_a',
          score: 100,
          problemsSolved: 1,
          totalPenaltySeconds: 100,
        },
      ],
      admin: [],
    });
    dbState.leaderboardMap.set(CONTEST_B, {
      public: [
        {
          rank: 1,
          userId: USER_1,
          username: 'bob_b',
          score: 100,
          problemsSolved: 1,
          totalPenaltySeconds: 100,
        },
      ],
      admin: [],
    });

    const connA = openContestSseRequest(`/api/contests/${CONTEST_A}/leaderboard/live`);
    const connB = openContestSseRequest(`/api/contests/${CONTEST_B}/leaderboard/live`);

    await connA.waitForHeaders;
    await connB.waitForHeaders;
    await new Promise((r) => setTimeout(r, 10));

    expect(connA.chunks.length).toBe(2);
    expect(connB.chunks.length).toBe(2);

    // Emit event for Contest B ONLY
    const eventB: ContestUpdateEvent = {
      contestId: CONTEST_B,
      submissionId: 'sub-b',
      problemId: 'prob-b',
      userId: USER_1,
      verdict: Verdict.ACCEPTED,
      timestamp: Date.now(),
    };

    mockSubscriber.emit('message', REDIS_KEYS.CHANNEL_CONTEST_UPDATES, JSON.stringify(eventB));

    await new Promise((r) => setTimeout(r, 15));

    // Client A must NOT receive any new chunk
    expect(connA.chunks.length).toBe(2);
    // Client B must receive update
    expect(connB.chunks.length).toBe(3);

    connA.closeClient();
    connB.closeClient();
  });

  it('differentiates role views: regular user receives frozen standings while admin receives live standings during freeze', async () => {
    dbState.existingContests.add(CONTEST_A);

    const frozenStandings: LeaderboardEntry[] = [
      {
        rank: 1,
        userId: USER_1,
        username: 'alice',
        score: 100,
        problemsSolved: 1,
        totalPenaltySeconds: 200,
      },
    ];

    const liveUnfrozenStandings: LeaderboardEntry[] = [
      {
        rank: 1,
        userId: USER_1,
        username: 'alice',
        score: 200,
        problemsSolved: 2,
        totalPenaltySeconds: 400,
      },
    ];

    dbState.leaderboardMap.set(CONTEST_A, {
      public: frozenStandings,
      admin: liveUnfrozenStandings,
    });

    // Public / unauthenticated viewer
    const publicConn = openContestSseRequest(`/api/contests/${CONTEST_A}/leaderboard/live`);
    // Admin viewer
    const adminConn = openContestSseRequest(`/api/contests/${CONTEST_A}/leaderboard/live`, {
      Cookie: cookieFor(ADMIN_1, Role.ADMIN),
    });

    await publicConn.waitForHeaders;
    await adminConn.waitForHeaders;
    await new Promise((r) => setTimeout(r, 15));

    // Verify initial delivery
    expect(publicConn.chunks[1]).toContain('"score":100');
    expect(adminConn.chunks[1]).toContain('"score":200');

    // Trigger update broadcast
    const updateEvent: ContestUpdateEvent = {
      contestId: CONTEST_A,
      submissionId: 'sub-new',
      problemId: 'prob-new',
      userId: USER_1,
      verdict: Verdict.ACCEPTED,
      timestamp: Date.now(),
    };

    mockSubscriber.emit('message', REDIS_KEYS.CHANNEL_CONTEST_UPDATES, JSON.stringify(updateEvent));

    await new Promise((r) => setTimeout(r, 15));

    // Both should receive the latest for their respective role
    expect(publicConn.chunks[2]).toContain('"score":100');
    expect(adminConn.chunks[2]).toContain('"score":200');

    publicConn.closeClient();
    adminConn.closeClient();
  });

  it('handles client disconnect and cleans up subscribers and listeners without error', async () => {
    dbState.existingContests.add(CONTEST_A);
    dbState.leaderboardMap.set(CONTEST_A, { public: [], admin: [] });

    const conn = openContestSseRequest(`/api/contests/${CONTEST_A}/leaderboard/live`);
    await conn.waitForHeaders;
    await new Promise((r) => setTimeout(r, 10));

    expect(contestSseManager.getClientCount(CONTEST_A)).toBe(1);

    conn.closeClient();

    expect(contestSseManager.getClientCount(CONTEST_A)).toBe(0);
    expect(contestSseManager.getClientCount()).toBe(0);
  });

  it('safely ignores malformed Redis messages without crashing', async () => {
    dbState.existingContests.add(CONTEST_A);
    dbState.leaderboardMap.set(CONTEST_A, { public: [], admin: [] });

    const conn = openContestSseRequest(`/api/contests/${CONTEST_A}/leaderboard/live`);
    await conn.waitForHeaders;
    await new Promise((r) => setTimeout(r, 10));

    // Emit non-JSON message
    expect(() => {
      mockSubscriber.emit('message', REDIS_KEYS.CHANNEL_CONTEST_UPDATES, 'not-valid-json');
    }).not.toThrow();

    // Emit JSON without contestId
    expect(() => {
      mockSubscriber.emit(
        'message',
        REDIS_KEYS.CHANNEL_CONTEST_UPDATES,
        JSON.stringify({ foo: 'bar' })
      );
    }).not.toThrow();

    conn.closeClient();
  });

  it('closes connected clients gracefully when Redis connection drops', async () => {
    dbState.existingContests.add(CONTEST_A);
    dbState.leaderboardMap.set(CONTEST_A, { public: [], admin: [] });

    const conn = openContestSseRequest(`/api/contests/${CONTEST_A}/leaderboard/live`);
    await conn.waitForHeaders;
    await new Promise((r) => setTimeout(r, 10));

    expect(contestSseManager.getClientCount(CONTEST_A)).toBe(1);

    // Emit redis close
    mockSubscriber.emit('close');

    expect(conn.chunks.some((c) => c.includes('event: error'))).toBe(true);
    expect(conn.ended).toBe(true);
    expect(contestSseManager.getClientCount(CONTEST_A)).toBe(0);
  });
});
