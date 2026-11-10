import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { env } from './config/env.js';
import { apiRouter } from './routes/index.js';
import { errorHandler } from './middleware/error-handler.js';
import { requestLogger } from './middleware/logger.js';
import { isDatabaseHealthy } from './config/db.js';
import { isRedisHealthy } from './config/redis.js';
import { minioService } from './config/minio.js';
import { register } from './utils/metrics.js';
import { execFile } from 'child_process';
import { APP_INFO, HealthStatusResponse, RootApiInfo } from '@judge/shared';

const app = express();

app.use(helmet());
app.use(
  cors({
    origin: env.FRONTEND_URL,
    credentials: true,
  })
);
app.use(cookieParser());
app.use(express.json({ limit: '1mb' }));
app.use(requestLogger);

// Root endpoint
app.get('/', (_req, res) => {
  const payload: RootApiInfo = {
    name: `${APP_INFO.NAME} API`,
    version: APP_INFO.VERSION,
    status: 'running',
    healthEndpoint: '/health/live',
  };
  res.status(200).json(payload);
});

// Liveness probe (AC-OP-04)
app.get('/health/live', (_req, res) => {
  const payload: HealthStatusResponse = {
    status: 'ok',
    service: '@judge/api',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  };
  res.status(200).json(payload);
});

// Extensive healthcheck (AC-OP-04: verifies Postgres, Redis, MinIO, Docker)
app.get('/health/extensive', async (_req, res) => {
  const dbOk = await isDatabaseHealthy();
  const redisOk = isRedisHealthy();
  const minioOk = await minioService.isHealthy();

  let dockerOk = false;
  try {
    await new Promise<void>((resolve, reject) => {
      execFile('docker', ['version'], { timeout: 2000 }, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
    dockerOk = true;
  } catch {
    dockerOk = false;
  }

  const checks = {
    api: 'ok',
    postgres: dbOk ? 'ok' : 'down',
    redis: redisOk ? 'ok' : 'down',
    minio: minioOk ? 'ok' : 'down',
    docker: dockerOk ? 'ok' : 'down',
  };

  const allHealthy = Object.values(checks).every((s) => s === 'ok');

  res.status(allHealthy ? 200 : 503).json({
    status: allHealthy ? 'healthy' : 'degraded',
    checks,
  });
});

// Metrics endpoint (AC-OP-02)
app.get('/metrics', async (_req, res) => {
  try {
    res.set('Content-Type', register.contentType);
    res.end(await register.metrics());
  } catch (err: any) {
    res.status(500).end(err?.message);
  }
});

// Primary API Router
app.use('/api', apiRouter);

// Standardized error handler (Part 4.2)
app.use(errorHandler);

export { app };
