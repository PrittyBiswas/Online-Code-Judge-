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
  PORT: z.coerce.number().default(4000),
  API_PORT: z.coerce.number().optional(),
  FRONTEND_URL: z.string().default('http://localhost:5173'),
  DATABASE_URL: z
    .string()
    .url()
    .default('postgres://judge_user:judge_secret_password@localhost:5432/judge_db'),
  REDIS_URL: z.string().url().default('redis://localhost:6379'),
  JWT_SECRET: z.string().default('super-secret-jwt-key-for-local-judge-testing-32chars!'),
  COOKIE_SECRET: z.string().default('dev-only-cookie-secret-change-me-32chars'),
  MINIO_ENDPOINT: z.string().default('localhost'),
  MINIO_API_PORT: z.coerce.number().optional(),
  MINIO_PORT: z.coerce.number().default(9000),
  MINIO_CONSOLE_PORT: z.coerce.number().default(9001),
  MINIO_ROOT_USER: z.string().default('minioadmin'),
  MINIO_ROOT_PASSWORD: z.string().default('minioadmin'),
  MINIO_BUCKET_NAME: z.string().default('judge-testcases'),
  MINIO_USE_SSL: z.preprocess((val) => val === 'true' || val === true, z.boolean()).default(false),
  STUB_MAIL_URL: z.string().default('http://localhost:4005'),
});

const parsed = envSchema.parse({
  ...process.env,
  REDIS_URL: deriveRedisUrl(process.env),
});

export const env = {
  ...parsed,
  PORT: parsed.API_PORT ?? parsed.PORT,
  MINIO_PORT: parsed.MINIO_API_PORT ?? parsed.MINIO_PORT,
};
