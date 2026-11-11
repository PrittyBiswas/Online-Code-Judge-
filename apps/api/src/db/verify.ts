import { eq, sql } from 'drizzle-orm';
import { db, checkDatabaseConnection, closeDatabase } from './index.js';
import { users, problems, testCases, submissions } from './schema.js';

async function verifyDatabase() {
  console.log('🔍 Verifying Day 4 PostgreSQL + Drizzle ORM integration...\n');

  const isHealthy = await checkDatabaseConnection();
  if (!isHealthy) {
    console.error('❌ Could not connect to PostgreSQL via Drizzle ORM.');
    console.error('   Ensure Docker Postgres is running and DATABASE_URL matches POSTGRES_PORT.');
    await closeDatabase().catch(() => {});
    process.exit(1);
  }
  console.log('✅ Connected to PostgreSQL via Drizzle ORM (SELECT 1 succeeded).');

  // Verify core tables & Drizzle migration journal exist
  const tablesRes = await db.execute(sql`
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public'
    ORDER BY tablename;
  `);
  const tableNames = tablesRes.rows.map((r) => String((r as { tablename: string }).tablename));
  for (const required of ['users', 'problems', 'test_cases', 'submissions']) {
    if (!tableNames.includes(required)) {
      throw new Error(`Expected table "${required}" was not found in schema "public".`);
    }
  }
  console.log(`✅ Verified schema tables: ${tableNames.join(', ')}`);

  // Perform real insert -> read -> constraint check -> cleanup
  const suffix = Date.now();
  let createdUserId: string | undefined;

  try {
    const [insertedUser] = await db
      .insert(users)
      .values({
        username: `verify_user_${suffix}`,
        email: `verify_${suffix}@judge.local`,
        passwordHash: '$2b$10$day4verificationplaceholderhashvalue',
        role: 'problem_setter',
      })
      .returning();

    createdUserId = insertedUser.id;

    const [insertedProblem] = await db
      .insert(problems)
      .values({
        title: `Verification Problem ${suffix}`,
        slug: `verification-problem-${suffix}`,
        statement: 'Return input verbatim.',
        difficulty: 'easy',
        tags: ['verification'],
        setterId: insertedUser.id,
      })
      .returning();

    const [insertedTestCase] = await db
      .insert(testCases)
      .values({
        problemId: insertedProblem.id,
        index: 0,
        inputKey: `problems/${insertedProblem.id}/test_0_in.txt`,
        expectedOutputKey: `problems/${insertedProblem.id}/test_0_out.txt`,
        isHidden: false,
      })
      .returning();

    const [insertedSubmission] = await db
      .insert(submissions)
      .values({
        problemId: insertedProblem.id,
        userId: insertedUser.id,
        code: 'console.log("ok");',
        language: 'javascript',
        status: 'QUEUED',
      })
      .returning();

    const [readSubmission] = await db
      .select()
      .from(submissions)
      .where(eq(submissions.id, insertedSubmission.id));

    if (!readSubmission || readSubmission.problemId !== insertedProblem.id) {
      throw new Error('Failed to read back inserted submission record.');
    }

    // Verify foreign key constraint enforcement (must reject non-existent problemId)
    let fkRejected = false;
    try {
      await db.insert(testCases).values({
        problemId: '00000000-0000-0000-0000-000000000000',
        index: 1,
        inputKey: 'bad',
        expectedOutputKey: 'bad',
      });
    } catch {
      fkRejected = true;
    }

    if (!fkRejected) {
      throw new Error('Expected foreign key constraint on test_cases.problem_id to reject bad UUID.');
    }

    console.log(
      `✅ Insert/read/constraint check passed (user=${insertedUser.id}, problem=${insertedProblem.id}, testCase=${insertedTestCase.id}, submission=${readSubmission.id}).`
    );
  } finally {
    if (createdUserId) {
      // Remove child problem first because problems.setter_id uses ON DELETE RESTRICT
      await db.delete(problems).where(eq(problems.setterId, createdUserId));
      await db.delete(users).where(eq(users.id, createdUserId));
      console.log('🧹 Cleaned up temporary Day 4 verification records.');
    }
    await closeDatabase();
  }

  console.log('\n🎉 All Day 4 database checks passed.');
}

verifyDatabase().catch(async (err) => {
  console.error('❌ Database verification failed:', err);
  await closeDatabase().catch(() => {});
  process.exit(1);
});

