import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import crypto from 'crypto';
import { eq, inArray, asc } from 'drizzle-orm';
import { db, checkDatabaseConnection, closeDatabase } from '../src/db/index.js';
import {
  users,
  problems,
  contests,
  contestProblems,
  contestParticipants,
} from '../src/db/schema.js';

function getPgErrorCode(err: any): string | undefined {
  return err?.cause?.code || err?.code;
}

describe('Day 18 Contest Database Integration Tests', () => {
  const runTag = `${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
  const createdUserIds: string[] = [];
  const createdProblemIds: string[] = [];
  const createdContestIds: string[] = [];

  let adminUserId: string;
  let regularUserAId: string;
  let regularUserBId: string;
  let problemAId: string;
  let problemBId: string;
  let problemCId: string;

  beforeAll(async () => {
    const connected = await checkDatabaseConnection();
    if (!connected) {
      throw new Error(
        'PostgreSQL is unreachable for integration tests. Start Docker Postgres and verify DATABASE_URL.'
      );
    }

    // Create 3 users (1 admin, 2 regular participants)
    const [adminUser] = await db
      .insert(users)
      .values({
        username: `admin_${runTag}`,
        email: `admin_${runTag}@judge.local`,
        passwordHash: '$2b$10$placeholderpasswordhashforcontests',
        role: 'admin',
      })
      .returning();
    adminUserId = adminUser.id;
    createdUserIds.push(adminUserId);

    const [userA] = await db
      .insert(users)
      .values({
        username: `user_a_${runTag}`,
        email: `user_a_${runTag}@judge.local`,
        passwordHash: '$2b$10$placeholderpasswordhashforcontests',
        role: 'user',
      })
      .returning();
    regularUserAId = userA.id;
    createdUserIds.push(regularUserAId);

    const [userB] = await db
      .insert(users)
      .values({
        username: `user_b_${runTag}`,
        email: `user_b_${runTag}@judge.local`,
        passwordHash: '$2b$10$placeholderpasswordhashforcontests',
        role: 'user',
      })
      .returning();
    regularUserBId = userB.id;
    createdUserIds.push(regularUserBId);

    // Create 3 problems
    const [pA] = await db
      .insert(problems)
      .values({
        title: `Contest Problem A ${runTag}`,
        slug: `contest-problem-a-${runTag}`,
        statement: 'Problem A statement for contest',
        difficulty: 'easy',
        tags: ['contest', 'math'],
        setterId: adminUserId,
      })
      .returning();
    problemAId = pA.id;
    createdProblemIds.push(problemAId);

    const [pB] = await db
      .insert(problems)
      .values({
        title: `Contest Problem B ${runTag}`,
        slug: `contest-problem-b-${runTag}`,
        statement: 'Problem B statement for contest',
        difficulty: 'medium',
        tags: ['contest', 'dp'],
        setterId: adminUserId,
      })
      .returning();
    problemBId = pB.id;
    createdProblemIds.push(problemBId);

    const [pC] = await db
      .insert(problems)
      .values({
        title: `Contest Problem C ${runTag}`,
        slug: `contest-problem-c-${runTag}`,
        statement: 'Problem C statement for contest',
        difficulty: 'hard',
        tags: ['contest', 'graphs'],
        setterId: adminUserId,
      })
      .returning();
    problemCId = pC.id;
    createdProblemIds.push(problemCId);
  });

  afterAll(async () => {
    // Clean up created entities in reverse dependency order
    if (createdContestIds.length > 0) {
      await db
        .delete(contestParticipants)
        .where(inArray(contestParticipants.contestId, createdContestIds));
      await db.delete(contestProblems).where(inArray(contestProblems.contestId, createdContestIds));
      await db.delete(contests).where(inArray(contests.id, createdContestIds));
    }
    if (createdProblemIds.length > 0) {
      await db.delete(problems).where(inArray(problems.id, createdProblemIds));
    }
    if (createdUserIds.length > 0) {
      await db.delete(users).where(inArray(users.id, createdUserIds));
    }
    await closeDatabase();
  });

  // 1. Contest creation
  it('1. Contest creation: successfully inserts a contest into PostgreSQL', async () => {
    const startTime = new Date(Date.now() + 3600 * 1000);
    const endTime = new Date(Date.now() + 7200 * 1000);

    const [contest] = await db
      .insert(contests)
      .values({
        title: `Weekly Contest ${runTag}`,
        description: 'A weekly contest description',
        startTime,
        endTime,
        freezeMinutes: 30,
        createdBy: adminUserId,
      })
      .returning();

    expect(contest).toBeDefined();
    expect(contest.id).toBeDefined();
    expect(contest.title).toBe(`Weekly Contest ${runTag}`);
    expect(contest.freezeMinutes).toBe(30);
    expect(contest.createdBy).toBe(adminUserId);
    expect(contest.createdAt).toBeInstanceOf(Date);
    expect(contest.updatedAt).toBeInstanceOf(Date);

    createdContestIds.push(contest.id);
  });

  // 2. Contest retrieval
  it('2. Contest retrieval: fetches created contest by ID with exact field matching', async () => {
    const contestId = createdContestIds[0];
    const [fetched] = await db.select().from(contests).where(eq(contests.id, contestId)).limit(1);

    expect(fetched).toBeDefined();
    expect(fetched.id).toBe(contestId);
    expect(fetched.title).toBe(`Weekly Contest ${runTag}`);
    expect(fetched.freezeMinutes).toBe(30);
    expect(fetched.createdBy).toBe(adminUserId);
  });

  // 3. Multiple problems assigned to one contest
  it('3. Multiple problems assigned to one contest: transactional multi-problem assignment', async () => {
    const contestId = createdContestIds[0];
    const assignedProblems = [
      { contestId, problemId: problemAId, problemOrder: 1 },
      { contestId, problemId: problemBId, problemOrder: 2 },
      { contestId, problemId: problemCId, problemOrder: 3 },
    ];

    await db.transaction(async (tx) => {
      for (const item of assignedProblems) {
        await tx.insert(contestProblems).values(item);
      }
    });

    const rows = await db
      .select()
      .from(contestProblems)
      .where(eq(contestProblems.contestId, contestId));

    expect(rows).toHaveLength(3);
    const problemIdsInContest = rows.map((r) => r.problemId);
    expect(problemIdsInContest).toContain(problemAId);
    expect(problemIdsInContest).toContain(problemBId);
    expect(problemIdsInContest).toContain(problemCId);
  });

  // 4. Problem ordering preserved
  it('4. Problem ordering preserved: preserves submitted order 1, 2, 3', async () => {
    const contestId = createdContestIds[0];
    const orderedRows = await db
      .select()
      .from(contestProblems)
      .where(eq(contestProblems.contestId, contestId))
      .orderBy(asc(contestProblems.problemOrder));

    expect(orderedRows).toHaveLength(3);
    expect(orderedRows[0].problemId).toBe(problemAId);
    expect(orderedRows[0].problemOrder).toBe(1);
    expect(orderedRows[1].problemId).toBe(problemBId);
    expect(orderedRows[1].problemOrder).toBe(2);
    expect(orderedRows[2].problemId).toBe(problemCId);
    expect(orderedRows[2].problemOrder).toBe(3);
  });

  // 5. Duplicate contest-problem assignment rejected
  it('5. Duplicate contest-problem assignment rejected: primary key prevents assigning same problem twice', async () => {
    const contestId = createdContestIds[0];
    let threw = false;

    try {
      await db.insert(contestProblems).values({
        contestId,
        problemId: problemAId,
        problemOrder: 4,
      });
    } catch (err: any) {
      threw = true;
      expect(getPgErrorCode(err)).toBe('23505'); // unique_violation
    }

    expect(threw).toBe(true);
  });

  // 6. Duplicate participant registration rejected
  it('6. Duplicate participant registration rejected: primary key prevents registering same user twice', async () => {
    const contestId = createdContestIds[0];

    // First registration succeeds
    await db.insert(contestParticipants).values({
      contestId,
      userId: regularUserAId,
    });

    // Duplicate registration fails
    let duplicateRejected = false;
    try {
      await db.insert(contestParticipants).values({
        contestId,
        userId: regularUserAId,
      });
    } catch (err: any) {
      duplicateRejected = true;
      expect(getPgErrorCode(err)).toBe('23505'); // unique_violation
    }

    expect(duplicateRejected).toBe(true);
  });

  // 7. Multiple users registering for the same contest
  it('7. Multiple users registering for the same contest: user A and user B both register successfully', async () => {
    const contestId = createdContestIds[0];

    // User B registration succeeds
    await db.insert(contestParticipants).values({
      contestId,
      userId: regularUserBId,
    });

    const participants = await db
      .select()
      .from(contestParticipants)
      .where(eq(contestParticipants.contestId, contestId));

    expect(participants).toHaveLength(2);
    const participantUserIds = participants.map((p) => p.userId);
    expect(participantUserIds).toContain(regularUserAId);
    expect(participantUserIds).toContain(regularUserBId);
  });

  // 8. One user registering for different contests
  it('8. One user registering for different contests: user A can register for Contest 1 and Contest 2', async () => {
    // Create a second contest
    const [secondContest] = await db
      .insert(contests)
      .values({
        title: `Biweekly Contest ${runTag}`,
        description: 'Second contest for testing user multi-registration',
        startTime: new Date(Date.now() + 86400 * 1000),
        endTime: new Date(Date.now() + 90000 * 1000),
        freezeMinutes: 60,
        createdBy: adminUserId,
      })
      .returning();

    createdContestIds.push(secondContest.id);

    // Register User A for second contest
    await db.insert(contestParticipants).values({
      contestId: secondContest.id,
      userId: regularUserAId,
    });

    const userRegistrations = await db
      .select()
      .from(contestParticipants)
      .where(eq(contestParticipants.userId, regularUserAId));

    expect(userRegistrations.length).toBeGreaterThanOrEqual(2);
    const registeredContestIds = userRegistrations.map((r) => r.contestId);
    expect(registeredContestIds).toContain(createdContestIds[0]);
    expect(registeredContestIds).toContain(secondContest.id);
  });

  // 9. Invalid foreign keys rejected
  it('9. Invalid foreign keys rejected: non-existent creator, contest, or problem is rejected by FK', async () => {
    const nonExistentUuid = '00000000-0000-0000-0000-000000000000';

    // 9a: Non-existent created_by in contests
    let creatorFkFailed = false;
    try {
      await db.insert(contests).values({
        title: `Invalid Creator Contest ${runTag}`,
        startTime: new Date(Date.now() + 1000),
        endTime: new Date(Date.now() + 5000),
        createdBy: nonExistentUuid,
      });
    } catch (err: any) {
      creatorFkFailed = true;
      expect(getPgErrorCode(err)).toBe('23503'); // foreign_key_violation
    }
    expect(creatorFkFailed).toBe(true);

    // 9b: Non-existent contest_id in contest_problems
    let contestProblemFkFailed = false;
    try {
      await db.insert(contestProblems).values({
        contestId: nonExistentUuid,
        problemId: problemAId,
        problemOrder: 1,
      });
    } catch (err: any) {
      contestProblemFkFailed = true;
      expect(getPgErrorCode(err)).toBe('23503'); // foreign_key_violation
    }
    expect(contestProblemFkFailed).toBe(true);

    // 9c: Non-existent problem_id in contest_problems
    let problemFkFailed = false;
    try {
      await db.insert(contestProblems).values({
        contestId: createdContestIds[0],
        problemId: nonExistentUuid,
        problemOrder: 10,
      });
    } catch (err: any) {
      problemFkFailed = true;
      expect(getPgErrorCode(err)).toBe('23503'); // foreign_key_violation
    }
    expect(problemFkFailed).toBe(true);

    // 9d: Non-existent user_id in contest_participants
    let participantFkFailed = false;
    try {
      await db.insert(contestParticipants).values({
        contestId: createdContestIds[0],
        userId: nonExistentUuid,
      });
    } catch (err: any) {
      participantFkFailed = true;
      expect(getPgErrorCode(err)).toBe('23503'); // foreign_key_violation
    }
    expect(participantFkFailed).toBe(true);
  });

  // 10. Invalid date range rejected
  it('10. Invalid date range rejected: start_time >= end_time violates check constraint', async () => {
    const invalidStartTime = new Date(Date.now() + 10000);
    const invalidEndTime = new Date(Date.now() + 5000); // Earlier than start_time

    let dateConstraintFailed = false;
    try {
      await db.insert(contests).values({
        title: `Invalid Dates Contest ${runTag}`,
        startTime: invalidStartTime,
        endTime: invalidEndTime,
        createdBy: adminUserId,
      });
    } catch (err: any) {
      dateConstraintFailed = true;
      expect(getPgErrorCode(err)).toBe('23514'); // check_violation
    }
    expect(dateConstraintFailed).toBe(true);
  });

  // 11. Negative freeze_minutes rejected
  it('11. Negative freeze_minutes rejected: freeze_minutes < 0 violates check constraint', async () => {
    let freezeConstraintFailed = false;
    try {
      await db.insert(contests).values({
        title: `Negative Freeze Contest ${runTag}`,
        startTime: new Date(Date.now() + 1000),
        endTime: new Date(Date.now() + 10000),
        freezeMinutes: -15,
        createdBy: adminUserId,
      });
    } catch (err: any) {
      freezeConstraintFailed = true;
      expect(getPgErrorCode(err)).toBe('23514'); // check_violation
    }
    expect(freezeConstraintFailed).toBe(true);
  });

  // 12. Existing users and problems remain intact after migration
  it('12. Existing users and problems remain intact: queries execute successfully without regressions', async () => {
    // Verify admin user exists and fields are untouched
    const [fetchedAdmin] = await db
      .select({ id: users.id, username: users.username, role: users.role })
      .from(users)
      .where(eq(users.id, adminUserId))
      .limit(1);

    expect(fetchedAdmin).toBeDefined();
    expect(fetchedAdmin.username).toBe(`admin_${runTag}`);
    expect(fetchedAdmin.role).toBe('admin');

    // Verify problems exist and fields are untouched
    const fetchedProblems = await db
      .select({ id: problems.id, title: problems.title, difficulty: problems.difficulty })
      .from(problems)
      .where(inArray(problems.id, [problemAId, problemBId, problemCId]));

    expect(fetchedProblems).toHaveLength(3);
    const titles = fetchedProblems.map((p) => p.title);
    expect(titles).toContain(`Contest Problem A ${runTag}`);
    expect(titles).toContain(`Contest Problem B ${runTag}`);
    expect(titles).toContain(`Contest Problem C ${runTag}`);
  });
});
