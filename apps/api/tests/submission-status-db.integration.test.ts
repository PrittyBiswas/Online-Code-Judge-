import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import dotenv from 'dotenv';
import { resolve } from 'path';
import { randomUUID } from 'node:crypto';
import { db } from '../src/db/index.js';
import { problems, submissions, users } from '../src/db/schema.js';
import { eq } from 'drizzle-orm';
import { ProblemsService } from '../src/modules/problems/problems.service.js';

dotenv.config({ path: resolve(process.cwd(), '.env') });

describe('Submission Verdict & Status Real DB Integration Test', () => {
  const problemsService = new ProblemsService();
  const testUserId = randomUUID();
  const testProblemId1 = randomUUID();
  const testProblemId2 = randomUUID();
  const testProblemId3 = randomUUID();

  beforeAll(async () => {
    // Insert a test user
    await db.insert(users).values({
      id: testUserId,
      username: `test_verdict_${Date.now()}`,
      email: `test_verdict_${Date.now()}@judge.local`,
      passwordHash: 'dummyhash',
      role: 'user',
    });

    // Insert 3 temporary test problems
    await db.insert(problems).values([
      {
        id: testProblemId1,
        title: 'Status Test Problem 1',
        slug: `status-test-p1-${Date.now()}`,
        difficulty: 'easy',
        statement: 'Statement 1',
        timeLimitMs: 1000,
        memoryLimitMb: 256,
        visibility: 'public',
        setterId: testUserId,
      },
      {
        id: testProblemId2,
        title: 'Status Test Problem 2',
        slug: `status-test-p2-${Date.now()}`,
        difficulty: 'medium',
        statement: 'Statement 2',
        timeLimitMs: 1000,
        memoryLimitMb: 256,
        visibility: 'public',
        setterId: testUserId,
      },
      {
        id: testProblemId3,
        title: 'Status Test Problem 3',
        slug: `status-test-p3-${Date.now()}`,
        difficulty: 'hard',
        statement: 'Statement 3',
        timeLimitMs: 1000,
        memoryLimitMb: 256,
        visibility: 'public',
        setterId: testUserId,
      },
    ]);

    // Problem 1: User has an ACCEPTED submission -> should be SOLVED
    await db.insert(submissions).values({
      id: randomUUID(),
      userId: testUserId,
      problemId: testProblemId1,
      code: 'console.log("hello");',
      language: 'javascript',
      status: 'COMPLETED',
      verdict: 'ACCEPTED',
    });

    // Problem 2: User has only WRONG_ANSWER submissions -> should be ATTEMPTED
    await db.insert(submissions).values({
      id: randomUUID(),
      userId: testUserId,
      problemId: testProblemId2,
      code: 'console.log("wrong");',
      language: 'javascript',
      status: 'COMPLETED',
      verdict: 'WRONG_ANSWER',
    });

    // Problem 3: User has NO submissions -> should be UNATTEMPTED
  });

  afterAll(async () => {
    // Teardown test rows
    await db.delete(submissions).where(eq(submissions.userId, testUserId));
    await db.delete(problems).where(eq(problems.id, testProblemId1));
    await db.delete(problems).where(eq(problems.id, testProblemId2));
    await db.delete(problems).where(eq(problems.id, testProblemId3));
    await db.delete(users).where(eq(users.id, testUserId));
  });

  it('correctly calculates SOLVED, ATTEMPTED, and UNATTEMPTED against real PostgreSQL records', async () => {
    const p1 = await problemsService.getProblem(testProblemId1, {
      id: testUserId,
      role: 'user' as any,
    });
    const p2 = await problemsService.getProblem(testProblemId2, {
      id: testUserId,
      role: 'user' as any,
    });
    const p3 = await problemsService.getProblem(testProblemId3, {
      id: testUserId,
      role: 'user' as any,
    });

    expect(p1.submissionStatus).toBe('SOLVED');
    expect(p2.submissionStatus).toBe('ATTEMPTED');
    expect(p3.submissionStatus).toBe('UNATTEMPTED');
  });

  it('unauthenticated users get UNATTEMPTED status for all problems', async () => {
    const p1 = await problemsService.getProblem(testProblemId1);
    expect(p1.submissionStatus).toBe('UNATTEMPTED');
  });
});
