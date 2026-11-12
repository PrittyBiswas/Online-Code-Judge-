import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { redisClient, isRedisHealthy } from '../config/redis.js';
import { RATE_LIMITS, REDIS_KEYS, ERROR_CODES } from '@judge/shared';
import { AppError } from '../utils/app-error.js';
import { logger } from '../utils/logger.js';

// Local in-memory fallback for rate limiting when Redis is unavailable
const memoryRateLimits = new Map<string, { count: number; expiresAt: number }>();

/**
 * Checks if a login attempt is locked out (AC-ID-02).
 * Fails open if Redis is unreachable (AC-ID-04, Card 12).
 */
export async function checkLoginLockout(identifier: string): Promise<boolean> {
  const lockoutKey = REDIS_KEYS.AUTH_LOCKOUT(identifier.toLowerCase());
  try {
    if (!isRedisHealthy()) return false; // Fail open
    const locked = await redisClient.get(lockoutKey);
    return locked === '1';
  } catch (err: any) {
    logger.warn({ err: err.message }, 'Redis error in checkLoginLockout; failing open (AC-ID-04)');
    return false;
  }
}

/**
 * Records a failed login attempt; locks out after limit is reached (AC-ID-02).
 */
export async function recordLoginFailure(identifier: string): Promise<void> {
  const key = REDIS_KEYS.AUTH_FAILURES(identifier.toLowerCase());
  const lockoutKey = REDIS_KEYS.AUTH_LOCKOUT(identifier.toLowerCase());

  try {
    if (!isRedisHealthy()) return;

    // Fixed-window counter via INCR + EXPIRE (Card 7)
    const attempts = await redisClient.incr(key);
    if (attempts === 1) {
      await redisClient.expire(key, RATE_LIMITS.LOGIN_WINDOW_SECONDS);
    }

    if (attempts >= RATE_LIMITS.LOGIN_MAX_FAILURES) {
      await redisClient.set(lockoutKey, '1', 'EX', RATE_LIMITS.LOGIN_LOCKOUT_SECONDS);
      await redisClient.del(key);
      logger.warn({ identifier }, 'Account/IP locked out due to repeated failed login attempts');
    }
  } catch (err: any) {
    logger.warn({ err: err.message }, 'Redis error in recordLoginFailure; logging and continuing');
  }
}

/**
 * Clears failed login attempts on successful login.
 */
export async function clearLoginFailures(identifier: string): Promise<void> {
  try {
    if (!isRedisHealthy()) return;
    await redisClient.del(REDIS_KEYS.AUTH_FAILURES(identifier.toLowerCase()));
    await redisClient.del(REDIS_KEYS.AUTH_LOCKOUT(identifier.toLowerCase()));
  } catch {}
}

/**
 * Per-user submission rate limiter: max 5 per minute (AC-SJ-10).
 */
export async function submissionRateLimiter(req: Request, res: Response, next: NextFunction) {
  const userId = req.user?.id || req.ip || 'anonymous';
  const key = REDIS_KEYS.SUBMISSION_RATE(userId);

  try {
    if (isRedisHealthy()) {
      const count = await redisClient.incr(key);
      if (count === 1) {
        await redisClient.expire(key, 60);
      }

      if (count > RATE_LIMITS.SUBMISSIONS_PER_MINUTE) {
        const ttl = await redisClient.ttl(key);
        res.setHeader('Retry-After', ttl > 0 ? ttl : 60);
        throw new AppError(
          ERROR_CODES.RATE_LIMIT_EXCEEDED,
          `Submission rate limit exceeded. Max ${RATE_LIMITS.SUBMISSIONS_PER_MINUTE} submissions per minute.`,
          429
        );
      }
    } else {
      // Memory fallback if Redis is down
      const now = Date.now();
      const existing = memoryRateLimits.get(key);
      if (existing && existing.expiresAt > now) {
        if (existing.count >= RATE_LIMITS.SUBMISSIONS_PER_MINUTE) {
          const retryAfter = Math.ceil((existing.expiresAt - now) / 1000);
          res.setHeader('Retry-After', retryAfter);
          throw new AppError(
            ERROR_CODES.RATE_LIMIT_EXCEEDED,
            `Submission rate limit exceeded. Max ${RATE_LIMITS.SUBMISSIONS_PER_MINUTE} submissions per minute.`,
            429
          );
        }
        existing.count++;
      } else {
        memoryRateLimits.set(key, { count: 1, expiresAt: now + 60000 });
      }
    }

    next();
  } catch (err) {
    next(err);
  }
}

/**
 * Double-click guard: Rejects identical submissions sent within seconds (AC-SJ-11).
 */
export async function doubleClickGuard(req: Request, res: Response, next: NextFunction) {
  const userId = req.user?.id || req.ip || 'anonymous';
  const { problemId, code, language } = req.body;

  if (!code || !problemId) {
    return next();
  }

  // Generate SHA256 signature of submission payload
  const hash = crypto
    .createHash('sha256')
    .update(`${problemId}:${code}:${language}`)
    .digest('hex')
    .substring(0, 16);
  const guardKey = REDIS_KEYS.DOUBLE_CLICK_GUARD(userId, hash);

  try {
    if (isRedisHealthy()) {
      // SET key 1 EX ttl NX (atomic acquire)
      const acquired = await redisClient.set(
        guardKey,
        '1',
        'EX',
        RATE_LIMITS.DOUBLE_CLICK_GUARD_SECONDS,
        'NX'
      );
      if (!acquired) {
        throw new AppError(
          ERROR_CODES.DOUBLE_SUBMIT_GUARD,
          'Duplicate submission detected. Please wait a moment before resubmitting.',
          429
        );
      }
    } else {
      const now = Date.now();
      const existing = memoryRateLimits.get(guardKey);
      if (existing && existing.expiresAt > now) {
        throw new AppError(
          ERROR_CODES.DOUBLE_SUBMIT_GUARD,
          'Duplicate submission detected. Please wait a moment before resubmitting.',
          429
        );
      }
      memoryRateLimits.set(guardKey, {
        count: 1,
        expiresAt: now + RATE_LIMITS.DOUBLE_CLICK_GUARD_SECONDS * 1000,
      });
    }

    next();
  } catch (err) {
    next(err);
  }
}

/**
 * Sample-run rate limiter: Max 10 sample runs per minute per user.
 */
export async function sampleRunRateLimiter(req: Request, res: Response, next: NextFunction) {
  const userId = req.user?.id || req.ip || 'anonymous';
  const key = REDIS_KEYS.SAMPLE_RUN_RATE(userId);

  try {
    if (isRedisHealthy()) {
      const count = await redisClient.incr(key);
      if (count === 1) {
        await redisClient.expire(key, 60);
      }

      if (count > RATE_LIMITS.SAMPLE_RUNS_PER_MINUTE) {
        const ttl = await redisClient.ttl(key);
        res.setHeader('Retry-After', ttl > 0 ? ttl : 60);
        throw new AppError(
          ERROR_CODES.RATE_LIMIT_EXCEEDED,
          `Sample run rate limit exceeded. Max ${RATE_LIMITS.SAMPLE_RUNS_PER_MINUTE} sample runs per minute.`,
          429
        );
      }
    } else {
      const now = Date.now();
      const existing = memoryRateLimits.get(key);
      if (existing && existing.expiresAt > now) {
        if (existing.count >= RATE_LIMITS.SAMPLE_RUNS_PER_MINUTE) {
          const retryAfter = Math.ceil((existing.expiresAt - now) / 1000);
          res.setHeader('Retry-After', retryAfter);
          throw new AppError(
            ERROR_CODES.RATE_LIMIT_EXCEEDED,
            `Sample run rate limit exceeded. Max ${RATE_LIMITS.SAMPLE_RUNS_PER_MINUTE} sample runs per minute.`,
            429
          );
        }
        existing.count++;
      } else {
        memoryRateLimits.set(key, { count: 1, expiresAt: now + 60000 });
      }
    }

    next();
  } catch (err) {
    next(err);
  }
}

/**
 * Double-click guard for sample runs: rejects identical rapid-fire runs within seconds.
 */
export async function sampleDoubleClickGuard(req: Request, res: Response, next: NextFunction) {
  const userId = req.user?.id || req.ip || 'anonymous';
  const { problemId, code, language } = req.body;

  if (!code || !problemId) {
    return next();
  }

  const hash = crypto
    .createHash('sha256')
    .update(`sample:${problemId}:${code}:${language || 'javascript'}`)
    .digest('hex')
    .substring(0, 16);
  const guardKey = REDIS_KEYS.SAMPLE_DOUBLE_CLICK_GUARD(userId, hash);

  try {
    if (isRedisHealthy()) {
      const acquired = await redisClient.set(
        guardKey,
        '1',
        'EX',
        RATE_LIMITS.DOUBLE_CLICK_GUARD_SECONDS,
        'NX'
      );
      if (!acquired) {
        throw new AppError(
          ERROR_CODES.DOUBLE_SUBMIT_GUARD,
          'Duplicate sample run detected. Please wait a moment before running again.',
          429
        );
      }
    } else {
      const now = Date.now();
      const existing = memoryRateLimits.get(guardKey);
      if (existing && existing.expiresAt > now) {
        throw new AppError(
          ERROR_CODES.DOUBLE_SUBMIT_GUARD,
          'Duplicate sample run detected. Please wait a moment before running again.',
          429
        );
      }
      memoryRateLimits.set(guardKey, {
        count: 1,
        expiresAt: now + RATE_LIMITS.DOUBLE_CLICK_GUARD_SECONDS * 1000,
      });
    }

    next();
  } catch (err) {
    next(err);
  }
}
