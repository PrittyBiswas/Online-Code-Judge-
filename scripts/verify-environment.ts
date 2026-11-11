#!/usr/bin/env tsx
/**
 * scripts/verify-environment.ts
 *
 * Validates that required environment variables are present before startup.
 * Run with: pnpm env:validate
 */

import { z } from 'zod';
import dotenv from 'dotenv';
import { resolve } from 'path';

// Load .env from the monorepo root
dotenv.config({ path: resolve(process.cwd(), '.env') });

const rawEnv = {
  ...process.env,
  REDIS_URL:
    process.env.REDIS_URL ||
    (process.env.REDIS_HOST
      ? `redis://${process.env.REDIS_HOST}:${process.env.REDIS_PORT ?? '6379'}`
      : undefined),
  MINIO_API_PORT: process.env.MINIO_API_PORT ?? process.env.MINIO_PORT,
};

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  POSTGRES_DB: z.string().min(1, 'POSTGRES_DB is required').default('judge_db'),
  POSTGRES_USER: z.string().min(1, 'POSTGRES_USER is required').default('judge_user'),
  POSTGRES_PASSWORD: z.string().min(1, 'POSTGRES_PASSWORD is required'),
  POSTGRES_PORT: z.coerce.number().int().positive().default(5432),
  DATABASE_URL: z.string().url('DATABASE_URL must be a valid connection URL'),
  REDIS_URL: z.string().url('REDIS_URL must be a valid URL'),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters for security'),
  MINIO_ROOT_USER: z.string().min(1, 'MINIO_ROOT_USER is required'),
  MINIO_ROOT_PASSWORD: z.string().min(1, 'MINIO_ROOT_PASSWORD is required'),
  MINIO_BUCKET_NAME: z.string().default('judge-testcases'),
  MINIO_ENDPOINT: z.string().default('localhost'),
  MINIO_API_PORT: z.coerce.number().int().positive().default(9000),
  MINIO_CONSOLE_PORT: z.coerce.number().int().positive().default(9001),
});

const result = envSchema.safeParse(rawEnv);

if (!result.success) {
  console.error('\n❌  Environment validation failed:\n');
  for (const issue of result.error.issues) {
    console.error(`   • ${issue.path.join('.')}: ${issue.message}`);
  }
  console.error('\n   Copy .env.example to .env and fill in the required values.\n');
  process.exit(1);
}

console.log('✅  Environment variables validated successfully.');
console.log(`   NODE_ENV  : ${result.data.NODE_ENV}`);
console.log(
  `   POSTGRES  : ${result.data.POSTGRES_USER}@127.0.0.1:${result.data.POSTGRES_PORT}/${result.data.POSTGRES_DB}`
);
console.log(`   DATABASE  : ${result.data.DATABASE_URL.replace(/:[^:@]+@/, ':***@')}`);
console.log(`   REDIS     : ${result.data.REDIS_URL}`);
console.log(
  `   MINIO     : API http://${result.data.MINIO_ENDPOINT}:${result.data.MINIO_API_PORT} | Console http://${result.data.MINIO_ENDPOINT}:${result.data.MINIO_CONSOLE_PORT}`
);
