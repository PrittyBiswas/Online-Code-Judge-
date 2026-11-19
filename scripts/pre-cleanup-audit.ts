import pg from 'pg';
import dotenv from 'dotenv';
import { resolve } from 'path';
import { PROBLEMS_BANK } from './data/problems-bank.js';

dotenv.config({ path: resolve(process.cwd(), '.env') });

const dbUrl =
  process.env.DATABASE_URL ||
  'postgresql://judge_user:judge_secret_password@localhost:5433/judge_db';

async function runAudit() {
  const client = new pg.Client({ connectionString: dbUrl });
  await client.connect();

  console.log('=== 1. ALL PROBLEMS IN DATABASE ===');
  const problemsRes = await client.query(`
    SELECT id, title, slug, difficulty, is_archived, created_at, updated_at
    FROM problems
    ORDER BY created_at ASC, id ASC
  `);

  console.log(`Total problems in DB: ${problemsRes.rows.length}`);

  // Categorize
  const seededSlugs = new Set(PROBLEMS_BANK.map((p) => p.slug));
  const bankProblems: typeof problemsRes.rows = [];
  const testFixtures: typeof problemsRes.rows = [];
  const otherProblems: typeof problemsRes.rows = [];

  for (const row of problemsRes.rows) {
    if (seededSlugs.has(row.slug)) {
      bankProblems.push(row);
    } else if (
      row.title.startsWith('Day8 MultiTest') ||
      row.title.startsWith('Worker E2E') ||
      row.slug.startsWith('day8-multitest') ||
      row.slug.startsWith('worker-e2e')
    ) {
      testFixtures.push(row);
    } else {
      otherProblems.push(row);
    }
  }

  console.log(`\nBank Problems matched: ${bankProblems.length}`);
  console.log(`Test Fixtures matched: ${testFixtures.length}`);
  console.log(`Other Problems matched: ${otherProblems.length}`);

  console.log('\n--- Details of "Other" problems:');
  for (const p of otherProblems) {
    console.log(`- ${p.id} | ${p.slug} | ${p.title} | created: ${p.created_at.toISOString()}`);
  }

  console.log('\n--- Details of Test Fixtures:');
  for (const p of testFixtures) {
    console.log(`- ${p.id} | ${p.slug} | ${p.title} | created: ${p.created_at.toISOString()}`);
  }

  console.log('\n=== 2. SUBMISSIONS TABLE VERDICTS IN DB ===');
  // Check column definition
  const colInfo = await client.query(`
    SELECT column_name, data_type, character_maximum_length, udt_name
    FROM information_schema.columns
    WHERE table_name = 'submissions' AND column_name IN ('verdict', 'status')
  `);
  console.log('Column Schema Info:');
  console.table(colInfo.rows);

  // Distinct verdicts stored in submissions table
  const verdictCounts = await client.query(`
    SELECT verdict, status, COUNT(*) as count
    FROM submissions
    GROUP BY verdict, status
    ORDER BY count DESC
  `);
  console.log('\nActual Distinct Verdicts in submissions table:');
  console.table(verdictCounts.rows);

  // Check foreign key dependencies of candidate fixtures
  console.log('\n=== 3. FOREIGN KEY AUDIT FOR TEST FIXTURES ===');
  for (const tf of testFixtures) {
    const subCount = await client.query(`SELECT COUNT(*) FROM submissions WHERE problem_id = $1`, [
      tf.id,
    ]);
    const cpCount = await client.query(
      `SELECT COUNT(*) FROM contest_problems WHERE problem_id = $1`,
      [tf.id]
    );
    const tcCount = await client.query(`SELECT COUNT(*) FROM test_cases WHERE problem_id = $1`, [
      tf.id,
    ]);
    console.log(
      `Fixture [${tf.slug}]: submissions=${subCount.rows[0].count}, contest_problems=${cpCount.rows[0].count}, test_cases=${tcCount.rows[0].count}`
    );
  }

  console.log('\n=== 4. CONTEST RELATIONSHIPS IN DB ===');
  const contestRes = await client.query(`
    SELECT cp.contest_id, c.title as contest_title, cp.problem_id, p.title as problem_title, p.slug
    FROM contest_problems cp
    JOIN contests c ON cp.contest_id = c.id
    JOIN problems p ON cp.problem_id = p.id
  `);
  console.log(`Contest problems count: ${contestRes.rows.length}`);
  console.table(contestRes.rows);

  console.log('\n=== 5. ALL 55 LEGITIMATE PROBLEMS TABLE ===');
  const legitimate = problemsRes.rows.filter((r) => !testFixtures.some((tf) => tf.id === r.id));
  console.log(`Legitimate problems count: ${legitimate.length}`);
  console.table(
    legitimate.map((r, i) => ({
      '#': i + 1,
      id: r.id,
      title: r.title.length > 30 ? r.title.slice(0, 27) + '...' : r.title,
      slug: r.slug.length > 35 ? r.slug.slice(0, 32) + '...' : r.slug,
      difficulty: r.difficulty,
      isBank50: seededSlugs.has(r.slug) ? 'YES' : 'NO',
    }))
  );

  console.log('\n=== 6. SUBMISSIONS SUMMARY BY PROBLEM ===');
  const subsByProb = await client.query(`
    SELECT s.problem_id, p.title, p.slug, s.verdict, s.status, COUNT(*) as count
    FROM submissions s
    JOIN problems p ON s.problem_id = p.id
    GROUP BY s.problem_id, p.title, p.slug, s.verdict, s.status
  `);
  console.table(subsByProb.rows);

  await client.end();
}

runAudit().catch((err) => {
  console.error('Audit failed:', err);
  process.exit(1);
});
