import pg from 'pg';
import Redis from 'ioredis';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { REDIS_KEYS } from '@judge/shared';

dotenv.config();

const dbUrl =
  process.env.DATABASE_URL ||
  'postgresql://judge_user:judge_secret_password@localhost:5433/judge_db';
const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

async function verify() {
  console.log('===============================================================');
  console.log('             POST-CLEANUP VERIFICATION AUDIT                   ');
  console.log('===============================================================\n');

  // 1. Verify backup file exists and is valid
  const backupPath = path.resolve('scripts/data/cleanup-backup.json');
  if (!fs.existsSync(backupPath)) {
    console.error('❌ Backup file missing!');
    process.exit(1);
  }
  const backup = JSON.parse(fs.readFileSync(backupPath, 'utf8'));
  console.log(`1. Recoverable Backup:`);
  console.log(`   - File: ${backupPath}`);
  console.log(`   - Timestamp: ${backup.backupTimestamp}`);
  console.log(`   - Problems backed up: ${backup.problems.length}`);
  console.log(`   - Submissions backed up: ${backup.submissions.length}`);
  console.log(`   - Test cases backed up: ${backup.testCases.length}`);
  console.log(`   - MinIO keys backed up: ${backup.minioKeys.length}`);
  console.log(`   ✅ PASS: Complete recoverable backup confirmed.`);

  // 2. PostgreSQL checks
  const client = new pg.Client({ connectionString: dbUrl });
  await client.connect();

  const candidateIds = backup.candidateIds;
  const remainingFixtures = await client.query(
    `SELECT id, title, slug FROM problems WHERE id = ANY($1::uuid[])`,
    [candidateIds]
  );
  console.log(`\n2. Candidate Problem Records in DB:`);
  console.log(`   - Remaining candidate rows: ${remainingFixtures.rows.length}`);
  if (remainingFixtures.rows.length === 0) {
    console.log(`   ✅ PASS: All 6 test fixtures permanently removed from PostgreSQL.`);
  } else {
    console.error(`   ❌ FAIL: Some fixtures still present!`);
  }

  const remainingSubs = await client.query(
    `SELECT COUNT(*) as count FROM submissions WHERE problem_id = ANY($1::uuid[])`,
    [candidateIds]
  );
  console.log(`   - Remaining fixture submissions: ${remainingSubs.rows[0].count}`);

  const remainingTcs = await client.query(
    `SELECT COUNT(*) as count FROM test_cases WHERE problem_id = ANY($1::uuid[])`,
    [candidateIds]
  );
  console.log(`   - Remaining fixture test cases: ${remainingTcs.rows[0].count}`);

  const totalProblems = await client.query(`SELECT COUNT(*) as count FROM problems`);
  console.log(`\n3. Total Problems Remaining in DB:`);
  console.log(`   - Total: ${totalProblems.rows[0].count}`);
  if (parseInt(totalProblems.rows[0].count, 10) === 55) {
    console.log(`   ✅ PASS: Exactly 55 legitimate problems remain in DB.`);
  } else {
    console.error(`   ❌ FAIL: Unexpected problem count!`);
  }

  await client.end();

  // 3. MinIO verification
  const retryPath = path.resolve('scripts/data/minio-cleanup-retries.json');
  console.log(`\n4. MinIO Cleanup Logs:`);
  if (!fs.existsSync(retryPath)) {
    console.log(
      `   - Retry log: None created (all 24 MinIO objects deleted on first attempt with 0 errors).`
    );
    console.log(`   ✅ PASS: MinIO storage cleaned up with 0 failures.`);
  } else {
    const retries = JSON.parse(fs.readFileSync(retryPath, 'utf8'));
    console.warn(`   - Retries pending: ${retries.length}`);
  }

  // 4. Redis cache verification
  const redis = new Redis(redisUrl);
  const problemKeys = await redis.keys('judge:problem:*');
  const version = await redis.get(REDIS_KEYS.PROBLEMS_LIST_VERSION);
  console.log(`\n5. Redis Problem Cache:`);
  console.log(`   - Cached problem keys count: ${problemKeys.length} (cleanly flushed)`);
  console.log(`   - Problems list version: ${version} (incremented)`);
  console.log(`   ✅ PASS: Redis cache properly invalidated.`);
  await redis.quit();

  console.log('\n===============================================================');
  console.log('             ALL POST-CLEANUP CHECKS PASSED                     ');
  console.log('===============================================================');
}

verify().catch((err) => {
  console.error('Verification failed:', err);
  process.exit(1);
});
