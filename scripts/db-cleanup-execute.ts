import { resolve } from 'path';
import { readFileSync, writeFileSync } from 'fs';
import dotenv from 'dotenv';
import pg from 'pg';
import Redis from 'ioredis';
import crypto from 'crypto';
import { REDIS_KEYS } from '@judge/shared';

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

function sha256Hex(value: string): string {
  return crypto.createHash('sha256').update(value, 'utf8').digest('hex');
}

function hmacSha256(key: Buffer | string, value: string): Buffer {
  return crypto.createHmac('sha256', key).update(value, 'utf8').digest();
}

async function deleteFromMinio(key: string): Promise<boolean> {
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
  const payloadHash = sha256Hex('');
  const canonicalHeaders = `host:${host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${amzDate}\n`;
  const signedHeaders = 'host;x-amz-content-sha256;x-amz-date';
  const canonicalRequest = `DELETE\n${canonicalUri}\n\n${canonicalHeaders}\n${signedHeaders}\n${payloadHash}`;
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
    Authorization: `AWS4-HMAC-SHA256 Credential=${minioRootUser}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
  };

  try {
    const res = await fetch(url, { method: 'DELETE', headers });
    return res.ok || res.status === 404 || res.status === 204;
  } catch (err) {
    console.warn(`[cleanup-minio] Failed to delete object "${key}":`, err);
    return false;
  }
}

async function executeCleanup() {
  const allowlistPath = resolve(process.cwd(), 'scripts/data/cleanup-allowlist.json');
  let allowlistData: {
    status: string;
    candidateIds: Array<{ id: string; title: string; slug: string; reason: string }>;
  };

  try {
    const raw = readFileSync(allowlistPath, 'utf-8');
    allowlistData = JSON.parse(raw);
  } catch {
    console.error('❌ Could not read cleanup-allowlist.json. Run db-cleanup-dryrun.ts first.');
    process.exit(1);
  }

  const isApproved = process.argv.includes('--approved') || allowlistData.status === 'APPROVED';

  if (!isApproved) {
    console.error('❌ EXECUTION BLOCKED:');
    console.error('   The cleanup allowlist has not been marked as APPROVED.');
    console.error('   Review scripts/data/cleanup-allowlist.json and run with --approved flag.');
    process.exit(1);
  }

  const candidateIds = allowlistData.candidateIds.map((c) => c.id);
  if (candidateIds.length === 0) {
    console.log('✅ No candidate IDs in allowlist. Database is already clean.');
    return;
  }

  console.log(`Starting transactional cleanup for ${candidateIds.length} approved problem IDs...`);

  const pool = new pg.Pool({ connectionString: databaseUrl });
  const redis = new Redis(redisUrl);

  const client = await pool.connect();
  const minioKeysToDelete: string[] = [];

  try {
    // 1. Double-check foreign key relationships and collect MinIO keys before DB deletion
    const tcQuery = await client.query(
      `SELECT input_key, expected_output_key FROM test_cases WHERE problem_id = ANY($1::uuid[])`,
      [candidateIds]
    );
    for (const row of tcQuery.rows) {
      if (row.input_key) minioKeysToDelete.push(row.input_key);
      if (row.expected_output_key) minioKeysToDelete.push(row.expected_output_key);
    }

    // Double check that no candidate is in an active contest
    const contestCheck = await client.query(
      `SELECT cp.problem_id, c.title
       FROM contest_problems cp
       JOIN contests c ON c.id = cp.contest_id
       WHERE cp.problem_id = ANY($1::uuid[])`,
      [candidateIds]
    );

    if (contestCheck.rows.length > 0) {
      throw new Error(
        `Safety violation: Problem ${contestCheck.rows[0].problem_id} is referenced in contest "${contestCheck.rows[0].title}". Aborting cleanup.`
      );
    }

    // Double check that no candidate has submissions from legitimate users
    const subCheck = await client.query(
      `SELECT s.problem_id, u.username
       FROM submissions s
       JOIN users u ON u.id = s.user_id
       WHERE s.problem_id = ANY($1::uuid[])
         AND NOT (u.username LIKE 'w_%' OR u.username LIKE 'verify_user_%' OR u.username LIKE 'test_%' OR u.username LIKE 'e2e_%')`,
      [candidateIds]
    );

    if (subCheck.rows.length > 0) {
      throw new Error(
        `Safety violation: Problem ${subCheck.rows[0].problem_id} has submissions from non-test user "${subCheck.rows[0].username}". Aborting cleanup.`
      );
    }

    // 2. Execute PostgreSQL deletions inside an ACID transaction
    console.log('[cleanup-db] Beginning database transaction...');
    await client.query('BEGIN');

    // Delete test cases
    const deletedTcs = await client.query(
      `DELETE FROM test_cases WHERE problem_id = ANY($1::uuid[])`,
      [candidateIds]
    );
    console.log(`[cleanup-db] Deleted ${deletedTcs.rowCount} test_cases rows.`);

    // Delete test submissions
    const deletedSubs = await client.query(
      `DELETE FROM submissions WHERE problem_id = ANY($1::uuid[])`,
      [candidateIds]
    );
    console.log(`[cleanup-db] Deleted ${deletedSubs.rowCount} test submissions rows.`);

    // Delete problems
    const deletedProbs = await client.query(`DELETE FROM problems WHERE id = ANY($1::uuid[])`, [
      candidateIds,
    ]);
    console.log(`[cleanup-db] Deleted ${deletedProbs.rowCount} problems rows.`);

    await client.query('COMMIT');
    console.log('[cleanup-db] ✅ Database transaction committed successfully.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Database transaction rolled back due to error:', err);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }

  // 3. MinIO cleanup happens separately after database transaction commit
  console.log(`\n[cleanup-minio] Deleting ${minioKeysToDelete.length} MinIO objects separately...`);
  const failedKeys: string[] = [];

  for (const key of minioKeysToDelete) {
    const ok = await deleteFromMinio(key);
    if (!ok) {
      failedKeys.push(key);
    }
  }

  if (failedKeys.length > 0) {
    const retryFilePath = resolve(process.cwd(), 'scripts/data/minio-cleanup-retries.json');
    writeFileSync(retryFilePath, JSON.stringify(failedKeys, null, 2), 'utf-8');
    console.warn(
      `[cleanup-minio] ⚠️  ${failedKeys.length} objects could not be deleted; saved to ${retryFilePath} for safe retry.`
    );
  } else {
    console.log('[cleanup-minio] ✅ All MinIO objects deleted successfully.');
  }

  // 4. Invalidate Redis caches
  try {
    await redis.incr(REDIS_KEYS.PROBLEMS_LIST_VERSION);
    const keys = await redis.keys('judge:problem:*');
    if (keys.length > 0) {
      await redis.del(...keys);
    }
    console.log('[cleanup-redis] ✅ Redis caches invalidated.');
  } catch (err) {
    console.warn('[cleanup-redis] Failed to invalidate Redis:', err);
  } finally {
    await redis.quit();
  }

  console.log('\n✅ Cleanup completed successfully!');
}

executeCleanup().catch((err) => {
  console.error('❌ Cleanup failed:', err);
  process.exit(1);
});
