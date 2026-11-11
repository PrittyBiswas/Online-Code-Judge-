import dotenv from 'dotenv';
import { existsSync } from 'fs';
import { resolve } from 'path';
import { z } from 'zod';

const envCandidates = [resolve(process.cwd(), '.env'), resolve(process.cwd(), '../../.env')];
for (const envPath of envCandidates) {
  if (existsSync(envPath)) {
    dotenv.config({ path: envPath });
    break;
  }
}

function deriveDatabaseUrl(raw: NodeJS.ProcessEnv): string | undefined {
  if (raw.DATABASE_URL) return raw.DATABASE_URL;
  if (
    !raw.POSTGRES_USER &&
    !raw.POSTGRES_PASSWORD &&
    !raw.POSTGRES_HOST &&
    !raw.POSTGRES_PORT &&
    !raw.POSTGRES_DB
  ) {
    return undefined;
  }
  const user = encodeURIComponent(raw.POSTGRES_USER || 'judge_user');
  const password = encodeURIComponent(raw.POSTGRES_PASSWORD || 'judge_secret_password');
  const host = raw.POSTGRES_HOST || 'localhost';
  const port = raw.POSTGRES_PORT || '5432';
  const db = encodeURIComponent(raw.POSTGRES_DB || 'judge_db');
  return `postgresql://${user}:${password}@${host}:${port}/${db}`;
}

function deriveRedisUrl(raw: NodeJS.ProcessEnv): string | undefined {
  if (raw.REDIS_URL) return raw.REDIS_URL;
  if (!raw.REDIS_HOST && !raw.REDIS_PORT && !raw.REDIS_PASSWORD) return undefined;
  const host = raw.REDIS_HOST || 'localhost';
  const port = raw.REDIS_PORT || '6379';
  const auth = raw.REDIS_PASSWORD ? `:${encodeURIComponent(raw.REDIS_PASSWORD)}@` : '';
  return `redis://${auth}${host}:${port}`;
}

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  LOG_LEVEL: z.string().default('info'),
  DATABASE_URL: z
    .string()
    .url()
    .default('postgresql://judge_user:judge_secret_password@localhost:5432/judge_db'),
  REDIS_URL: z.string().url().default('redis://localhost:6379'),
  MINIO_ENDPOINT: z.string().default('localhost'),
  MINIO_API_PORT: z.coerce.number().optional(),
  MINIO_PORT: z.coerce.number().default(9000),
  MINIO_ACCESS_KEY: z.string().optional(),
  MINIO_SECRET_KEY: z.string().optional(),
  MINIO_ROOT_USER: z.string().default('minioadmin'),
  MINIO_ROOT_PASSWORD: z.string().default('minioadmin'),
  MINIO_BUCKET: z.string().optional(),
  MINIO_BUCKET_NAME: z.string().default('judge-testcases'),
  MINIO_USE_SSL: z.preprocess((val) => val === 'true' || val === true, z.boolean()).default(false),
  WORKER_CONCURRENCY: z.coerce.number().int().min(1).max(16).default(2),
  SANDBOX_TIMEOUT_MS: z.coerce.number().int().min(200).max(30000).default(2000),
  SANDBOX_MEMORY_LIMIT_MB: z.coerce.number().int().min(32).max(1024).default(128),
  SANDBOX_CPUS: z.string().default('0.5'),
  SANDBOX_PIDS_LIMIT: z.coerce.number().int().min(16).max(256).default(64),
  SANDBOX_OUTPUT_LIMIT_BYTES: z.coerce.number().int().min(1024).max(1048576).default(65536),
  SANDBOX_DOCKER_IMAGE: z.string().default('node:20-alpine'),
  SANDBOX_PYTHON_IMAGE: z.string().default('python:3.11-alpine'),
});

const parsed = envSchema.parse({
  ...process.env,
  DATABASE_URL: deriveDatabaseUrl(process.env),
  REDIS_URL: deriveRedisUrl(process.env),
});

export const workerEnv = {
  ...parsed,
  MINIO_PORT: parsed.MINIO_API_PORT ?? parsed.MINIO_PORT,
  MINIO_ACCESS_KEY: parsed.MINIO_ACCESS_KEY || parsed.MINIO_ROOT_USER,
  MINIO_SECRET_KEY: parsed.MINIO_SECRET_KEY || parsed.MINIO_ROOT_PASSWORD,
  MINIO_BUCKET_NAME: parsed.MINIO_BUCKET || parsed.MINIO_BUCKET_NAME,
};

