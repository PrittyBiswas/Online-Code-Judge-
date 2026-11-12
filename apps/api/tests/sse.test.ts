import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import { EventEmitter } from 'events';
import jwt from 'jsonwebtoken';
import { REDIS_KEYS, Role, SubmissionStatus, Verdict } from '@judge/shared';
import { memoryDb } from '../src/config/db.js';
import { env } from '../src/config/env.js';

const USER_A = '11111111-1111-4111-8111-111111111111';
const USER_B = '22222222-2222-4222-8222-222222222222';
const SUB_ID = '33333333-3333-4333-8333-333333333333';
const OTHER_SUB_ID = '44444444-4444-4444-8444-444444444444';

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
      submissionRows: new Map<string, any>(),
      onSubmissionSelect: null as null | (() => Promise<void>),
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
                return Array.from(memoryDb.users.values()).map((u) => ({
                  id: u.id,
                  username: u.username,
                  email: u.email,
                  role: u.role,
                }));
              }
              if (tableName === 'submissions') {
                if (dbState.onSubmissionSelect) {
                  await dbState.onSubmissionSelect();
                }
                return Array.from(dbState.submissionRows.values());
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

import { app } from '../src/app.js';
import { sseManager } from '../src/events/sse.js';

function cookieFor(userId: string) {
  const token = jwt.sign({ id: userId, role: Role.USER }, env.JWT_SECRET, { expiresIn: '15m' });
  return `${env.AUTH_COOKIE_NAME}=${token}`;
}

function openSseRequest(
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

describe('Day 16 — Backend SSE Live Submission Updates', () => {
  beforeEach(() => {
    memoryDb.users.clear();
    dbState.submissionRows.clear();
    dbState.onSubmissionSelect = null;
    mockSubscriber.status = 'ready';

    memoryDb.users.set(USER_A, {
      id: USER_A,
      username: 'alice',
      email: 'a@example.com',
      password_hash: 'h',
      role: Role.USER,
      created_at: new Date(),
      updated_at: new Date(),
    });

    dbState.submissionRows.set(SUB_ID, {
      id: SUB_ID,
      userId: USER_A,
      status: SubmissionStatus.QUEUED,
      verdict: null,
      failedTestIndex: null,
      executionTimeMs: null,
      memoryUsedKb: null,
    });
  });

  it('rejects unauthenticated (401), nonexistent (404), and cross-user (403) SSE connections', async () => {
    const unauth = openSseRequest(`/api/submissions/${SUB_ID}/live`);
    expect((await unauth.waitForHeaders).status).toBe(401);

    const missingId = openSseRequest('/api/submissions/99999999-9999-4999-8999-999999999999/live', {
      Cookie: cookieFor(USER_A),
    });
    dbState.submissionRows.clear();
    expect((await missingId.waitForHeaders).status).toBe(404);
    expect(sseManager.getClientCount()).toBe(0);

    // Cross-user access -> 403
    dbState.submissionRows.set(SUB_ID, {
      id: SUB_ID,
      userId: USER_A,
      status: SubmissionStatus.QUEUED,
      verdict: null,
      failedTestIndex: null,
      executionTimeMs: null,
      memoryUsedKb: null,
    });
    memoryDb.users.clear();
    memoryDb.users.set(USER_B, {
      id: USER_B,
      username: 'bob',
      email: 'b@example.com',
      password_hash: 'h',
      role: Role.USER,
      created_at: new Date(),
      updated_at: new Date(),
    });
    const crossUser = openSseRequest(`/api/submissions/${SUB_ID}/live`, {
      Cookie: cookieFor(USER_B),
    });
    expect((await crossUser.waitForHeaders).status).toBe(403);
    expect(sseManager.getClientCount()).toBe(0);
  });

  it('streams snapshot, QUEUED->RUNNING->terminal verdict, ignores stale/other IDs, strips secrets, and closes cleanly', async () => {
    const stream = openSseRequest(`/api/submissions/${SUB_ID}/live`, {
      Cookie: cookieFor(USER_A),
    });
    const resMeta = await stream.waitForHeaders;
    expect(resMeta.status).toBe(200);
    expect(stream.responseHeaders['content-type']).toBe('text/event-stream');
    expect(stream.responseHeaders['cache-control']).toBe('no-cache, no-transform');
    expect(stream.responseHeaders['connection']).toBe('keep-alive');

    await vi.waitFor(() => expect(sseManager.getClientCount(SUB_ID)).toBe(1));

    // Unrelated submission ID is ignored
    mockSubscriber.emit(
      'message',
      REDIS_KEYS.CHANNEL_SUBMISSION_EVENTS,
      JSON.stringify({
        submissionId: OTHER_SUB_ID,
        status: SubmissionStatus.RUNNING,
        timestamp: Date.now(),
      })
    );

    // RUNNING update
    mockSubscriber.emit(
      'message',
      REDIS_KEYS.CHANNEL_SUBMISSION_EVENTS,
      JSON.stringify({
        submissionId: SUB_ID,
        status: SubmissionStatus.RUNNING,
        timestamp: Date.now(),
      })
    );

    // Stale QUEUED event after RUNNING must be ignored
    mockSubscriber.emit(
      'message',
      REDIS_KEYS.CHANNEL_SUBMISSION_EVENTS,
      JSON.stringify({
        submissionId: SUB_ID,
        status: SubmissionStatus.QUEUED,
        timestamp: Date.now(),
      })
    );

    // Terminal verdict with extra unsafe fields -> sanitized & closes stream
    mockSubscriber.emit(
      'message',
      REDIS_KEYS.CHANNEL_SUBMISSION_EVENTS,
      JSON.stringify({
        submissionId: SUB_ID,
        status: Verdict.ACCEPTED,
        verdict: Verdict.ACCEPTED,
        executionTimeMs: 44,
        memoryUsedKb: 16384,
        code: 'SECRET_SOURCE_CODE',
        hiddenInput: 'SECRET_HIDDEN_TEST',
        timestamp: Date.now(),
      })
    );

    const joined = stream.chunks.join('');
    expect(joined).toContain('"status":"QUEUED"');
    expect(joined).toContain('"status":"RUNNING"');
    expect(joined).toContain('"verdict":"ACCEPTED"');
    expect(joined).not.toContain(OTHER_SUB_ID);
    expect(joined).not.toContain('SECRET_SOURCE_CODE');
    expect(joined).not.toContain('SECRET_HIDDEN_TEST');
    expect(stream.ended).toBe(true);
    expect(sseManager.getClientCount(SUB_ID)).toBe(0);
  });

  it('buffers events arriving during DB snapshot, closes on terminal reconnect, and closes on Redis drop', async () => {
    // 1. Race condition: RUNNING arrives while db.select() is in flight
    dbState.onSubmissionSelect = async () => {
      mockSubscriber.emit(
        'message',
        REDIS_KEYS.CHANNEL_SUBMISSION_EVENTS,
        JSON.stringify({
          submissionId: SUB_ID,
          status: SubmissionStatus.RUNNING,
          timestamp: Date.now(),
        })
      );
    };

    const raceStream = openSseRequest(`/api/submissions/${SUB_ID}/live`, {
      Cookie: cookieFor(USER_A),
    });
    await raceStream.waitForHeaders;
    await vi.waitFor(() => expect(raceStream.chunks.join('')).toContain('"status":"RUNNING"'));

    // Redis drop closes non-terminal stream cleanly
    mockSubscriber.emit('close');
    expect(raceStream.ended).toBe(true);
    expect(sseManager.getClientCount(SUB_ID)).toBe(0);

    // 2. Reconnect on already-terminal submission sends snapshot & closes immediately
    dbState.onSubmissionSelect = null;
    dbState.submissionRows.set(SUB_ID, {
      id: SUB_ID,
      userId: USER_A,
      status: SubmissionStatus.COMPLETED,
      verdict: Verdict.WRONG_ANSWER,
      failedTestIndex: 2,
      executionTimeMs: 55,
      memoryUsedKb: 12000,
    });

    const reconnectStream = openSseRequest(`/api/submissions/${SUB_ID}/live`, {
      Cookie: cookieFor(USER_A),
    });
    await reconnectStream.waitForHeaders;
    await vi.waitFor(() => expect(reconnectStream.ended).toBe(true));
    expect(reconnectStream.chunks.join('')).toContain('"verdict":"WRONG_ANSWER"');
    expect(sseManager.getClientCount(SUB_ID)).toBe(0);
  });
});
