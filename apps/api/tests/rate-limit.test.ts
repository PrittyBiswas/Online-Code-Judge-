import { describe, it, expect, beforeEach } from 'vitest';
import { submissionRateLimiter, doubleClickGuard, checkLoginLockout } from '../src/middleware/rate-limiter.js';
import { AppError } from '../src/utils/app-error.js';
import { ERROR_CODES } from '@judge/shared';

describe('Rate Limiter Middleware (AC-ID-04, AC-SJ-10, AC-SJ-11)', () => {
  it('AC-ID-04: fails open if Redis is down and allows login checks', async () => {
    // When Redis is offline/not connected, checkLoginLockout returns false (fail open)
    const locked = await checkLoginLockout('someuser');
    expect(locked).toBe(false);
  });

  it('AC-SJ-10: enforces rate limit of 5 submissions per minute per user', async () => {
    const userId = 'user-rate-test-1';
    const mockRes: any = {
      setHeader: (key: string, val: any) => {},
    };

    // First 5 submissions pass
    for (let i = 0; i < 5; i++) {
      let nextCalled = false;
      const req: any = { user: { id: userId } };
      await submissionRateLimiter(req, mockRes, (err?: any) => {
        if (!err) nextCalled = true;
      });
      expect(nextCalled).toBe(true);
    }

    // 6th submission must be rejected with 429
    let rejectedError: any = null;
    const req6: any = { user: { id: userId } };
    await submissionRateLimiter(req6, mockRes, (err?: any) => {
      rejectedError = err;
    });

    expect(rejectedError).toBeInstanceOf(AppError);
    expect(rejectedError.statusCode).toBe(429);
    expect(rejectedError.code).toBe(ERROR_CODES.RATE_LIMIT_EXCEEDED);
  });

  it('AC-SJ-11: double click guard rejects identical submissions within seconds', async () => {
    const userId = 'user-double-click-test';
    const req: any = {
      user: { id: userId },
      body: {
        problemId: '123e4567-e89b-12d3-a456-426614174000',
        code: 'console.log("hello");',
        language: 'javascript',
      },
    };
    const mockRes: any = {};

    let firstNextCalled = false;
    await doubleClickGuard(req, mockRes, (err?: any) => {
      if (!err) firstNextCalled = true;
    });
    expect(firstNextCalled).toBe(true);

    // Second immediate identical submission must be rejected
    let secondError: any = null;
    await doubleClickGuard(req, mockRes, (err?: any) => {
      secondError = err;
    });

    expect(secondError).toBeInstanceOf(AppError);
    expect(secondError.statusCode).toBe(429);
    expect(secondError.code).toBe(ERROR_CODES.DOUBLE_SUBMIT_GUARD);
  });
});

