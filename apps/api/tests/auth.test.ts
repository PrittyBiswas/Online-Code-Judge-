import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { ERROR_CODES, Role } from '@judge/shared';
import { memoryDb } from '../src/config/db.js';
import { AppError } from '../src/utils/app-error.js';
import { clearLoginFailures } from '../src/middleware/rate-limiter.js';

vi.mock('../src/config/queue.js', () => ({
  judgeQueue: null,
}));

vi.mock('../src/db/index.js', () => {
  return {
    db: {
      select: () => ({
        from: () => {
          const getUsers = () =>
            Array.from(memoryDb.users.values()).map((u) => ({
              id: u.id,
              username: u.username,
              email: u.email,
              passwordHash: u.password_hash,
              role: u.role,
            }));
          return Object.assign(Promise.resolve([]), {
            where: () => ({
              limit: async () => getUsers(),
            }),
          });
        },
      }),
      insert: () => ({
        values: (vals: {
          username: string;
          email: string;
          passwordHash: string;
          role: string;
        }) => ({
          returning: async () => {
            const id = crypto.randomUUID();
            const now = new Date();
            memoryDb.users.set(id, {
              id,
              username: vals.username,
              email: vals.email,
              password_hash: vals.passwordHash,
              role: vals.role,
              created_at: now,
              updated_at: now,
            });
            return [{ id, username: vals.username, email: vals.email, role: vals.role }];
          },
        }),
      }),
    },
    pool: { query: vi.fn(), end: vi.fn() },
    checkDatabaseConnection: vi.fn().mockResolvedValue(true),
    closeDatabase: vi.fn().mockResolvedValue(undefined),
  };
});

import { authService } from '../src/modules/auth/auth.service.js';
import { authController } from '../src/modules/auth/auth.controller.js';
import { requireAuth } from '../src/middleware/auth.js';
import { requireRole } from '../src/middleware/rbac.js';
import { env } from '../src/config/env.js';

function makeMockReq(overrides: Partial<Request> = {}): Request {
  return {
    body: {},
    cookies: {},
    headers: {},
    ...overrides,
  } as unknown as Request;
}

function makeMockRes() {
  const cookiesSet: Array<{ name: string; value: string; options: Record<string, unknown> }> = [];
  const cookiesCleared: Array<{ name: string; options: Record<string, unknown> }> = [];
  const state = { statusCode: 200, jsonBody: null as any };

  const res = {
    status(code: number) {
      state.statusCode = code;
      return this;
    },
    json(body: any) {
      state.jsonBody = body;
      return this;
    },
    cookie(name: string, value: string, options: Record<string, unknown> = {}) {
      cookiesSet.push({ name, value, options });
      return this;
    },
    clearCookie(name: string, options: Record<string, unknown> = {}) {
      cookiesCleared.push({ name, options });
      return this;
    },
  } as unknown as Response;

  return { res, state, cookiesSet, cookiesCleared };
}

async function runHandler(
  handler: (req: Request, res: Response, next: NextFunction) => unknown,
  req: Request
) {
  const { res, state, cookiesSet, cookiesCleared } = makeMockRes();
  let nextErr: unknown = undefined;
  let nextCalled = false;
  const next: NextFunction = (err?: unknown) => {
    nextCalled = true;
    nextErr = err;
  };
  await handler(req, res, next);
  return {
    status: state.statusCode,
    body: state.jsonBody,
    cookiesSet,
    cookiesCleared,
    nextCalled,
    nextErr,
  };
}

describe('Day 10 — Authentication, HTTP-only Cookies, Middleware & RBAC', () => {
  beforeEach(async () => {
    memoryDb.users.clear();
    await clearLoginFailures('testuser');
    await clearLoginFailures('alice');
    await clearLoginFailures('alice@example.com');
  });

  describe('Registration (POST /api/auth/register)', () => {
    it('registers user with normalized email, bcrypt hash, HTTP-only cookie, and no token/hash in JSON', async () => {
      const req = makeMockReq({
        body: {
          username: 'alice_dev',
          email: '  Alice.Dev@Example.COM  ',
          password: 'StrongPassword123!',
          role: Role.ADMIN, // Attempted privilege escalation must be ignored
        },
      });
      const res = await runHandler((q, r, n) => authController.register(q, r, n), req);

      expect(res.nextErr).toBeUndefined();
      expect(res.status).toBe(201);
      expect(res.body.data.user.username).toBe('alice_dev');
      expect(res.body.data.user.email).toBe('alice.dev@example.com');
      expect(res.body.data.user.role).toBe(Role.USER);
      expect(res.body.data.user.passwordHash).toBeUndefined();
      expect(res.body.data.token).toBeUndefined();

      expect(res.cookiesSet).toHaveLength(1);
      expect(res.cookiesSet[0].name).toBe(env.AUTH_COOKIE_NAME);
      expect(res.cookiesSet[0].options).toMatchObject({
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
      });

      const stored = Array.from(memoryDb.users.values())[0];
      expect(stored.password_hash).not.toBe('StrongPassword123!');
      expect(stored.password_hash.startsWith('$2')).toBe(true);
      expect(stored.role).toBe(Role.USER);
    });

    it('rejects invalid email, missing fields, weak password, and duplicate email', async () => {
      const badEmail = await runHandler(
        (q, r, n) => authController.register(q, r, n),
        makeMockReq({
          body: { username: 'bob123', email: 'not-an-email', password: 'Password123!' },
        })
      );
      expect(badEmail.nextErr).toBeDefined();

      const missingFields = await runHandler(
        (q, r, n) => authController.register(q, r, n),
        makeMockReq({ body: { username: 'bob123' } })
      );
      expect(missingFields.nextErr).toBeDefined();

      const weakPassword = await runHandler(
        (q, r, n) => authController.register(q, r, n),
        makeMockReq({ body: { username: 'bob123', email: 'bob@example.com', password: 'short' } })
      );
      expect(weakPassword.nextErr).toBeDefined();

      await authService.register({
        username: 'bob123',
        email: 'bob@example.com',
        password: 'Password123!',
      });

      const dup = await runHandler(
        (q, r, n) => authController.register(q, r, n),
        makeMockReq({
          body: { username: 'bob_other', email: 'BOB@example.com', password: 'Password123!' },
        })
      );
      expect(dup.nextErr).toBeInstanceOf(AppError);
      expect((dup.nextErr as AppError).statusCode).toBe(409);
    });
  });

  describe('Login (POST /api/auth/login)', () => {
    it('logs in via email + password, sets HTTP-only cookie, and omits JWT from JSON body', async () => {
      await authService.register({
        username: 'alice',
        email: 'alice@example.com',
        password: 'Password123!',
      });

      const res = await runHandler(
        (q, r, n) => authController.login(q, r, n),
        makeMockReq({ body: { email: 'ALICE@example.com', password: 'Password123!' } })
      );

      expect(res.nextErr).toBeUndefined();
      expect(res.status).toBe(200);
      expect(res.body.data.user.email).toBe('alice@example.com');
      expect(res.body.data.user.passwordHash).toBeUndefined();
      expect(res.body.data.token).toBeUndefined();
      expect(res.cookiesSet).toHaveLength(1);
      expect(res.cookiesSet[0].name).toBe(env.AUTH_COOKIE_NAME);
      expect(res.cookiesSet[0].options).toMatchObject({
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
      });
    });

    it('rejects missing credentials (400) and returns identical generic 401 for wrong password or unknown email', async () => {
      const missingRes = await runHandler(
        (q, r, n) => authController.login(q, r, n),
        makeMockReq({ body: { email: 'alice@example.com' } })
      );
      expect(missingRes.nextErr).toBeDefined();

      await authService.register({
        username: 'alice',
        email: 'alice@example.com',
        password: 'Password123!',
      });

      const wrongPwd = await runHandler(
        (q, r, n) => authController.login(q, r, n),
        makeMockReq({ body: { email: 'alice@example.com', password: 'WrongPassword!' } })
      );
      expect(wrongPwd.nextErr).toBeInstanceOf(AppError);
      expect((wrongPwd.nextErr as AppError).statusCode).toBe(401);

      memoryDb.users.clear();
      const unknownUser = await runHandler(
        (q, r, n) => authController.login(q, r, n),
        makeMockReq({ body: { email: 'unknown@example.com', password: 'WrongPassword!' } })
      );
      expect(unknownUser.nextErr).toBeInstanceOf(AppError);
      expect((unknownUser.nextErr as AppError).statusCode).toBe(401);
      expect((wrongPwd.nextErr as AppError).message).toBe(
        (unknownUser.nextErr as AppError).message
      );
      expect((wrongPwd.nextErr as AppError).message).toBe('Invalid email or password');
    });

    it('locks out account after repeated failed login attempts', async () => {
      await authService.register({
        username: 'alice',
        email: 'alice@example.com',
        password: 'Password123!',
      });

      for (let i = 0; i < 5; i++) {
        try {
          await authService.login({ usernameOrEmail: 'alice', password: 'bad' });
        } catch {}
      }

      try {
        await authService.login({ usernameOrEmail: 'alice', password: 'bad' });
      } catch (err: any) {
        expect(err).toBeInstanceOf(AppError);
        expect([ERROR_CODES.AUTH_LOCKED_OUT, ERROR_CODES.AUTH_INVALID_CREDENTIALS]).toContain(
          err.code
        );
      }
    });
  });

  describe('Auth Middleware, /api/auth/me, Logout & RBAC', () => {
    it('rejects missing, invalid, expired JWTs, and deleted users on requireAuth & /api/auth/me (401)', async () => {
      // 1. Missing cookie
      const noCookie = await runHandler(requireAuth, makeMockReq());
      expect(noCookie.nextErr).toBeInstanceOf(AppError);
      expect((noCookie.nextErr as AppError).statusCode).toBe(401);

      // 2. Invalid JWT
      const badJwt = await runHandler(
        requireAuth,
        makeMockReq({ cookies: { [env.AUTH_COOKIE_NAME]: 'not.a.valid.jwt' } })
      );
      expect((badJwt.nextErr as AppError).statusCode).toBe(401);

      // Register user & obtain valid cookie token
      const reg = await authService.register({
        username: 'testuser',
        email: 'test@example.com',
        password: 'Password123!',
      });

      // 3. Expired JWT
      const expiredToken = jwt.sign({ id: reg.user.id, role: Role.USER }, env.JWT_SECRET, {
        expiresIn: -10,
      });
      const expiredRes = await runHandler(
        requireAuth,
        makeMockReq({ cookies: { [env.AUTH_COOKIE_NAME]: expiredToken } })
      );
      expect((expiredRes.nextErr as AppError).statusCode).toBe(401);

      // 4. Valid JWT cookie -> attaches safe req.user & /me omits passwordHash
      const validReq = makeMockReq({ cookies: { [env.AUTH_COOKIE_NAME]: reg.token } });
      const authOk = await runHandler(requireAuth, validReq);
      expect(authOk.nextErr).toBeUndefined();
      expect(authOk.nextCalled).toBe(true);
      expect(validReq.user).toEqual({
        id: reg.user.id,
        username: 'testuser',
        email: 'test@example.com',
        role: Role.USER,
      });
      expect((validReq.user as any).passwordHash).toBeUndefined();

      const meRes = await runHandler((q, r) => authController.me(q, r), validReq);
      expect(meRes.status).toBe(200);
      expect(meRes.body.data.user).toEqual(validReq.user);
      expect(meRes.body.data.user.passwordHash).toBeUndefined();

      // 5. Deleted / unavailable user -> 401 even with previously valid cookie
      memoryDb.users.clear();
      const deletedRes = await runHandler(
        requireAuth,
        makeMockReq({ cookies: { [env.AUTH_COOKIE_NAME]: reg.token } })
      );
      expect((deletedRes.nextErr as AppError).statusCode).toBe(401);
    });

    it('enforces deny-by-default RBAC (401 unauthenticated, 403 normal user, allowed admin)', () => {
      const adminOnly = requireRole(Role.ADMIN);

      // Unauthenticated -> 401
      expect(() => adminOnly(makeMockReq(), makeMockRes().res, () => {})).toThrow(AppError);
      try {
        adminOnly(makeMockReq(), makeMockRes().res, () => {});
      } catch (err: any) {
        expect(err.statusCode).toBe(401);
      }

      // Normal user -> 403 Forbidden
      const normalUserReq = makeMockReq({
        user: { id: crypto.randomUUID(), username: 'u', email: 'u@example.com', role: Role.USER },
      });
      try {
        adminOnly(normalUserReq, makeMockRes().res, () => {});
        expect.fail('Expected 403 Forbidden');
      } catch (err: any) {
        expect(err).toBeInstanceOf(AppError);
        expect(err.statusCode).toBe(403);
      }

      // Admin -> allowed
      const adminReq = makeMockReq({
        user: {
          id: crypto.randomUUID(),
          username: 'admin',
          email: 'admin@example.com',
          role: Role.ADMIN,
        },
      });
      let allowed = false;
      adminOnly(adminReq, makeMockRes().res, () => {
        allowed = true;
      });
      expect(allowed).toBe(true);
    });

    it('clears HTTP-only auth cookie on logout with or without an existing cookie', async () => {
      const logoutNoCookie = await runHandler((q, r) => authController.logout(q, r), makeMockReq());
      expect(logoutNoCookie.status).toBe(200);
      expect(logoutNoCookie.body.data.message).toBe('Logged out successfully');
      expect(logoutNoCookie.cookiesCleared).toHaveLength(1);
      expect(logoutNoCookie.cookiesCleared[0].name).toBe(env.AUTH_COOKIE_NAME);
      expect(logoutNoCookie.cookiesCleared[0].options).toMatchObject({
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
      });

      const logoutWithCookie = await runHandler(
        (q, r) => authController.logout(q, r),
        makeMockReq({ cookies: { [env.AUTH_COOKIE_NAME]: 'some.jwt.token' } })
      );
      expect(logoutWithCookie.status).toBe(200);
      expect(logoutWithCookie.cookiesCleared).toHaveLength(1);
    });
  });
});
