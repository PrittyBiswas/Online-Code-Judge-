import { resolve } from 'path';
import { readFileSync, writeFileSync } from 'fs';
import dotenv from 'dotenv';
import pg from 'pg';

dotenv.config({ path: resolve(process.cwd(), '.env') });
dotenv.config({ path: resolve(process.cwd(), '../.env') });

const databaseUrl =
  process.env.DATABASE_URL ||
  'postgresql://judge_user:judge_secret_password@localhost:5433/judge_db';

async function createBackup() {
  console.log('===============================================================');
  console.log('       PRE-CLEANUP BACKUP & MINIO CROSS-REFERENCE AUDIT        ');
  console.log('===============================================================\n');

  const allowlistPath = resolve(process.cwd(), 'scripts/data/cleanup-allowlist.json');
  const raw = readFileSync(allowlistPath, 'utf-8');
  const allowlistData = JSON.parse(raw);
  const candidateIds: string[] = allowlistData.candidateIds.map((c: any) => c.id);

  console.log(`Candidate IDs count: ${candidateIds.length}`);

  const pool = new pg.Pool({ connectionString: databaseUrl });
  const client = await pool.connect();

  try {
    // 1. Fetch Problem records
    const problemsQuery = await client.query(
      `SELECT * FROM problems WHERE id = ANY($1::uuid[]) ORDER BY created_at ASC`,
      [candidateIds]
    );

    // 2. Fetch Submissions
    const submissionsQuery = await client.query(
      `SELECT * FROM submissions WHERE problem_id = ANY($1::uuid[]) ORDER BY created_at ASC`,
      [candidateIds]
    );

    // 3. Fetch Test Cases
    const testCasesQuery = await client.query(
      `SELECT * FROM test_cases WHERE problem_id = ANY($1::uuid[]) ORDER BY problem_id, index ASC`,
      [candidateIds]
    );

    // 4. Collect MinIO keys
    const minioKeys: string[] = [];
    for (const tc of testCasesQuery.rows) {
      if (tc.input_key) minioKeys.push(tc.input_key);
      if (tc.expected_output_key) minioKeys.push(tc.expected_output_key);
    }

    console.log(`Fetched backup data:`);
    console.log(`  - Problems rows   : ${problemsQuery.rows.length}`);
    console.log(`  - Submissions rows: ${submissionsQuery.rows.length}`);
    console.log(`  - Test cases rows : ${testCasesQuery.rows.length}`);
    console.log(`  - MinIO keys      : ${minioKeys.length}`);

    // 5. Cross-reference check: verify no legitimate problem references these MinIO keys
    const crossRefCheck = await client.query(
      `SELECT tc.problem_id, p.title, p.slug, tc.input_key, tc.expected_output_key
       FROM test_cases tc
       JOIN problems p ON p.id = tc.problem_id
       WHERE NOT (tc.problem_id = ANY($1::uuid[]))
         AND (tc.input_key = ANY($2::varchar[]) OR tc.expected_output_key = ANY($2::varchar[]))`,
      [candidateIds, minioKeys]
    );

    if (crossRefCheck.rows.length > 0) {
      console.error('❌ SAFETY VIOLATION: MinIO key is shared with a legitimate problem!');
      console.table(crossRefCheck.rows);
      process.exit(1);
    }
    console.log(
      `✅ Cross-reference check passed: Zero MinIO keys are referenced by legitimate problems.`
    );

    // 6. Check foreign key references in contest_problems
    const contestCheck = await client.query(
      `SELECT * FROM contest_problems WHERE problem_id = ANY($1::uuid[])`,
      [candidateIds]
    );
    console.log(
      `✅ Contest problems check passed: ${contestCheck.rows.length} contest references found.`
    );

    // 7. Write full recoverable backup file
    const backupData = {
      backupTimestamp: new Date().toISOString(),
      candidateIds,
      problems: problemsQuery.rows,
      submissions: submissionsQuery.rows,
      testCases: testCasesQuery.rows,
      minioKeys,
    };

    const backupPath = resolve(process.cwd(), 'scripts/data/cleanup-backup.json');
    writeFileSync(backupPath, JSON.stringify(backupData, null, 2), 'utf8');
    console.log(`\n✅ Recoverable backup written to: ${backupPath}`);
  } finally {
    client.release();
    await pool.end();
  }
}

createBackup().catch((err) => {
  console.error('Backup failed:', err);
  process.exit(1);
});
