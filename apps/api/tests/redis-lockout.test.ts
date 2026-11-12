import { describe, it, expect, beforeEach, vi } from 'vitest';
import bcrypt from 'bcrypt';
import { ERROR_CODES, RATE_LIMITS, REDIS_KEYS } from '@judge/shared';
import { AppError } from '../src/utils/app-error.js';

const { redisStore, simState, readKey, mockRedisClient, testUser } = vi.hoisted(() => {
  const store = new Map<string, { value: string; expiresAt: number }>();
  const state = {
    redisHealthy: true,
    redisThrowOnCommand: false,
    currentFakeTimeMs: 1_000_000,
  };

  function read(key: string): string | null {
    const entry = store.get(key);
    if (!entry) return null;
    if (entry.expiresAt <= state.currentFakeTimeMs) {
      store.delete(key);
      return null;
    }
    return entry.value;
  }

  const client = {
    get: vi.fn(async (key: string) => {
      if (state.redisThrowOnCommand) throw new Error('ECONNREFUSED 127.0.0.1:6379');
      return read(key);
    }),
    incr: vi.fn(async (key: string) => {
      if (state.redisThrowOnCommand) throw new Error('ECONNREFUSED 127.0.0.1:6379');
      const existing = read(key);
      const next = existing ? parseInt(existing, 10) + 1 : 1;
      const prevExpiry = store.get(key)?.expiresAt ?? state.currentFakeTimeMs + 600_000;
      store.set(key, { value: String(next), expiresAt: prevExpiry });
      return next;
    }),
    expire: vi.fn(async (key: string, seconds: number) => {
      if (state.redisThrowOnCommand) throw new Error('ECONNREFUSED 127.0.0.1:6379');
      const entry = store.get(key);
      if (entry) {
        entry.expiresAt = state.currentFakeTimeMs + seconds * 1000;
      }
      return 1;
    }),
    set: vi.fn(async (key: string, value: string, _mode?: string, seconds?: number) => {
      if (state.redisThrowOnCommand) throw new Error('ECONNREFUSED 127.0.0.1:6379');
      const ttlMs = (seconds ?? 900) * 1000;
      store.set(key, { value, expiresAt: state.currentFakeTimeMs + ttlMs });
      return 'OK';
    }),
    del: vi.fn(async (...keys: string[]) => {
      if (state.redisThrowOnCommand) throw new Error('ECONNREFUSED 127.0.0.1:6379');
      let deleted = 0;
      for (const k of keys) {
        if (store.delete(k)) deleted++;
      }
      return deleted;
    }),
  };

  const user = {
    id: '11111111-1111-4111-8111-111111111111',
    username: 'lockout_user',
    email: 'lockout@example.com',
    passwordHash: '',
    role: 'user',
  };

  return {
    redisStore: store,
    simState: state,
    readKey: read,
    mockRedisClient: client,
    testUser: user,
  };
});

vi.mock('../src/config/redis.js', () => ({
  redisClient: mockRedisClient,
  isRedisHealthy: () => simState.redisHealthy,
}));

vi.mock('../src/db/index.js', () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => (testUser.passwordHash ? [testUser] : []),
        }),
      }),
    }),
  },
  pool: { query: vi.fn(), end: vi.fn() },
  checkDatabaseConnection: vi.fn().mockResolvedValue(true),
  closeDatabase: vi.fn().mockResolvedValue(undefined),
}));

import { authService } from '../src/modules/auth/auth.service.js';
import {
  checkLoginLockout,
  recordLoginFailure,
  clearLoginFailures,
} from '../src/middleware/rate-limiter.js';

describe('Day 11 — Redis Login Lockout & Fail-Open Behavior', () => {
  beforeEach(async () => {
    redisStore.clear();
    simState.redisHealthy = true;
    simState.redisThrowOnCommand = false;
    simState.currentFakeTimeMs = 1_000_000;
    vi.clearAllMocks();
    if (!testUser.passwordHash) {
      testUser.passwordHash = await bcrypt.hash('CorrectPassword123!', 10);
    }
  });

  it('triggers lockout after 5 failed attempts with normalized key and TTL expiration', async () => {
    for (let i = 0; i < RATE_LIMITS.LOGIN_MAX_FAILURES; i++) {
      await expect(
        authService.login({ email: 'LOCKOUT@example.com', password: 'WrongPassword!' })
      ).rejects.toMatchObject({ statusCode: 401 });
    }

    expect(mockRedisClient.expire).toHaveBeenCalledWith(
      REDIS_KEYS.AUTH_FAILURES('lockout@example.com'),
      RATE_LIMITS.LOGIN_WINDOW_SECONDS
    );
    expect(mockRedisClient.set).toHaveBeenCalledWith(
      REDIS_KEYS.AUTH_LOCKOUT('lockout@example.com'),
      '1',
      'EX',
      RATE_LIMITS.LOGIN_LOCKOUT_SECONDS
    );

    // Next attempt (even with valid password) is blocked with 423 AUTH_LOCKED_OUT
    await expect(
      authService.login({ email: 'lockout@example.com', password: 'CorrectPassword123!' })
    ).rejects.toMatchObject({
      statusCode: 423,
      code: ERROR_CODES.AUTH_LOCKED_OUT,
    });

    // Advance clock past 15-minute lockout TTL -> lockout expires and valid login succeeds
    simState.currentFakeTimeMs += RATE_LIMITS.LOGIN_LOCKOUT_SECONDS * 1000 + 1;
    const res = await authService.login({
      email: 'lockout@example.com',
      password: 'CorrectPassword123!',
    });
    expect(res.user.email).toBe('lockout@example.com');
  });

  it('resets failure counters on successful login after partial failed attempts', async () => {
    for (let i = 0; i < 3; i++) {
      await expect(
        authService.login({ email: 'lockout@example.com', password: 'WrongPassword!' })
      ).rejects.toBeInstanceOf(AppError);
    }
    expect(readKey(REDIS_KEYS.AUTH_FAILURES('lockout@example.com'))).toBe('3');

    const ok = await authService.login({
      email: 'lockout@example.com',
      password: 'CorrectPassword123!',
    });
    expect(ok.user.id).toBe(testUser.id);
    expect(readKey(REDIS_KEYS.AUTH_FAILURES('lockout@example.com'))).toBeNull();
    expect(readKey(REDIS_KEYS.AUTH_LOCKOUT('lockout@example.com'))).toBeNull();
  });

  it('fails open when Redis is offline or throwing: allows valid login and still rejects invalid password', async () => {
    // 1. Redis disconnected (!isRedisHealthy())
    simState.redisHealthy = false;
    const validWhileOffline = await authService.login({
      email: 'lockout@example.com',
      password: 'CorrectPassword123!',
    });
    expect(validWhileOffline.user.email).toBe('lockout@example.com');

    await expect(
      authService.login({ email: 'lockout@example.com', password: 'WrongPassword!' })
    ).rejects.toMatchObject({
      statusCode: 401,
      code: ERROR_CODES.AUTH_INVALID_CREDENTIALS,
    });

    // 2. Redis throws connection error mid-flight (isRedisHealthy=true, command rejects)
    simState.redisHealthy = true;
    simState.redisThrowOnCommand = true;

    const validWhileThrowing = await authService.login({
      email: 'lockout@example.com',
      password: 'CorrectPassword123!',
    });
    expect(validWhileThrowing.user.id).toBe(testUser.id);

    await expect(
      authService.login({ email: 'lockout@example.com', password: 'WrongPassword!' })
    ).rejects.toMatchObject({ statusCode: 401 });

    // Direct helper safety checks
    expect(await checkLoginLockout('lockout@example.com')).toBe(false);
    await expect(recordLoginFailure('lockout@example.com')).resolves.toBeUndefined();
    await expect(clearLoginFailures('lockout@example.com')).resolves.toBeUndefined();
  });

  it('recovers cleanly and resumes lockout tracking once Redis comes back online', async () => {
    simState.redisHealthy = false;
    await expect(
      authService.login({ email: 'lockout@example.com', password: 'WrongPassword!' })
    ).rejects.toMatchObject({ statusCode: 401 });

    // Redis recovers
    simState.redisHealthy = true;
    simState.redisThrowOnCommand = false;

    for (let i = 0; i < RATE_LIMITS.LOGIN_MAX_FAILURES; i++) {
      await expect(
        authService.login({ email: 'lockout@example.com', password: 'WrongPassword!' })
      ).rejects.toMatchObject({ statusCode: 401 });
    }

    await expect(
      authService.login({ email: 'lockout@example.com', password: 'CorrectPassword123!' })
    ).rejects.toMatchObject({ statusCode: 423 });
  });
});
