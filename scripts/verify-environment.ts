#!/usr/bin/env tsx
/**
 * scripts/verify-environment.ts
 *
 * Validates that required environment variables are present before startup.
 * Run with: npm run env:validate
 * Or called automatically by apps at boot.
 */

import { z } from 'zod';
import dotenv from 'dotenv';
import { resolve } from 'path';

// Load .env from the monorepo root
dotenv.config({ path: resolve(process.cwd(), '.env') });

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  DATABASE_URL: z.string().url('DATABASE_URL must be a valid connection URL'),
  REDIS_URL: z.string().url('REDIS_URL must be a valid URL'),
  JWT_SECRET: z
    .string()
    .min(32, 'JWT_SECRET must be at least 32 characters for security'),
  MINIO_ROOT_USER: z.string().min(1, 'MINIO_ROOT_USER is required'),
  MINIO_ROOT_PASSWORD: z.string().min(1, 'MINIO_ROOT_PASSWORD is required'),
  MINIO_BUCKET_NAME: z.string().default('judge-testcases'),
  MINIO_ENDPOINT: z.string().default('localhost'),
  MINIO_PORT: z.coerce.number().default(9000),
});

const result = envSchema.safeParse(process.env);

if (!result.success) {
  console.error('\n❌  Environment validation failed:\n');
  for (const issue of result.error.issues) {
    console.error(`   • ${issue.path.join('.')}: ${issue.message}`);
  }
  console.error(
    '\n   Copy .env.example to .env and fill in the required values.\n'
  );
  process.exit(1);
} else {
  console.log('✅  Environment variables validated successfully.');
  console.log(`   NODE_ENV  : ${result.data.NODE_ENV}`);
  console.log(`   DATABASE  : ${result.data.DATABASE_URL.replace(/:[^:@]+@/, ':***@')}`);
  console.log(`   REDIS     : ${result.data.REDIS_URL}`);
  console.log(`   MINIO     : ${result.data.MINIO_ENDPOINT}:${result.data.MINIO_PORT}`);
}

