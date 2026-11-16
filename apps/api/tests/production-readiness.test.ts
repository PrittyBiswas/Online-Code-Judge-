import { describe, it, expect } from 'vitest';
import { IncomingMessage, ServerResponse } from 'http';
import { Duplex } from 'stream';
import type { Socket } from 'net';
import { app } from '../src/app.js';
import { validateApiProductionEnv, ApiEnvConfig } from '../src/config/env.js';
import { validateWorkerProductionEnv, WorkerEnvConfig } from '../../judge-worker/src/config/env.js';
import { getAuthCookieOptions, getClearAuthCookieOptions } from '../src/middleware/auth.js';
import { errorHandler } from '../src/middleware/error-handler.js';
import { ERROR_CODES } from '@judge/shared';

function dispatchRequest(method: string, url: string): Promise<{ status: number; body: any }> {
  return new Promise((resolve, reject) => {
    const outputChunks: Buffer[] = [];
    const fakeSocket = new Duplex({
      read() {
        this.push(null);
      },
      write(chunk, _encoding, callback) {
        outputChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        callback();
      },
    }) as unknown as Socket;
    (fakeSocket as unknown as { remoteAddress: string }).remoteAddress = '127.0.0.1';

    const req = new IncomingMessage(fakeSocket);
    req.method = method;
    req.url = url;
    req.headers = { host: 'localhost' };

    const res = new ServerResponse(req);
    res.assignSocket(fakeSocket);

    res.on('finish', () => {
      const raw = Buffer.concat(outputChunks).toString('utf8');
      const headerEnd = raw.indexOf('\r\n\r\n');
      const bodyStr = headerEnd >= 0 ? raw.slice(headerEnd + 4) : raw;
      try {
        resolve({ status: res.statusCode, body: JSON.parse(bodyStr) });
      } catch (err) {
        reject(err);
      }
    });

    res.on('error', reject);
    app(req, res);
  });
}

describe('Day 22 — Production Readiness, Observability & Security', () => {
  describe('Environment Validation & Dev Defaults Prevention', () => {
    const validProdApiConfig: ApiEnvConfig = {
      NODE_ENV: 'production',
      PORT: 4000,
      API_PORT: 4000,
      FRONTEND_URL: 'https://judge.example.com',
      DATABASE_URL: 'postgresql://prod_user:SuperSecurePass123!@db-host:5432/prod_db',
      REDIS_URL: 'redis://prod-redis:6379',
      JWT_SECRET: 'a-super-secret-random-production-jwt-key-with-over-32-chars',
      COOKIE_SECRET: 'a-super-secret-cookie-key-for-production-signing-32c',
      JWT_EXPIRES_IN: '15m',
      AUTH_COOKIE_NAME: 'token',
      MINIO_ENDPOINT: 's3.example.com',
      MINIO_PORT: 9000,
      MINIO_CONSOLE_PORT: 9001,
      MINIO_ROOT_USER: 'prod-s3-user',
      MINIO_ROOT_PASSWORD: 'prod-s3-password',
      MINIO_BUCKET_NAME: 'judge-testcases',
      MINIO_USE_SSL: true,
      STUB_MAIL_URL: 'http://localhost:4005',
    };

    it('passes validation when valid production settings are supplied', () => {
      expect(() => validateApiProductionEnv(validProdApiConfig)).not.toThrow();
    });

    it('rejects missing or short JWT_SECRET in production', () => {
      expect(() =>
        validateApiProductionEnv({
          ...validProdApiConfig,
          JWT_SECRET: 'short',
        })
      ).toThrow(/JWT_SECRET environment variable/);
    });

    it('rejects development placeholder values in JWT_SECRET in production', () => {
      expect(() =>
        validateApiProductionEnv({
          ...validProdApiConfig,
          JWT_SECRET: 'dev-only-jwt-secret-change-me-min-32-chars!',
        })
      ).toThrow(/must not use insecure development default/);
    });

    it('rejects default COOKIE_SECRET in production', () => {
      expect(() =>
        validateApiProductionEnv({
          ...validProdApiConfig,
          COOKIE_SECRET: 'dev-only-cookie-secret-change-me-32chars',
        })
      ).toThrow(/COOKIE_SECRET must be explicitly set/);
    });

    it('rejects default database password in production', () => {
      expect(() =>
        validateApiProductionEnv({
          ...validProdApiConfig,
          DATABASE_URL: 'postgresql://judge_user:judge_secret_password@db:5432/judge_db',
        })
      ).toThrow(/DATABASE_URL must not use default development password/);
    });

    it('rejects localhost FRONTEND_URL in production', () => {
      expect(() =>
        validateApiProductionEnv({
          ...validProdApiConfig,
          FRONTEND_URL: 'http://localhost:5173',
        })
      ).toThrow(/FRONTEND_URL must be configured with a production domain/);
    });

    it('skips strict checks when NODE_ENV is development or test', () => {
      expect(() =>
        validateApiProductionEnv({
          ...validProdApiConfig,
          NODE_ENV: 'development',
          JWT_SECRET: 'dev-only-jwt-secret-change-me-min-32-chars!',
          COOKIE_SECRET: 'dev-only-cookie-secret-change-me-32chars',
          DATABASE_URL: 'postgresql://judge_user:judge_secret_password@localhost:5432/judge_db',
          FRONTEND_URL: 'http://localhost:5173',
        })
      ).not.toThrow();
    });

    it('enforces worker production validation for database and storage', () => {
      const validWorkerConfig: WorkerEnvConfig = {
        NODE_ENV: 'production',
        LOG_LEVEL: 'info',
        DATABASE_URL: 'postgresql://prod_user:StrongPass!@db:5432/judge_prod',
        REDIS_URL: 'redis://redis:6379',
        MINIO_ENDPOINT: 'minio',
        MINIO_PORT: 9000,
        MINIO_ACCESS_KEY: 'prod-key',
        MINIO_SECRET_KEY: 'prod-secret',
        MINIO_ROOT_USER: 'prod-key',
        MINIO_ROOT_PASSWORD: 'prod-secret',
        MINIO_BUCKET_NAME: 'judge-testcases',
        MINIO_USE_SSL: false,
        WORKER_CONCURRENCY: 2,
        WORKER_LOCK_DURATION_MS: 30000,
        WORKER_STALLED_INTERVAL_MS: 15000,
        WORKER_MAX_STALLED_COUNT: 2,
        WORKER_MAX_ATTEMPTS: 3,
        RECOVERY_STALE_MS: 60000,
        RECOVERY_INTERVAL_MS: 30000,
        SANDBOX_TIMEOUT_MS: 2000,
        SANDBOX_MEMORY_LIMIT_MB: 128,
        SANDBOX_CPUS: '0.5',
        SANDBOX_PIDS_LIMIT: 64,
        SANDBOX_OUTPUT_LIMIT_BYTES: 65536,
        SANDBOX_DOCKER_IMAGE: 'node:20-alpine',
        SANDBOX_PYTHON_IMAGE: 'python:3.11-alpine',
      };

      expect(() => validateWorkerProductionEnv(validWorkerConfig)).not.toThrow();

      expect(() =>
        validateWorkerProductionEnv({
          ...validWorkerConfig,
          DATABASE_URL: 'postgresql://judge_user:judge_secret_password@db:5432/judge_db',
        })
      ).toThrow(/default development password/);

      expect(() =>
        validateWorkerProductionEnv({
          ...validWorkerConfig,
          MINIO_ACCESS_KEY: 'minioadmin',
          MINIO_SECRET_KEY: 'minioadmin',
        })
      ).toThrow(/MinIO storage credentials must not use default minioadmin/);
    });
  });

  describe('Health Probes & Liveness / Readiness Behavior', () => {
    it('GET /health/live returns 200 with service name, uptime and timestamp', async () => {
      const res = await dispatchRequest('GET', '/health/live');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');
      expect(res.body.service).toBe('@judge/api');
      expect(typeof res.body.uptime).toBe('number');
      expect(typeof res.body.timestamp).toBe('string');
    });

    it('GET /health/ready returns structured status without leaking secrets', async () => {
      const res = await dispatchRequest('GET', '/health/ready');
      expect([200, 503]).toContain(res.status);
      expect(['ok', 'degraded']).toContain(res.body.status);
      expect(res.body.service).toBe('@judge/api');
      expect(res.body.checks).toBeDefined();
      expect(res.body.checks.database).toBeDefined();
      expect(res.body.checks.redis).toBeDefined();
      expect(res.body).not.toHaveProperty('stack');
      expect(res.body).not.toHaveProperty('password');
      expect(res.body).not.toHaveProperty('DATABASE_URL');
    });

    it('GET /health acts as alias to /health/ready', async () => {
      const res = await dispatchRequest('GET', '/health');
      expect([200, 503]).toContain(res.status);
      expect(['ok', 'degraded']).toContain(res.body.status);
      expect(res.body.service).toBe('@judge/api');
      expect(res.body.checks).toBeDefined();
    });
  });

  describe('Global Error Sanitization & Security Headers', () => {
    it('does not leak internal error message or stack trace in 500 responses', () => {
      const mockReq = { path: '/test', method: 'GET' } as any;
      let statusCode = 0;
      let sentBody: any = null;

      const mockRes = {
        status(code: number) {
          statusCode = code;
          return this;
        },
        json(body: any) {
          sentBody = body;
          return this;
        },
      } as any;

      const unhandledError = new Error('Database password failed: judge_secret_password');
      (unhandledError as any).stack = 'Error at postgres.ts:12:34';

      errorHandler(unhandledError, mockReq, mockRes, () => {});

      expect(statusCode).toBe(500);
      expect(sentBody).toEqual({
        code: ERROR_CODES.INTERNAL_ERROR,
        message: 'An unexpected internal error occurred.',
      });
      expect(JSON.stringify(sentBody)).not.toContain('judge_secret_password');
      expect(JSON.stringify(sentBody)).not.toContain('postgres.ts');
    });

    it('ensures auth cookies have httpOnly and appropriate security attributes', () => {
      const opts = getAuthCookieOptions();
      expect(opts.httpOnly).toBe(true);
      expect(opts.sameSite).toBe('lax');
      expect(opts.path).toBe('/');
      expect(opts.maxAge).toBeGreaterThan(0);

      const clearOpts = getClearAuthCookieOptions();
      expect(clearOpts.httpOnly).toBe(true);
      expect(clearOpts.path).toBe('/');
    });
  });
});
