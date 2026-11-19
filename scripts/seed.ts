#!/usr/bin/env tsx
/**
 * scripts/seed.ts
 *
 * Seeds the database with production-grade data:
 * - Admin user (admin@judge.local / admin1234)
 * - Problem Setter user (setter@judge.local / setter1234)
 * - 50 distinct, high-quality coding problems:
 *   - 20 Easy, 20 Medium, 10 Hard
 *   - Covering all 15 algorithmic categories
 *   - HackerRank-style compilable starter code with TODOs (zero complete solutions)
 *   - Comprehensive problem statements, input/output formats, constraints
 *   - Sample & hidden test cases uploaded to MinIO and recorded in PostgreSQL
 * - Idempotent upsert by slug
 * - Invalidates Redis problem caches
 */

import { resolve } from 'path';
import dotenv from 'dotenv';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import pg from 'pg';
import Redis from 'ioredis';
import { ProblemVisibility, REDIS_KEYS } from '@judge/shared';
import { PROBLEMS_BANK, BANK_METRICS } from './data/problems-bank.js';

// Load .env
dotenv.config({ path: resolve(process.cwd(), '.env') });
dotenv.config({ path: resolve(process.cwd(), '../.env') });

const databaseUrl =
  process.env.DATABASE_URL ||
  'postgresql://judge_user:judge_secret_password@localhost:5433/judge_db';
const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

const minioEndpoint = process.env.MINIO_ENDPOINT || 'localhost';
const minioPort = parseInt(process.env.MINIO_PORT || '9000', 10);
const minioBucket = process.env.MINIO_BUCKET_NAME || 'judge-testcases';
const minioRootUser = process.env.MINIO_ROOT_USER || 'minioadmin';
const minioRootPassword = process.env.MINIO_ROOT_PASSWORD || 'minioadmin';
const minioUseSSL = process.env.MINIO_USE_SSL === 'true';

// S3 V4 signing helpers for MinIO
function sha256Hex(value: string): string {
  return crypto.createHash('sha256').update(value, 'utf8').digest('hex');
}

function hmacSha256(key: Buffer | string, value: string): Buffer {
  return crypto.createHmac('sha256', key).update(value, 'utf8').digest();
}

async function uploadToMinio(key: string, content: string): Promise<void> {
  const protocol = minioUseSSL ? 'https' : 'http';
  const host = `${minioEndpoint}:${minioPort}`;
  const cleanKey = key.replace(/^\/+/, '');
  const encodedPath = cleanKey.split('/').map(encodeURIComponent).join('/');
  const canonicalUri = `/${minioBucket}/${encodedPath}`;
  const url = `${protocol}://${host}${canonicalUri}`;

  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.slice(0, 8);
  const region = 'us-east-1';
  const payloadHash = sha256Hex(content);
  const canonicalHeaders = `host:${host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${amzDate}\n`;
  const signedHeaders = 'host;x-amz-content-sha256;x-amz-date';
  const canonicalRequest = `PUT\n${canonicalUri}\n\n${canonicalHeaders}\n${signedHeaders}\n${payloadHash}`;
  const scope = `${dateStamp}/${region}/s3/aws4_request`;
  const stringToSign = `AWS4-HMAC-SHA256\n${amzDate}\n${scope}\n${sha256Hex(canonicalRequest)}`;

  const kDate = hmacSha256(`AWS4${minioRootPassword}`, dateStamp);
  const kRegion = hmacSha256(kDate, region);
  const kService = hmacSha256(kRegion, 's3');
  const kSigning = hmacSha256(kService, 'aws4_request');
  const signature = crypto
    .createHmac('sha256', kSigning)
    .update(stringToSign, 'utf8')
    .digest('hex');

  const headers = {
    'x-amz-date': amzDate,
    'x-amz-content-sha256': payloadHash,
    'Content-Type': 'text/plain; charset=utf-8',
    Authorization: `AWS4-HMAC-SHA256 Credential=${minioRootUser}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
  };

  const res = await fetch(url, {
    method: 'PUT',
    headers,
    body: content,
  });

  if (!res.ok) {
    throw new Error(`MinIO upload failed (${res.status}): ${await res.text()}`);
  }
}

async function seed() {
  console.log('[seed] Connecting to PostgreSQL at:', databaseUrl.replace(/:[^:@]+@/, ':***@'));
  const pool = new pg.Pool({ connectionString: databaseUrl });
  const redis = new Redis(redisUrl);

  try {
    // 1. Ensure admin and setter users exist
    console.log('[seed] Ensuring Admin and Problem Setter accounts...');
    const adminPasswordHash = await bcrypt.hash('admin1234', 10);
    const setterPasswordHash = await bcrypt.hash('setter1234', 10);

    const adminRes = await pool.query(
      `INSERT INTO users (username, email, password_hash, role)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (email) DO UPDATE SET role = $4, password_hash = $3
       RETURNING id`,
      ['admin', 'admin@judge.local', adminPasswordHash, 'admin']
    );
    const adminId = adminRes.rows[0].id;

    const setterRes = await pool.query(
      `INSERT INTO users (username, email, password_hash, role)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (email) DO UPDATE SET role = $4, password_hash = $3
       RETURNING id`,
      ['setter', 'setter@judge.local', setterPasswordHash, 'problem_setter']
    );
    const setterId = setterRes.rows[0].id;

    console.log(`[seed] Admin ID: ${adminId}`);
    console.log(`[seed] Setter ID: ${setterId}`);

    // 2. Seed the 50 real problems idempotently by slug
    console.log(
      `\n[seed] Seeding ${PROBLEMS_BANK.length} real coding problems (${BANK_METRICS.easy} Easy, ${BANK_METRICS.medium} Medium, ${BANK_METRICS.hard} Hard)...`
    );

    for (const prob of PROBLEMS_BANK) {
      console.log(`[seed] Processing problem: "${prob.title}" (${prob.slug})...`);

      // Check if problem already exists by slug
      const existing = await pool.query('SELECT id FROM problems WHERE slug = $1', [prob.slug]);

      let problemId: string;
      if (existing.rows.length > 0) {
        problemId = existing.rows[0].id;
        // Update problem definition
        await pool.query(
          `UPDATE problems
           SET title = $1, statement = $2, difficulty = $3, tags = $4,
               time_limit_ms = $5, memory_limit_mb = $6, sample_input = $7,
               sample_expected_output = $8, visibility = $9, input_format = $10,
               output_format = $11, constraints = $12, examples = $13,
               starter_code = $14, is_published = true, is_archived = false, updated_at = NOW()
           WHERE id = $15`,
          [
            prob.title,
            prob.statement,
            prob.difficulty,
            prob.tags,
            prob.timeLimitMs,
            prob.memoryLimitMb,
            prob.examples[0]?.input || '',
            prob.examples[0]?.output || '',
            ProblemVisibility.PUBLIC,
            prob.inputFormat,
            prob.outputFormat,
            prob.constraints,
            JSON.stringify(prob.examples),
            JSON.stringify(prob.starterCode),
            problemId,
          ]
        );
        // Delete old test cases for this problem so we upload fresh ones
        await pool.query('DELETE FROM test_cases WHERE problem_id = $1', [problemId]);
      } else {
        const insertRes = await pool.query(
          `INSERT INTO problems (
             title, slug, statement, difficulty, tags, time_limit_ms, memory_limit_mb,
             sample_input, sample_expected_output, visibility, input_format, output_format,
             constraints, examples, starter_code, is_published, setter_id, is_archived
           ) VALUES (
             $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, false
           ) RETURNING id`,
          [
            prob.title,
            prob.slug,
            prob.statement,
            prob.difficulty,
            prob.tags,
            prob.timeLimitMs,
            prob.memoryLimitMb,
            prob.examples[0]?.input || '',
            prob.examples[0]?.output || '',
            ProblemVisibility.PUBLIC,
            prob.inputFormat,
            prob.outputFormat,
            prob.constraints,
            JSON.stringify(prob.examples),
            JSON.stringify(prob.starterCode),
            true,
            setterId,
          ]
        );
        problemId = insertRes.rows[0].id;
      }

      // Upload test cases to MinIO and insert into test_cases table
      for (let i = 0; i < prob.testCases.length; i++) {
        const tc = prob.testCases[i];
        const inputKey = `${problemId}/${i}/input.txt`;
        const outputKey = `${problemId}/${i}/output.txt`;

        await uploadToMinio(inputKey, tc.input);
        await uploadToMinio(outputKey, tc.output);

        await pool.query(
          `INSERT INTO test_cases (problem_id, index, input_key, expected_output_key, is_hidden)
           VALUES ($1, $2, $3, $4, $5)`,
          [problemId, i, inputKey, outputKey, tc.isHidden]
        );
      }
      console.log(`[seed]   → Uploaded ${prob.testCases.length} test cases (sample & hidden)`);
    }

    // Invalidate Redis caches
    console.log('\n[seed] Invalidating Redis caches...');
    try {
      await redis.incr(REDIS_KEYS.PROBLEMS_LIST_VERSION);
      const keys = await redis.keys('judge:problem:*');
      if (keys.length > 0) {
        await redis.del(...keys);
      }
      console.log('[seed] Redis cache invalidated successfully.');
    } catch (e) {
      console.warn('[seed] Warning: Failed to invalidate Redis cache:', e);
    }

    console.log('\n[seed] ✅ Seeding completed successfully!');
    console.log('[seed] Accounts:');
    console.log('  → Admin:   admin@judge.local / admin1234');
    console.log('  → Setter:  setter@judge.local / setter1234');
    console.log(
      `[seed] ${PROBLEMS_BANK.length} real coding problems loaded (${BANK_METRICS.easy} Easy, ${BANK_METRICS.medium} Medium, ${BANK_METRICS.hard} Hard).`
    );
  } finally {
    await pool.end();
    await redis.quit();
  }
}

seed().catch((err) => {
  console.error('[seed] ❌ Seeding failed:', err);
  process.exit(1);
});
