import { resolve } from 'path';
import { writeFileSync, mkdirSync } from 'fs';
import dotenv from 'dotenv';
import pg from 'pg';

dotenv.config({ path: resolve(process.cwd(), '.env') });
dotenv.config({ path: resolve(process.cwd(), '../.env') });

const databaseUrl =
  process.env.DATABASE_URL ||
  'postgresql://judge_user:judge_secret_password@localhost:5433/judge_db';

interface ProblemAudit {
  id: string;
  title: string;
  slug: string;
  difficulty: string;
  visibility: string;
  isPublished: boolean;
  isArchived: boolean;
  createdAt: string;
  testCaseCount: number;
  submissionCount: number;
  contestCount: number;
  classification:
    | 'ELIGIBLE_FOR_CLEANUP'
    | 'PROTECTED_HAS_LEGITIMATE_SUBMISSIONS'
    | 'PROTECTED_IN_ACTIVE_CONTEST'
    | 'LEGITIMATE_CATALOG_PROBLEM';
  reason: string;
}

const TEST_FIXTURE_PATTERNS = [
  /^Day8 MultiTest/i,
  /^Worker E2E/i,
  /^Verification Problem/i,
  /^Stress test/i,
  /^E2E Sum Problem/i,
  /^Public Searchable/i,
  /^Secret Contest Problem/i,
  /^Released Contest Problem/i,
  /^Multi Contest Problem/i,
  /^Draft Unlinked Problem/i,
  /^Binary Graph /i,
  /^Dynamic Knapsack /i,
  /^Easy Array Sum /i,
  /^Hard Graph Shortest Path /i,
  /^Array Duplicate Time /i,
  /^Disposable Cache Problem/i,
  /^Referenced Problem /i,
  /^DB Check Test/i,
  /^Freeze Problem/i,
  /^Shared Problem/i,
];

const TEST_SLUG_PATTERNS = [/^day8-multitest-/i, /^worker-e2e-/i, /^test-/i, /^w_/i];

async function runDryRunAudit() {
  console.log('===============================================================');
  console.log(' DATABASE RECORD CLEANUP — DRY-RUN AUDIT & ALLOWLIST GENERATOR');
  console.log('===============================================================\n');

  const pool = new pg.Pool({ connectionString: databaseUrl });

  try {
    const problemsRes = await pool.query(`
      SELECT 
        p.id, 
        p.title, 
        p.slug, 
        p.difficulty, 
        p.visibility, 
        p.is_published AS "isPublished", 
        p.is_archived AS "isArchived", 
        p.created_at AS "createdAt",
        COUNT(DISTINCT tc.id)::int AS "testCaseCount",
        COUNT(DISTINCT s.id)::int AS "submissionCount",
        COUNT(DISTINCT cp.contest_id)::int AS "contestCount"
      FROM problems p
      LEFT JOIN test_cases tc ON tc.problem_id = p.id
      LEFT JOIN submissions s ON s.problem_id = p.id
      LEFT JOIN contest_problems cp ON cp.problem_id = p.id
      GROUP BY p.id
      ORDER BY p.created_at ASC
    `);

    const allProblems = problemsRes.rows;
    console.log(`Found ${allProblems.length} total problem records in database.\n`);

    const audits: ProblemAudit[] = [];
    const allowlist: Array<{ id: string; title: string; slug: string; reason: string }> = [];

    for (const prob of allProblems) {
      const isTestTitle = TEST_FIXTURE_PATTERNS.some((pat) => pat.test(prob.title));
      const isTestSlug = TEST_SLUG_PATTERNS.some((pat) => pat.test(prob.slug));
      const isTestPattern = isTestTitle || isTestSlug;

      let classification: ProblemAudit['classification'];
      let reason = '';

      if (!isTestPattern) {
        classification = 'LEGITIMATE_CATALOG_PROBLEM';
        reason = 'Legitimate problem specification (non-test fixture pattern)';
      } else if (prob.contestCount > 0) {
        classification = 'PROTECTED_IN_ACTIVE_CONTEST';
        reason = `Referenced by ${prob.contestCount} contest(s)`;
      } else if (prob.submissionCount > 0) {
        // Check whether submissions are from real users or test users
        const subUsersRes = await pool.query(
          `SELECT DISTINCT u.username, u.role
           FROM submissions s
           JOIN users u ON u.id = s.user_id
           WHERE s.problem_id = $1`,
          [prob.id]
        );
        const userList = subUsersRes.rows.map((u: any) => `${u.username} (${u.role})`).join(', ');

        // If submissions are ONLY from ephemeral test users (e.g. w_*, verify_user_*), it's a test fixture
        const allTestUsers = subUsersRes.rows.every(
          (u: any) =>
            u.username.startsWith('w_') ||
            u.username.startsWith('verify_user_') ||
            u.username.startsWith('test_') ||
            u.username.startsWith('e2e_')
        );

        if (allTestUsers) {
          classification = 'ELIGIBLE_FOR_CLEANUP';
          reason = `Abandoned test fixture with only test-runner submissions (${userList})`;
        } else {
          classification = 'PROTECTED_HAS_LEGITIMATE_SUBMISSIONS';
          reason = `Associated with real user submissions (${userList})`;
        }
      } else {
        classification = 'ELIGIBLE_FOR_CLEANUP';
        reason = 'Confirmed orphaned test fixture (0 user submissions, 0 contests)';
      }

      audits.push({
        id: prob.id,
        title: prob.title,
        slug: prob.slug,
        difficulty: prob.difficulty,
        visibility: prob.visibility,
        isPublished: prob.isPublished,
        isArchived: prob.isArchived,
        createdAt: new Date(prob.createdAt).toISOString(),
        testCaseCount: prob.testCaseCount,
        submissionCount: prob.submissionCount,
        contestCount: prob.contestCount,
        classification,
        reason,
      });

      if (classification === 'ELIGIBLE_FOR_CLEANUP') {
        allowlist.push({
          id: prob.id,
          title: prob.title,
          slug: prob.slug,
          reason,
        });
      }
    }

    // Print summary table
    console.log(
      '------------------------------------------------------------------------------------------------------------------------'
    );
    console.log(
      'ID                                   | Title                              | Subs | Contests | Status'
    );
    console.log(
      '------------------------------------------------------------------------------------------------------------------------'
    );
    for (const a of audits) {
      const id = a.id.padEnd(36);
      const title = a.title.slice(0, 34).padEnd(34);
      const subs = String(a.submissionCount).padStart(4);
      const contests = String(a.contestCount).padStart(8);
      console.log(`${id} | ${title} | ${subs} | ${contests} | ${a.classification}`);
    }
    console.log(
      '------------------------------------------------------------------------------------------------------------------------\n'
    );

    const eligibleCount = audits.filter((a) => a.classification === 'ELIGIBLE_FOR_CLEANUP').length;
    const protectedSubsCount = audits.filter(
      (a) => a.classification === 'PROTECTED_HAS_LEGITIMATE_SUBMISSIONS'
    ).length;
    const protectedContestsCount = audits.filter(
      (a) => a.classification === 'PROTECTED_IN_ACTIVE_CONTEST'
    ).length;
    const legitimateCount = audits.filter(
      (a) => a.classification === 'LEGITIMATE_CATALOG_PROBLEM'
    ).length;

    console.log('SUMMARY AUDIT METRICS:');
    console.log(`  - Total Problem Records               : ${audits.length}`);
    console.log(`  - Legitimate Catalog Problems         : ${legitimateCount}`);
    console.log(`  - Protected (Legitimate Submissions)  : ${protectedSubsCount}`);
    console.log(`  - Protected (Active/Scheduled Contests): ${protectedContestsCount}`);
    console.log(`  - Eligible for Cleanup (Allowlisted)  : ${eligibleCount}\n`);

    mkdirSync(resolve(process.cwd(), 'scripts/data'), { recursive: true });

    const reportPath = resolve(process.cwd(), 'scripts/data/cleanup-dryrun-report.json');
    writeFileSync(reportPath, JSON.stringify(audits, null, 2), 'utf-8');
    console.log(`✅ Full dry-run audit report saved to: ${reportPath}`);

    const allowlistPath = resolve(process.cwd(), 'scripts/data/cleanup-allowlist.json');
    const allowlistPayload = {
      generatedAt: new Date().toISOString(),
      status: 'PENDING_MANUAL_REVIEW_AND_APPROVAL',
      eligibleCount,
      candidateIds: allowlist,
    };
    writeFileSync(allowlistPath, JSON.stringify(allowlistPayload, null, 2), 'utf-8');
    console.log(`✅ Candidate cleanup allowlist saved to: ${allowlistPath}`);
    console.log(
      '\n⚠️  NO RECORDS WERE DELETED. Awaiting manual review and approval before execution.\n'
    );
  } finally {
    await pool.end();
  }
}

runDryRunAudit().catch((err) => {
  console.error('❌ Dry-run audit failed:', err);
  process.exit(1);
});
