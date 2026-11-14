import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Server } from 'http';
import crypto from 'crypto';
import { inArray, eq } from 'drizzle-orm';
import { ERROR_CODES, Role, ProblemVisibility, Verdict, REDIS_KEYS } from '@judge/shared';
import { app } from '../src/app.js';
import { db, checkDatabaseConnection, closeDatabase } from '../src/db/index.js';
import {
  users,
  problems,
  contests,
  contestProblems,
  contestParticipants,
  submissions,
} from '../src/db/schema.js';
import { signAuthToken } from '../src/middleware/auth.js';
import { env } from '../src/config/env.js';
import { redisClient } from '../src/config/redis.js';
import { assertProblemAccess } from '../src/modules/problems/problems.service.js';
import { contestsService } from '../src/modules/contests/contests.service.js';
import { leaderboardService } from '../src/modules/leaderboard/leaderboard.service.js';

let server: Server;
let baseUrl: string;

async function dispatchHttp(
  method: string,
  url: string,
  options: { body?: unknown; headers?: Record<string, string>; cookie?: string } = {}
): Promise<{ status: number; body: any }> {
  const headers: Record<string, string> = {
    ...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    ...(options.cookie ? { Cookie: options.cookie } : {}),
    ...(options.headers || {}),
  };

  const res = await fetch(`${baseUrl}${url}`, {
    method,
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  const text = await res.text();
  let parsed: any = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = text;
  }

  return {
    status: res.status,
    body: parsed,
  };
}

describe('Day 18 Problem Visibility & Contest Freeze Integration Tests', () => {
  const runTag = `${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
  const createdUserIds: string[] = [];
  const createdProblemIds: string[] = [];
  const createdContestIds: string[] = [];
  const createdSubmissionIds: string[] = [];

  let adminUser: { id: string; username: string; email: string; role: Role };
  let setterUser: { id: string; username: string; email: string; role: Role };
  let creatorUser: { id: string; username: string; email: string; role: Role };
  let regularUser: { id: string; username: string; email: string; role: Role };

  let adminCookie: string;
  let setterCookie: string;
  let creatorCookie: string;
  let regularCookie: string;

  // Problems
  let publicProblemId: string;
  let futureContestProblemId: string;
  let futureContestProblemSlug: string;
  let startedContestProblemId: string;
  let multiContestProblemId: string;
  let unlinkedContestProblemId: string;

  // Contests
  let futureContestId: string;
  let startedContestId: string;
  let multiContestAId: string;
  let multiContestBId: string;

  beforeAll(async () => {
    const isHealthy = await checkDatabaseConnection();
    if (!isHealthy) {
      throw new Error('Database connection failed before running visibility tests.');
    }

    if (redisClient.status === 'wait') {
      await redisClient.connect().catch(() => {});
    }

    await new Promise<void>((resolve) => {
      server = app.listen(0, '127.0.0.1', () => {
        const addr = server.address() as { port: number };
        baseUrl = `http://127.0.0.1:${addr.port}`;
        resolve();
      });
    });

    // 1. Create test users
    const [admin] = await db
      .insert(users)
      .values({
        username: `vis_adm_${runTag}`,
        email: `vis_adm_${runTag}@test.local`,
        passwordHash: '$2b$10$invaliddummyhashforvisruntestsonly',
        role: Role.ADMIN,
      })
      .returning();
    adminUser = admin;
    createdUserIds.push(admin.id);

    const [setter] = await db
      .insert(users)
      .values({
        username: `vis_set_${runTag}`,
        email: `vis_set_${runTag}@test.local`,
        passwordHash: '$2b$10$invaliddummyhashforvisruntestsonly',
        role: Role.PROBLEM_SETTER,
      })
      .returning();
    setterUser = setter;
    createdUserIds.push(setter.id);

    const [creator] = await db
      .insert(users)
      .values({
        username: `vis_crt_${runTag}`,
        email: `vis_crt_${runTag}@test.local`,
        passwordHash: '$2b$10$invaliddummyhashforvisruntestsonly',
        role: Role.PROBLEM_SETTER,
      })
      .returning();
    creatorUser = creator;
    createdUserIds.push(creator.id);

    const [regular] = await db
      .insert(users)
      .values({
        username: `vis_reg_${runTag}`,
        email: `vis_reg_${runTag}@test.local`,
        passwordHash: '$2b$10$invaliddummyhashforvisruntestsonly',
        role: Role.USER,
      })
      .returning();
    regularUser = regular;
    createdUserIds.push(regular.id);

    adminCookie = `${env.AUTH_COOKIE_NAME}=${signAuthToken({ id: admin.id, role: admin.role, username: admin.username })}`;
    setterCookie = `${env.AUTH_COOKIE_NAME}=${signAuthToken({ id: setter.id, role: setter.role, username: setter.username })}`;
    creatorCookie = `${env.AUTH_COOKIE_NAME}=${signAuthToken({ id: creator.id, role: creator.role, username: creator.username })}`;
    regularCookie = `${env.AUTH_COOKIE_NAME}=${signAuthToken({ id: regular.id, role: regular.role, username: regular.username })}`;

    // 2. Create problems
    // Public problem
    const [pubProb] = await db
      .insert(problems)
      .values({
        title: `Public Searchable ${runTag}`,
        slug: `public-searchable-${runTag}`,
        statement: 'This is a public statement available to everyone.',
        difficulty: 'easy',
        tags: ['math', 'public'],
        sampleInput: '1 2',
        sampleExpectedOutput: '3',
        visibility: ProblemVisibility.PUBLIC,
        setterId: setterUser.id,
      })
      .returning();
    publicProblemId = pubProb.id;
    createdProblemIds.push(pubProb.id);

    // Contest-only problem linked to upcoming contest
    const [futureProb] = await db
      .insert(problems)
      .values({
        title: `Secret Contest Problem ${runTag}`,
        slug: `secret-contest-${runTag}`,
        statement: 'Top secret contest problem statement.',
        difficulty: 'hard',
        tags: ['dp', 'secret'],
        sampleInput: '10',
        sampleExpectedOutput: '55',
        visibility: ProblemVisibility.CONTEST_ONLY,
        setterId: setterUser.id,
      })
      .returning();
    futureContestProblemId = futureProb.id;
    futureContestProblemSlug = futureProb.slug;
    createdProblemIds.push(futureProb.id);

    // Contest-only problem linked to started contest
    const [startedProb] = await db
      .insert(problems)
      .values({
        title: `Released Contest Problem ${runTag}`,
        slug: `released-contest-${runTag}`,
        statement: 'Released contest problem statement.',
        difficulty: 'medium',
        tags: ['graphs'],
        sampleInput: '4 4',
        sampleExpectedOutput: 'YES',
        visibility: ProblemVisibility.CONTEST_ONLY,
        setterId: setterUser.id,
      })
      .returning();
    startedContestProblemId = startedProb.id;
    createdProblemIds.push(startedProb.id);

    // Contest-only problem linked to multiple contests
    const [multiProb] = await db
      .insert(problems)
      .values({
        title: `Multi Contest Problem ${runTag}`,
        slug: `multi-contest-${runTag}`,
        statement: 'Multi contest problem statement.',
        difficulty: 'medium',
        tags: ['strings'],
        sampleInput: 'abc',
        sampleExpectedOutput: 'cba',
        visibility: ProblemVisibility.CONTEST_ONLY,
        setterId: setterUser.id,
      })
      .returning();
    multiContestProblemId = multiProb.id;
    createdProblemIds.push(multiProb.id);

    // Unlinked contest-only problem
    const [unlinkedProb] = await db
      .insert(problems)
      .values({
        title: `Draft Unlinked Problem ${runTag}`,
        slug: `draft-unlinked-${runTag}`,
        statement: 'Draft problem not yet assigned to any contest.',
        difficulty: 'easy',
        tags: ['draft'],
        sampleInput: '0',
        sampleExpectedOutput: '0',
        visibility: ProblemVisibility.CONTEST_ONLY,
        setterId: setterUser.id,
      })
      .returning();
    unlinkedContestProblemId = unlinkedProb.id;
    createdProblemIds.push(unlinkedProb.id);

    // 3. Create contests
    // Future contest (starts tomorrow)
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const dayAfter = new Date(Date.now() + 48 * 60 * 60 * 1000);
    const [fContest] = await db
      .insert(contests)
      .values({
        title: `Future Contest ${runTag}`,
        description: 'Upcoming contest',
        startTime: tomorrow,
        endTime: dayAfter,
        freezeMinutes: 30,
        createdBy: creatorUser.id,
      })
      .returning();
    futureContestId = fContest.id;
    createdContestIds.push(fContest.id);

    await db.insert(contestProblems).values({
      contestId: futureContestId,
      problemId: futureContestProblemId,
      problemOrder: 1,
    });

    // Started contest (started 1 hour ago, ends in 1 hour)
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const oneHourLater = new Date(Date.now() + 60 * 60 * 1000);
    const [sContest] = await db
      .insert(contests)
      .values({
        title: `Started Contest ${runTag}`,
        description: 'Currently running contest',
        startTime: oneHourAgo,
        endTime: oneHourLater,
        freezeMinutes: 30,
        createdBy: creatorUser.id,
      })
      .returning();
    startedContestId = sContest.id;
    createdContestIds.push(sContest.id);

    await db.insert(contestProblems).values({
      contestId: startedContestId,
      problemId: startedContestProblemId,
      problemOrder: 1,
    });

    // Multi-contest association: Multi Contest A (future), Multi Contest B (started)
    const [mAContest] = await db
      .insert(contests)
      .values({
        title: `Multi Contest A ${runTag}`,
        description: 'Starts in future',
        startTime: tomorrow,
        endTime: dayAfter,
        freezeMinutes: 30,
        createdBy: creatorUser.id,
      })
      .returning();
    multiContestAId = mAContest.id;
    createdContestIds.push(mAContest.id);

    const [mBContest] = await db
      .insert(contests)
      .values({
        title: `Multi Contest B ${runTag}`,
        description: 'Started in past',
        startTime: oneHourAgo,
        endTime: oneHourLater,
        freezeMinutes: 30,
        createdBy: creatorUser.id,
      })
      .returning();
    multiContestBId = mBContest.id;
    createdContestIds.push(mBContest.id);

    await db.insert(contestProblems).values([
      { contestId: multiContestAId, problemId: multiContestProblemId, problemOrder: 1 },
      { contestId: multiContestBId, problemId: multiContestProblemId, problemOrder: 1 },
    ]);
  });

  afterAll(async () => {
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
    // Cleanup records in reverse dependency order
    if (createdSubmissionIds.length > 0) {
      await db.delete(submissions).where(inArray(submissions.id, createdSubmissionIds));
    }
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
    if (redisClient.status === 'ready') {
      await redisClient.quit().catch(() => {});
    }
    await closeDatabase().catch(() => {});
  });

  // ==========================================
  // PHASE 5: REGRESSION & ACCESS CONTROL TESTS
  // ==========================================

  it('1. Existing public problems remain accessible anonymously and to authenticated users', async () => {
    // Anonymous
    const anonRes = await dispatchHttp('GET', `/api/problems/${publicProblemId}`);
    expect(anonRes.status).toBe(200);
    expect(anonRes.body.data.problem.id).toBe(publicProblemId);
    expect(anonRes.body.data.problem.visibility).toBe(ProblemVisibility.PUBLIC);

    // Regular authenticated user
    const userRes = await dispatchHttp('GET', `/api/problems/${publicProblemId}`, {
      cookie: regularCookie,
    });
    expect(userRes.status).toBe(200);
    expect(userRes.body.data.problem.id).toBe(publicProblemId);
  });

  it('2. Existing public problem search and listing still works', async () => {
    const res = await dispatchHttp('GET', `/api/problems?search=${encodeURIComponent(runTag)}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data.items)).toBe(true);
    const ids = res.body.data.items.map((p: any) => p.id);
    expect(ids).toContain(publicProblemId);
  });

  it('3. Contest-only problem does NOT appear in public catalog listing or search', async () => {
    const res = await dispatchHttp('GET', `/api/problems?limit=50`);
    expect(res.status).toBe(200);
    const ids = res.body.data.items.map((p: any) => p.id);

    expect(ids).not.toContain(futureContestProblemId);
    expect(ids).not.toContain(startedContestProblemId);
    expect(ids).not.toContain(multiContestProblemId);
    expect(ids).not.toContain(unlinkedContestProblemId);

    // Also verify via search query
    const searchRes = await dispatchHttp('GET', `/api/problems?search=Secret`);
    expect(searchRes.status).toBe(200);
    const searchIds = searchRes.body.data.items.map((p: any) => p.id);
    expect(searchIds).not.toContain(futureContestProblemId);
  });

  it('4. Contest-only problem detail is denied before contest start (403 CONTEST_NOT_STARTED)', async () => {
    // Anonymous request
    const anonRes = await dispatchHttp('GET', `/api/problems/${futureContestProblemId}`);
    expect(anonRes.status).toBe(403);
    expect(anonRes.body.code).toBe(ERROR_CODES.CONTEST_NOT_STARTED);

    // Regular user request
    const regRes = await dispatchHttp('GET', `/api/problems/${futureContestProblemId}`, {
      cookie: regularCookie,
    });
    expect(regRes.status).toBe(403);
    expect(regRes.body.code).toBe(ERROR_CODES.CONTEST_NOT_STARTED);
  });

  it('5. Contest-only problem cannot be retrieved using its known ID or slug before release', async () => {
    // By ID
    const idRes = await dispatchHttp('GET', `/api/problems/${futureContestProblemId}`, {
      cookie: regularCookie,
    });
    expect(idRes.status).toBe(403);
    expect(idRes.body.code).toBe(ERROR_CODES.CONTEST_NOT_STARTED);

    // By Slug
    const slugRes = await dispatchHttp('GET', `/api/problems/${futureContestProblemSlug}`, {
      cookie: regularCookie,
    });
    expect(slugRes.status).toBe(403);
    expect(slugRes.body.code).toBe(ERROR_CODES.CONTEST_NOT_STARTED);
  });

  it('6. Contest problem endpoint denies ordinary users before start (403 CONTEST_NOT_STARTED)', async () => {
    const res = await dispatchHttp('GET', `/api/contests/${futureContestId}/problems`, {
      cookie: regularCookie,
    });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe(ERROR_CODES.CONTEST_NOT_STARTED);
  });

  it('7. Administrator can access contest problem and contest endpoint before start', async () => {
    // Detail endpoint by ID
    const probRes = await dispatchHttp('GET', `/api/problems/${futureContestProblemId}`, {
      cookie: adminCookie,
    });
    expect(probRes.status).toBe(200);
    expect(probRes.body.data.problem.id).toBe(futureContestProblemId);
    expect(probRes.body.data.problem.statement).toBe('Top secret contest problem statement.');

    // Contest problems endpoint
    const contestRes = await dispatchHttp('GET', `/api/contests/${futureContestId}/problems`, {
      cookie: adminCookie,
    });
    expect(contestRes.status).toBe(200);
    expect(contestRes.body.data.problems.length).toBe(1);
    expect(contestRes.body.data.problems[0].id).toBe(futureContestProblemId);
  });

  it('8. Contest creator and problem setter can access according to policy before start', async () => {
    // Contest creator on contest problems endpoint
    const creatorRes = await dispatchHttp('GET', `/api/contests/${futureContestId}/problems`, {
      cookie: creatorCookie,
    });
    expect(creatorRes.status).toBe(200);
    expect(creatorRes.body.data.problems.length).toBe(1);

    // Contest creator on problem detail endpoint
    const creatorProbRes = await dispatchHttp('GET', `/api/problems/${futureContestProblemId}`, {
      cookie: creatorCookie,
    });
    expect(creatorProbRes.status).toBe(200);
    expect(creatorProbRes.body.data.problem.id).toBe(futureContestProblemId);

    // Problem setter on problem detail endpoint
    const setterRes = await dispatchHttp('GET', `/api/problems/${futureContestProblemId}`, {
      cookie: setterCookie,
    });
    expect(setterRes.status).toBe(200);
    expect(setterRes.body.data.problem.id).toBe(futureContestProblemId);
  });

  it('9. Contest-only problem becomes accessible with valid contest context after contest starts', async () => {
    // Direct lookup without contest context is denied (fail-closed, requires contest context)
    const noContextRes = await dispatchHttp('GET', `/api/problems/${startedContestProblemId}`, {
      cookie: regularCookie,
    });
    expect(noContextRes.status).toBe(403);
    expect(noContextRes.body.code).toBe(ERROR_CODES.CONTEST_NOT_STARTED);

    // Direct lookup WITH valid started contest context succeeds (HTTP 200)
    const withContextRes = await dispatchHttp(
      'GET',
      `/api/problems/${startedContestProblemId}?contestId=${startedContestId}`,
      {
        cookie: regularCookie,
      }
    );
    expect(withContextRes.status).toBe(200);
    expect(withContextRes.body.data.problem.id).toBe(startedContestProblemId);
    expect(withContextRes.body.data.problem.statement).toBe('Released contest problem statement.');

    // Also accessible via contest problems endpoint
    const contestRes = await dispatchHttp('GET', `/api/contests/${startedContestId}/problems`, {
      cookie: regularCookie,
    });
    expect(contestRes.status).toBe(200);
    expect(contestRes.body.data.problems.some((p: any) => p.id === startedContestProblemId)).toBe(
      true
    );
  });

  it('10. Direct submission cannot bypass access control for unstarted contest problem', async () => {
    await redisClient.del(REDIS_KEYS.SUBMISSION_RATE(regularUser.id));

    // Attempt submission against unstarted contest problem without contestId
    const deniedRes = await dispatchHttp('POST', '/api/submissions', {
      cookie: regularCookie,
      body: {
        problemId: futureContestProblemId,
        code: 'console.log("bypass attempt 1");',
        language: 'javascript',
      },
    });
    expect(deniedRes.status).toBe(403);
    expect(deniedRes.body.code).toBe(ERROR_CODES.CONTEST_NOT_STARTED);

    await redisClient.del(REDIS_KEYS.SUBMISSION_RATE(regularUser.id));

    // Attempt submission against unstarted contest problem WITH unstarted contestId
    const deniedWithContextRes = await dispatchHttp('POST', '/api/submissions', {
      cookie: regularCookie,
      body: {
        problemId: futureContestProblemId,
        contestId: futureContestId,
        code: 'console.log("bypass attempt 2");',
        language: 'javascript',
      },
    });
    expect(deniedWithContextRes.status).toBe(403);
    expect(deniedWithContextRes.body.code).toBe(ERROR_CODES.CONTEST_NOT_STARTED);

    await redisClient.del(REDIS_KEYS.SUBMISSION_RATE(regularUser.id));

    // Submission against released problem with started contestId succeeds (HTTP 202)
    const allowedRes = await dispatchHttp('POST', '/api/submissions', {
      cookie: regularCookie,
      body: {
        problemId: startedContestProblemId,
        contestId: startedContestId,
        code: 'console.log("legitimate submission 3");',
        language: 'javascript',
      },
    });
    expect(allowedRes.status).toBe(202);
    expect(allowedRes.body.data.id).toBeDefined();
    createdSubmissionIds.push(allowedRes.body.data.id);
  });

  it('11. Sample-run cannot bypass access control for unstarted contest problem', async () => {
    // Attempt sample run against unstarted contest problem
    const deniedRes = await dispatchHttp('POST', '/api/submissions/run-sample', {
      cookie: regularCookie,
      body: {
        problemId: futureContestProblemId,
        code: 'console.log("sample bypass attempt");',
        language: 'javascript',
      },
    });
    expect(deniedRes.status).toBe(403);
    expect(deniedRes.body.code).toBe(ERROR_CODES.CONTEST_NOT_STARTED);

    // Sample run with valid started contestId succeeds (HTTP 202)
    const allowedRes = await dispatchHttp('POST', '/api/submissions/run-sample', {
      cookie: regularCookie,
      body: {
        problemId: startedContestProblemId,
        contestId: startedContestId,
        code: 'console.log("valid sample run");',
        language: 'javascript',
      },
    });
    expect(allowedRes.status).toBe(202);
    expect(allowedRes.body.data.runId).toBeDefined();
  });

  it('12. Hidden test cases remain inaccessible across all endpoints', async () => {
    const detailRes = await dispatchHttp('GET', `/api/problems/${publicProblemId}`);
    expect(detailRes.status).toBe(200);
    const prob = detailRes.body.data.problem;
    expect(prob.testCases).toBeUndefined();
    expect(prob.inputKey).toBeUndefined();
    expect(prob.expectedOutputKey).toBeUndefined();
    expect(prob.testCasesUrl).toBeUndefined();

    const contestRes = await dispatchHttp('GET', `/api/contests/${startedContestId}/problems`, {
      cookie: regularCookie,
    });
    expect(contestRes.status).toBe(200);
    for (const p of contestRes.body.data.problems) {
      expect(p.testCases).toBeUndefined();
      expect(p.inputKey).toBeUndefined();
      expect(p.expectedOutputKey).toBeUndefined();
    }
  });

  it('13. Problems associated with multiple contests enforce strict contest-context policy', async () => {
    // multiContestProblemId is linked to Multi Contest A (future) and Multi Contest B (started)
    // 1. Without contestId: regular user is DENIED (does NOT globally leak merely because Contest B started!)
    const noContextRes = await dispatchHttp('GET', `/api/problems/${multiContestProblemId}`, {
      cookie: regularCookie,
    });
    expect(noContextRes.status).toBe(403);
    expect(noContextRes.body.code).toBe(ERROR_CODES.CONTEST_NOT_STARTED);

    // 2. With Contest A (future contest): DENIED (403)
    const contestARes = await dispatchHttp(
      'GET',
      `/api/problems/${multiContestProblemId}?contestId=${multiContestAId}`,
      { cookie: regularCookie }
    );
    expect(contestARes.status).toBe(403);
    expect(contestARes.body.code).toBe(ERROR_CODES.CONTEST_NOT_STARTED);

    // 3. With Contest B (started contest): ALLOWED (200)
    const contestBRes = await dispatchHttp(
      'GET',
      `/api/problems/${multiContestProblemId}?contestId=${multiContestBId}`,
      { cookie: regularCookie }
    );
    expect(contestBRes.status).toBe(200);
    expect(contestBRes.body.data.problem.id).toBe(multiContestProblemId);

    // 4. With an unrelated contest ID (not containing problem): DENIED (403)
    const unrelatedContestRes = await dispatchHttp(
      'GET',
      `/api/problems/${multiContestProblemId}?contestId=${startedContestId}`,
      { cookie: regularCookie }
    );
    expect(unrelatedContestRes.status).toBe(403);
    expect(unrelatedContestRes.body.code).toBe(ERROR_CODES.CONTEST_NOT_STARTED);

    // 5. Submission with Contest A (future) -> DENIED (403)
    await redisClient.del(REDIS_KEYS.SUBMISSION_RATE(regularUser.id));

    const subDeniedRes = await dispatchHttp('POST', '/api/submissions', {
      cookie: regularCookie,
      body: {
        problemId: multiContestProblemId,
        contestId: multiContestAId,
        code: 'console.log("multi contest test 1");',
        language: 'javascript',
      },
    });
    expect(subDeniedRes.status).toBe(403);

    // 6. Submission with Contest B (started) -> ALLOWED (202)
    await redisClient.del(REDIS_KEYS.SUBMISSION_RATE(regularUser.id));

    const subAllowedRes = await dispatchHttp('POST', '/api/submissions', {
      cookie: regularCookie,
      body: {
        problemId: multiContestProblemId,
        contestId: multiContestBId,
        code: 'console.log("multi contest test 2");',
        language: 'javascript',
      },
    });
    expect(subAllowedRes.status).toBe(202);
    createdSubmissionIds.push(subAllowedRes.body.data.id);

    // 7. Authoring permissions: Contest creator and Admin can view without contest context
    const creatorViewRes = await dispatchHttp('GET', `/api/problems/${multiContestProblemId}`, {
      cookie: creatorCookie,
    });
    expect(creatorViewRes.status).toBe(200);

    const adminViewRes = await dispatchHttp('GET', `/api/problems/${multiContestProblemId}`, {
      cookie: adminCookie,
    });
    expect(adminViewRes.status).toBe(200);
  });

  it('14. Unlinked contest-only problem is inaccessible to regular users and accessible to setter/admin', async () => {
    // Regular user denied
    const regRes = await dispatchHttp('GET', `/api/problems/${unlinkedContestProblemId}`, {
      cookie: regularCookie,
    });
    expect(regRes.status).toBe(403);

    // Problem setter allowed
    const setterRes = await dispatchHttp('GET', `/api/problems/${unlinkedContestProblemId}`, {
      cookie: setterCookie,
    });
    expect(setterRes.status).toBe(200);
    expect(setterRes.body.data.problem.id).toBe(unlinkedContestProblemId);

    // Admin allowed
    const adminRes = await dispatchHttp('GET', `/api/problems/${unlinkedContestProblemId}`, {
      cookie: adminCookie,
    });
    expect(adminRes.status).toBe(200);
    expect(adminRes.body.data.problem.id).toBe(unlinkedContestProblemId);
  });

  // ==========================================
  // FAIL-CLOSED VISIBILITY AUTHORIZATION TESTS
  // ==========================================

  describe('Fail-Closed Visibility Authorization Tests', () => {
    it('Rejects missing or null visibility with 500 without exposing content', async () => {
      await expect(
        assertProblemAccess({
          id: publicProblemId,
          visibility: undefined as any,
          isArchived: false,
        })
      ).rejects.toThrow('Invalid problem visibility configuration');

      await expect(
        assertProblemAccess({
          id: publicProblemId,
          visibility: null as any,
          isArchived: false,
        })
      ).rejects.toThrow('Invalid problem visibility configuration');
    });

    it('Rejects unknown/unexpected visibility values safely', async () => {
      await expect(
        assertProblemAccess({
          id: publicProblemId,
          visibility: 'hidden' as any,
          isArchived: false,
        })
      ).rejects.toThrow('Invalid problem visibility configuration');

      await expect(
        assertProblemAccess({
          id: publicProblemId,
          visibility: 'secret' as any,
          isArchived: false,
        })
      ).rejects.toThrow('Invalid problem visibility configuration');
    });

    it('Archived check takes precedence and returns 404', async () => {
      await expect(
        assertProblemAccess({
          id: publicProblemId,
          visibility: ProblemVisibility.PUBLIC,
          isArchived: true,
        })
      ).rejects.toThrow('Problem not found');

      // Even if visibility is invalid, archived returns 404
      await expect(
        assertProblemAccess({
          id: publicProblemId,
          visibility: 'corrupt' as any,
          isArchived: true,
        })
      ).rejects.toThrow('Problem not found');
    });

    it('PostgreSQL CHECK constraint enforces valid visibility at database level', async () => {
      let threwDbError = false;
      try {
        await db.insert(problems).values({
          title: `DB Check Test ${runTag}`,
          slug: `db-check-${runTag}`,
          statement: 'Constraint check test',
          difficulty: 'easy',
          visibility: 'invalid_vis' as any,
          setterId: setterUser.id,
        });
      } catch (err: any) {
        threwDbError = true;
        // PostgreSQL check constraint violation code 23514
        const isCheckViolation =
          err?.code === '23514' ||
          err?.cause?.code === '23514' ||
          String(err?.message).includes('chk_problems_visibility') ||
          String(err?.cause?.message).includes('chk_problems_visibility');
        expect(isCheckViolation).toBe(true);
      }
      expect(threwDbError).toBe(true);
    });
  });

  // ==========================================
  // POST-CONTEST RELEASE & VISIBILITY UPDATE
  // ==========================================

  describe('Post-Contest Visibility Management & Cache Safety', () => {
    it('Ordinary participant cannot update problem visibility (403 FORBIDDEN)', async () => {
      const res = await dispatchHttp('PUT', `/api/problems/${futureContestProblemId}`, {
        cookie: regularCookie,
        body: { visibility: ProblemVisibility.PUBLIC },
      });
      expect(res.status).toBe(403);
    });

    it('Unauthorized problem setter cannot update another setter problem (403 FORBIDDEN)', async () => {
      // Create a second problem setter
      const [otherSetter] = await db
        .insert(users)
        .values({
          username: `other_setter_${runTag}`,
          email: `other_setter_${runTag}@test.local`,
          passwordHash: '$2b$10$dummyhashvalue',
          role: Role.PROBLEM_SETTER,
        })
        .returning();
      createdUserIds.push(otherSetter.id);
      const otherCookie = `${env.AUTH_COOKIE_NAME}=${signAuthToken({ id: otherSetter.id, role: otherSetter.role as Role, username: otherSetter.username })}`;

      // Attempt update on setterUser's problem
      const res = await dispatchHttp('PUT', `/api/problems/${futureContestProblemId}`, {
        cookie: otherCookie,
        body: { visibility: ProblemVisibility.PUBLIC },
      });
      expect(res.status).toBe(403);
    });

    it('Authorized problem setter or admin can change visibility to public, invalidating caches correctly', async () => {
      // 1. Initially contest_only problem is not in public catalog
      const listBefore = await dispatchHttp('GET', `/api/problems?limit=50`);
      const idsBefore = listBefore.body.data.items.map((p: any) => p.id);
      expect(idsBefore).not.toContain(futureContestProblemId);

      // 2. Setter updates visibility to 'public'
      const updateRes = await dispatchHttp('PUT', `/api/problems/${futureContestProblemId}`, {
        cookie: setterCookie,
        body: { visibility: ProblemVisibility.PUBLIC },
      });
      expect(updateRes.status).toBe(200);
      expect(updateRes.body.data.problem.visibility).toBe(ProblemVisibility.PUBLIC);

      // 3. Immediately visible in public problem listing
      const listAfter = await dispatchHttp('GET', `/api/problems?limit=50`);
      const idsAfter = listAfter.body.data.items.map((p: any) => p.id);
      expect(idsAfter).toContain(futureContestProblemId);

      // 4. Directly readable anonymously without contestId
      const detailAnon = await dispatchHttp('GET', `/api/problems/${futureContestProblemId}`);
      expect(detailAnon.status).toBe(200);
      expect(detailAnon.body.data.problem.id).toBe(futureContestProblemId);

      // 5. Revert back to contest_only for remaining tests
      const revertRes = await dispatchHttp('PUT', `/api/problems/${futureContestProblemId}`, {
        cookie: setterCookie,
        body: { visibility: ProblemVisibility.CONTEST_ONLY },
      });
      expect(revertRes.status).toBe(200);

      // 6. Direct anonymous access is immediately denied again (no stale Redis entry)
      const detailAnonAfter = await dispatchHttp('GET', `/api/problems/${futureContestProblemId}`);
      expect(detailAnonAfter.status).toBe(403);
    });
  });

  // ==========================================
  // PHASE 6: CONTEST LEADERBOARD FREEZE AUDIT
  // ==========================================

  describe('Contest Leaderboard Freeze Boundary Tests', () => {
    let freezeContestId: string;
    let freezeProblemId: string;
    let contestStartTime: Date;
    let contestEndTime: Date;

    let userA: { id: string; username: string };
    let userB: { id: string; username: string };
    let userC: { id: string; username: string };
    let userD: { id: string; username: string };
    let userE: { id: string; username: string };
    let userF: { id: string; username: string };

    beforeAll(async () => {
      // Contest timeline:
      // startTime = T0 (e.g. 10:00:00.000)
      // endTime = T0 + 120 minutes (12:00:00.000)
      // freezeMinutes = 30 -> freezeStartTime = 11:30:00.000
      contestStartTime = new Date('2026-11-14T10:00:00.000Z');
      contestEndTime = new Date('2026-11-14T12:00:00.000Z');

      const [fc] = await db
        .insert(contests)
        .values({
          title: `Freeze Audit Contest ${runTag}`,
          description: 'Testing freeze boundary precision',
          startTime: contestStartTime,
          endTime: contestEndTime,
          freezeMinutes: 30,
          createdBy: adminUser.id,
        })
        .returning();
      freezeContestId = fc.id;
      createdContestIds.push(fc.id);

      const [fp] = await db
        .insert(problems)
        .values({
          title: `Freeze Problem ${runTag}`,
          slug: `freeze-prob-${runTag}`,
          statement: 'Solve this for freeze test',
          difficulty: 'medium',
          visibility: ProblemVisibility.CONTEST_ONLY,
          setterId: setterUser.id,
        })
        .returning();
      freezeProblemId = fp.id;
      createdProblemIds.push(fp.id);

      await db.insert(contestProblems).values({
        contestId: freezeContestId,
        problemId: freezeProblemId,
        problemOrder: 1,
      });

      // Create 6 participants
      const makeUser = async (name: string) => {
        const [u] = await db
          .insert(users)
          .values({
            username: `frz_${name}_${runTag}`,
            email: `frz_${name}_${runTag}@test.local`,
            passwordHash: '$2b$10$dummyhashvalue',
            role: Role.USER,
          })
          .returning();
        createdUserIds.push(u.id);
        await db.insert(contestParticipants).values({
          contestId: freezeContestId,
          userId: u.id,
        });
        return u;
      };

      userA = await makeUser('userA');
      userB = await makeUser('userB');
      userC = await makeUser('userC');
      userD = await makeUser('userD');
      userE = await makeUser('userE');
      userF = await makeUser('userF');

      // Submissions:
      // Sub 1: 10:30 (before freeze)
      const [s1] = await db
        .insert(submissions)
        .values({
          problemId: freezeProblemId,
          contestId: freezeContestId,
          userId: userA.id,
          code: 'pass',
          language: 'javascript',
          status: 'COMPLETED',
          verdict: Verdict.ACCEPTED,
          createdAt: new Date('2026-11-14T10:30:00.000Z'),
        })
        .returning();
      createdSubmissionIds.push(s1.id);

      // Sub 2: 11:30:00.000Z (EXACT freeze boundary)
      const [s2] = await db
        .insert(submissions)
        .values({
          problemId: freezeProblemId,
          contestId: freezeContestId,
          userId: userB.id,
          code: 'pass',
          language: 'javascript',
          status: 'COMPLETED',
          verdict: Verdict.ACCEPTED,
          createdAt: new Date('2026-11-14T11:30:00.000Z'),
        })
        .returning();
      createdSubmissionIds.push(s2.id);

      // Sub 3: 11:30:00.001Z (IMMEDIATELY AFTER freeze boundary by 1ms)
      const [s3] = await db
        .insert(submissions)
        .values({
          problemId: freezeProblemId,
          contestId: freezeContestId,
          userId: userC.id,
          code: 'pass',
          language: 'javascript',
          status: 'COMPLETED',
          verdict: Verdict.ACCEPTED,
          createdAt: new Date('2026-11-14T11:30:00.001Z'),
        })
        .returning();
      createdSubmissionIds.push(s3.id);

      // Sub 4: 11:45:00.000Z (during freeze)
      const [s4] = await db
        .insert(submissions)
        .values({
          problemId: freezeProblemId,
          contestId: freezeContestId,
          userId: userD.id,
          code: 'pass',
          language: 'javascript',
          status: 'COMPLETED',
          verdict: Verdict.ACCEPTED,
          createdAt: new Date('2026-11-14T11:45:00.000Z'),
        })
        .returning();
      createdSubmissionIds.push(s4.id);

      // Sub 5: 12:00:00.000Z (EXACT contest endTime)
      const [s5] = await db
        .insert(submissions)
        .values({
          problemId: freezeProblemId,
          contestId: freezeContestId,
          userId: userE.id,
          code: 'pass',
          language: 'javascript',
          status: 'COMPLETED',
          verdict: Verdict.ACCEPTED,
          createdAt: new Date('2026-11-14T12:00:00.000Z'),
        })
        .returning();
      createdSubmissionIds.push(s5.id);

      // Sub 6: 12:00:01.000Z (AFTER contest endTime)
      const [s6] = await db
        .insert(submissions)
        .values({
          problemId: freezeProblemId,
          contestId: freezeContestId,
          userId: userF.id,
          code: 'pass',
          language: 'javascript',
          status: 'COMPLETED',
          verdict: Verdict.ACCEPTED,
          createdAt: new Date('2026-11-14T12:00:01.000Z'),
        })
        .returning();
      createdSubmissionIds.push(s6.id);
    });

    it('Case 1: Before freeze starts, public view includes solves up to query time', async () => {
      // Query at 10:45 (before freeze start 11:30)
      const queryTime = new Date('2026-11-14T10:45:00.000Z');
      const board = await contestsService.getContestLeaderboard(
        freezeContestId,
        Role.USER,
        queryTime
      );

      const userIds = board.map((e) => e.userId);
      expect(userIds).toContain(userA.id); // 10:30
      expect(board.length).toBe(1);
    });

    it('Case 2: Exactly at freeze start (11:30:00.000), includes submissions at exact boundary', async () => {
      // Query at 11:30:00.000Z
      const queryTime = new Date('2026-11-14T11:30:00.000Z');
      const board = await contestsService.getContestLeaderboard(
        freezeContestId,
        Role.USER,
        queryTime
      );

      const userIds = board.map((e) => e.userId);
      // User A (10:30) and User B (11:30:00.000) are included
      expect(userIds).toContain(userA.id);
      expect(userIds).toContain(userB.id);
      // User C (11:30:00.001) is after boundary -> excluded
      expect(userIds).not.toContain(userC.id);
      expect(board.length).toBe(2);
    });

    it('Case 3: 1ms after freeze start (11:30:00.001), public leaderboard is frozen at 11:30:00.000', async () => {
      // Query at 11:30:00.001Z and 11:40:00.000Z
      for (const queryTime of [
        new Date('2026-11-14T11:30:00.001Z'),
        new Date('2026-11-14T11:40:00.000Z'),
      ]) {
        const board = await contestsService.getContestLeaderboard(
          freezeContestId,
          Role.USER,
          queryTime
        );

        const userIds = board.map((e) => e.userId);
        expect(userIds).toContain(userA.id);
        expect(userIds).toContain(userB.id);
        // Excluded from public freeze view:
        expect(userIds).not.toContain(userC.id); // 11:30:00.001
        expect(userIds).not.toContain(userD.id); // 11:45:00.000
        expect(userIds).not.toContain(userE.id); // 12:00:00.000
        expect(userIds).not.toContain(userF.id); // 12:00:01.000
        expect(board.length).toBe(2);
      }
    });

    it('Case 4: Exactly at contest end (12:00:00.000), public leaderboard unfreezes and reveals all contest solves', async () => {
      // Query at 12:00:00.000Z
      const queryTime = new Date('2026-11-14T12:00:00.000Z');
      const board = await contestsService.getContestLeaderboard(
        freezeContestId,
        Role.USER,
        queryTime
      );

      const userIds = board.map((e) => e.userId);
      // Unfrozen! Includes user A, B, C, D, E (all solves during contest up to endTime)
      expect(userIds).toContain(userA.id);
      expect(userIds).toContain(userB.id);
      expect(userIds).toContain(userC.id);
      expect(userIds).toContain(userD.id);
      expect(userIds).toContain(userE.id); // Exactly at 12:00:00.000Z
      // User F (12:00:01.000) was after contest end -> excluded
      expect(userIds).not.toContain(userF.id);
      expect(board.length).toBe(5);
    });

    it('Case 5: After contest end (12:05:00.000), public leaderboard shows complete final standings', async () => {
      // Query at 12:05:00.000Z
      const queryTime = new Date('2026-11-14T12:05:00.000Z');
      const board = await contestsService.getContestLeaderboard(
        freezeContestId,
        Role.USER,
        queryTime
      );

      const userIds = board.map((e) => e.userId);
      expect(userIds).toContain(userA.id);
      expect(userIds).toContain(userB.id);
      expect(userIds).toContain(userC.id);
      expect(userIds).toContain(userD.id);
      expect(userIds).toContain(userE.id);
      expect(userIds).not.toContain(userF.id);
      expect(board.length).toBe(5);
    });

    it('Case 6: freezeMinutes = 0 never freezes, displaying live submissions up to current time', async () => {
      // Create a contest with freezeMinutes = 0
      const [noFreezeContest] = await db
        .insert(contests)
        .values({
          title: `No Freeze Contest ${runTag}`,
          description: 'Testing freezeMinutes = 0',
          startTime: contestStartTime,
          endTime: contestEndTime,
          freezeMinutes: 0,
          createdBy: adminUser.id,
        })
        .returning();
      createdContestIds.push(noFreezeContest.id);

      await db.insert(contestProblems).values({
        contestId: noFreezeContest.id,
        problemId: freezeProblemId,
        problemOrder: 1,
      });

      // Insert submissions explicitly attributed to noFreezeContest
      const [nf1] = await db
        .insert(submissions)
        .values({
          problemId: freezeProblemId,
          contestId: noFreezeContest.id,
          userId: userA.id,
          code: 'pass',
          language: 'javascript',
          status: 'COMPLETED',
          verdict: Verdict.ACCEPTED,
          createdAt: new Date('2026-11-14T10:30:00.000Z'),
        })
        .returning();
      createdSubmissionIds.push(nf1.id);

      const [nf2] = await db
        .insert(submissions)
        .values({
          problemId: freezeProblemId,
          contestId: noFreezeContest.id,
          userId: userB.id,
          code: 'pass',
          language: 'javascript',
          status: 'COMPLETED',
          verdict: Verdict.ACCEPTED,
          createdAt: new Date('2026-11-14T11:30:00.000Z'),
        })
        .returning();
      createdSubmissionIds.push(nf2.id);

      const [nf3] = await db
        .insert(submissions)
        .values({
          problemId: freezeProblemId,
          contestId: noFreezeContest.id,
          userId: userC.id,
          code: 'pass',
          language: 'javascript',
          status: 'COMPLETED',
          verdict: Verdict.ACCEPTED,
          createdAt: new Date('2026-11-14T11:30:00.001Z'),
        })
        .returning();
      createdSubmissionIds.push(nf3.id);

      // Query at 11:40 (mid-contest) as ordinary USER
      const queryTime = new Date('2026-11-14T11:40:00.000Z');
      const board = await contestsService.getContestLeaderboard(
        noFreezeContest.id,
        Role.USER,
        queryTime
      );

      const userIds = board.map((e) => e.userId);
      // Because freezeMinutes = 0, User C (11:30:00.001) is NOT hidden!
      expect(userIds).toContain(userA.id);
      expect(userIds).toContain(userB.id);
      expect(userIds).toContain(userC.id);
      // User D (11:45) hasn't submitted yet at queryTime 11:40
      expect(userIds).not.toContain(userD.id);
      expect(board.length).toBe(3);
    });

    it('Case 7: Admin access during and after freeze maintains live and complete views', async () => {
      // 1. During freeze at 11:40:00.000Z -> Admin sees live scores including User C (11:30:00.001)
      const duringFreezeTime = new Date('2026-11-14T11:40:00.000Z');
      const adminDuring = await contestsService.getContestLeaderboard(
        freezeContestId,
        Role.ADMIN,
        duringFreezeTime
      );
      const duringIds = adminDuring.map((e) => e.userId);
      expect(duringIds).toContain(userA.id);
      expect(duringIds).toContain(userB.id);
      expect(duringIds).toContain(userC.id); // Visible to admin during freeze!
      expect(adminDuring.length).toBe(3);

      // 2. After contest at 12:05:00.000Z -> Admin sees all valid solves up to endTime
      const postContestTime = new Date('2026-11-14T12:05:00.000Z');
      const adminPost = await contestsService.getContestLeaderboard(
        freezeContestId,
        Role.ADMIN,
        postContestTime
      );
      const postIds = adminPost.map((e) => e.userId);
      expect(postIds).toContain(userA.id);
      expect(postIds).toContain(userB.id);
      expect(postIds).toContain(userC.id);
      expect(postIds).toContain(userD.id);
      expect(postIds).toContain(userE.id);
      expect(postIds).not.toContain(userF.id); // Post-contest solve excluded
      expect(adminPost.length).toBe(5);
    });

    it('Leaderboard API endpoint reflects public freeze vs admin view', async () => {
      const publicRes = await dispatchHttp('GET', `/api/contests/${freezeContestId}/leaderboard`, {
        cookie: regularCookie,
      });
      expect(publicRes.status).toBe(200);
      expect(Array.isArray(publicRes.body.data.leaderboard)).toBe(true);

      const adminRes = await dispatchHttp('GET', `/api/contests/${freezeContestId}/leaderboard`, {
        cookie: adminCookie,
      });
      expect(adminRes.status).toBe(200);
      expect(Array.isArray(adminRes.body.data.leaderboard)).toBe(true);
    });
  });

  describe('Contest Submission Attribution & Isolation Suite (Prompt 3C)', () => {
    let suiteUserA: any;
    let suiteUserB: any;
    let suiteUserCookieA: string;
    let _suiteUserCookieB: string;

    let endedContestId: string;
    let sharedProblemId: string;
    let contestAId: string;
    let contestBId: string;

    beforeAll(async () => {
      // Create dedicated users for attribution tests
      const [uA] = await db
        .insert(users)
        .values({
          username: `attr_usr_a_${runTag}`,
          email: `attr_usr_a_${runTag}@test.local`,
          passwordHash: '$2b$10$invaliddummyhashforvisruntestsonly',
          role: Role.USER,
        })
        .returning();
      suiteUserA = uA;
      createdUserIds.push(uA.id);
      suiteUserCookieA = `${env.AUTH_COOKIE_NAME}=${signAuthToken({ id: uA.id, role: uA.role, username: uA.username })}`;

      const [uB] = await db
        .insert(users)
        .values({
          username: `attr_usr_b_${runTag}`,
          email: `attr_usr_b_${runTag}@test.local`,
          passwordHash: '$2b$10$invaliddummyhashforvisruntestsonly',
          role: Role.USER,
        })
        .returning();
      suiteUserB = uB;
      createdUserIds.push(uB.id);
      _suiteUserCookieB = `${env.AUTH_COOKIE_NAME}=${signAuthToken({ id: uB.id, role: uB.role, username: uB.username })}`;

      // Create an ended contest
      const [endedC] = await db
        .insert(contests)
        .values({
          title: `Ended Contest ${runTag}`,
          description: 'Ended contest description',
          startTime: new Date(Date.now() - 7200000), // 2 hours ago
          endTime: new Date(Date.now() - 3600000), // 1 hour ago
          freezeMinutes: 0,
          createdBy: adminUser.id,
        })
        .returning();
      endedContestId = endedC.id;
      createdContestIds.push(endedC.id);

      // Create a problem shared between two overlapping contests
      const [sharedProb] = await db
        .insert(problems)
        .values({
          title: `Shared Problem ${runTag}`,
          slug: `shared-problem-${runTag}`,
          statement: 'Shared problem statement',
          difficulty: 'medium',
          tags: ['shared'],
          sampleInput: '10',
          sampleExpectedOutput: '20',
          visibility: ProblemVisibility.CONTEST_ONLY,
          setterId: setterUser.id,
        })
        .returning();
      sharedProblemId = sharedProb.id;
      createdProblemIds.push(sharedProb.id);

      // Contest A (Active now)
      const [cA] = await db
        .insert(contests)
        .values({
          title: `Contest A ${runTag}`,
          description: 'Contest A description',
          startTime: new Date(Date.now() - 1800000), // started 30 mins ago
          endTime: new Date(Date.now() + 1800000), // ends in 30 mins
          freezeMinutes: 0,
          createdBy: adminUser.id,
        })
        .returning();
      contestAId = cA.id;
      createdContestIds.push(cA.id);

      // Contest B (Active now, overlapping window!)
      const [cB] = await db
        .insert(contests)
        .values({
          title: `Contest B ${runTag}`,
          description: 'Contest B description',
          startTime: new Date(Date.now() - 1200000), // started 20 mins ago
          endTime: new Date(Date.now() + 2400000), // ends in 40 mins
          freezeMinutes: 0,
          createdBy: adminUser.id,
        })
        .returning();
      contestBId = cB.id;
      createdContestIds.push(cB.id);

      // Link shared problem to both Contest A and Contest B and ended contest
      await db.insert(contestProblems).values([
        {
          contestId: contestAId,
          problemId: sharedProblemId,
          problemOrder: 1,
        },
        {
          contestId: contestBId,
          problemId: sharedProblemId,
          problemOrder: 1,
        },
        {
          contestId: endedContestId,
          problemId: sharedProblemId,
          problemOrder: 1,
        },
      ]);
    });

    it('1. Public problem submission without contestId still works and produces a normal submission', async () => {
      await redisClient.del(REDIS_KEYS.SUBMISSION_RATE(suiteUserA.id));
      const res = await dispatchHttp('POST', '/api/submissions', {
        cookie: suiteUserCookieA,
        body: {
          problemId: publicProblemId,
          code: `console.log("pub_attr_1_${Date.now()}");`,
          language: 'javascript',
        },
      });
      expect(res.status).toBe(202);
      expect(res.body.data.id).toBeDefined();
      createdSubmissionIds.push(res.body.data.id);

      // Verify DB row has contestId: null
      const rows = await db.select().from(submissions).where(eq(submissions.id, res.body.data.id));
      expect(rows.length).toBe(1);
      expect(rows[0].contestId).toBeNull();

      // Verify GET endpoint returns submission without contestId
      const getRes = await dispatchHttp('GET', `/api/submissions/${res.body.data.id}`, {
        cookie: suiteUserCookieA,
      });
      expect(getRes.status).toBe(200);
      expect(getRes.body.data.submission.contestId).toBeUndefined();
    });

    it('2. Contest-only problem submission without contestId is rejected with 403', async () => {
      await redisClient.del(REDIS_KEYS.SUBMISSION_RATE(suiteUserA.id));
      const res = await dispatchHttp('POST', '/api/submissions', {
        cookie: suiteUserCookieA,
        body: {
          problemId: sharedProblemId,
          code: `console.log("no_contest_${Date.now()}");`,
          language: 'javascript',
        },
      });
      expect(res.status).toBe(403);
      expect(res.body.code).toBe(ERROR_CODES.CONTEST_NOT_STARTED);
    });

    it('3. Contest-only problem submission with valid contestId during contest window is accepted (202), and contestId is persisted', async () => {
      await redisClient.del(REDIS_KEYS.SUBMISSION_RATE(suiteUserA.id));
      const res = await dispatchHttp('POST', '/api/submissions', {
        cookie: suiteUserCookieA,
        body: {
          problemId: sharedProblemId,
          contestId: contestAId,
          code: `console.log("contest_attr_${Date.now()}");`,
          language: 'javascript',
        },
      });
      expect(res.status).toBe(202);
      expect(res.body.data.id).toBeDefined();
      createdSubmissionIds.push(res.body.data.id);

      // Verify DB row has contestId === contestAId
      const rows = await db.select().from(submissions).where(eq(submissions.id, res.body.data.id));
      expect(rows.length).toBe(1);
      expect(rows[0].contestId).toBe(contestAId);

      // Verify GET endpoint returns submission with contestId
      const getRes = await dispatchHttp('GET', `/api/submissions/${res.body.data.id}`, {
        cookie: suiteUserCookieA,
      });
      expect(getRes.status).toBe(200);
      expect(getRes.body.data.submission.contestId).toBe(contestAId);
    });

    it('4. Submission with contestId for a contest that does not contain that problem is rejected (400)', async () => {
      await redisClient.del(REDIS_KEYS.SUBMISSION_RATE(suiteUserA.id));
      // publicProblemId is NOT in contestAId
      const res = await dispatchHttp('POST', '/api/submissions', {
        cookie: suiteUserCookieA,
        body: {
          problemId: publicProblemId,
          contestId: contestAId,
          code: `console.log("unassociated_${Date.now()}");`,
          language: 'javascript',
        },
      });
      expect(res.status).toBe(400);
      expect(res.body.message).toContain('Problem is not associated with this contest');
    });

    it('5. Submission with nonexistent contestId is rejected (404)', async () => {
      await redisClient.del(REDIS_KEYS.SUBMISSION_RATE(suiteUserA.id));
      const nonExistentContestId = crypto.randomUUID();
      const res = await dispatchHttp('POST', '/api/submissions', {
        cookie: suiteUserCookieA,
        body: {
          problemId: sharedProblemId,
          contestId: nonExistentContestId,
          code: `console.log("nonexistent_${Date.now()}");`,
          language: 'javascript',
        },
      });
      expect(res.status).toBe(404);
      expect(res.body.message).toContain('Contest not found');
    });

    it('6. Contest ID for problem not linked to that contest rejected (400)', async () => {
      await redisClient.del(REDIS_KEYS.SUBMISSION_RATE(suiteUserA.id));
      // futureContestProblemId is only linked to futureContestId, NOT contestAId
      const res = await dispatchHttp('POST', '/api/submissions', {
        cookie: suiteUserCookieA,
        body: {
          problemId: futureContestProblemId,
          contestId: contestAId,
          code: `console.log("not_linked_${Date.now()}");`,
          language: 'javascript',
        },
      });
      expect(res.status).toBe(400);
      expect(res.body.message).toContain('Problem is not associated with this contest');
    });

    it('7. Submission before contest start is rejected (403)', async () => {
      await redisClient.del(REDIS_KEYS.SUBMISSION_RATE(suiteUserA.id));
      // futureContestId starts in the future
      const res = await dispatchHttp('POST', '/api/submissions', {
        cookie: suiteUserCookieA,
        body: {
          problemId: futureContestProblemId,
          contestId: futureContestId,
          code: `console.log("before_start_${Date.now()}");`,
          language: 'javascript',
        },
      });
      expect(res.status).toBe(403);
      expect(res.body.message).toContain('Cannot submit before contest start');
    });

    it('8. Submission at or after contest end is rejected (400)', async () => {
      await redisClient.del(REDIS_KEYS.SUBMISSION_RATE(suiteUserA.id));
      // endedContestId ended 1 hour ago
      const res = await dispatchHttp('POST', '/api/submissions', {
        cookie: suiteUserCookieA,
        body: {
          problemId: sharedProblemId,
          contestId: endedContestId,
          code: `console.log("after_end_${Date.now()}");`,
          language: 'javascript',
        },
      });
      expect(res.status).toBe(400);
      expect(res.body.message).toContain('Cannot submit after contest end');
    });

    it('9. Sample run enforces the same contest-context and time-window rules without creating submission records', async () => {
      // Record initial submission count
      const initialCount = (await db.select().from(submissions)).length;

      // a) Public problem without contestId succeeds (202)
      await redisClient.del(REDIS_KEYS.SAMPLE_RUN_RATE(suiteUserA.id));
      const pubRes = await dispatchHttp('POST', '/api/submissions/run-sample', {
        cookie: suiteUserCookieA,
        body: {
          problemId: publicProblemId,
          code: `console.log("sample_pub_${Date.now()}");`,
          language: 'javascript',
        },
      });
      expect(pubRes.status).toBe(202);
      expect(pubRes.body.data.runId).toBeDefined();

      // b) Contest-only problem without contestId rejected (403)
      await redisClient.del(REDIS_KEYS.SAMPLE_RUN_RATE(suiteUserA.id));
      const noContextRes = await dispatchHttp('POST', '/api/submissions/run-sample', {
        cookie: suiteUserCookieA,
        body: {
          problemId: sharedProblemId,
          code: `console.log("sample_no_ctx_${Date.now()}");`,
          language: 'javascript',
        },
      });
      expect(noContextRes.status).toBe(403);

      // c) Contest-only problem with unstarted contestId rejected (403)
      await redisClient.del(REDIS_KEYS.SAMPLE_RUN_RATE(suiteUserA.id));
      const unstartedRes = await dispatchHttp('POST', '/api/submissions/run-sample', {
        cookie: suiteUserCookieA,
        body: {
          problemId: futureContestProblemId,
          contestId: futureContestId,
          code: `console.log("sample_unstarted_${Date.now()}");`,
          language: 'javascript',
        },
      });
      expect(unstartedRes.status).toBe(403);
      expect(unstartedRes.body.message).toContain('Cannot submit before contest start');

      // d) Problem with ended contestId rejected (400)
      await redisClient.del(REDIS_KEYS.SAMPLE_RUN_RATE(suiteUserA.id));
      const endedRes = await dispatchHttp('POST', '/api/submissions/run-sample', {
        cookie: suiteUserCookieA,
        body: {
          problemId: sharedProblemId,
          contestId: endedContestId,
          code: `console.log("sample_ended_${Date.now()}");`,
          language: 'javascript',
        },
      });
      expect(endedRes.status).toBe(400);
      expect(endedRes.body.message).toContain('Cannot submit after contest end');

      // e) Problem with nonexistent contestId rejected (404)
      await redisClient.del(REDIS_KEYS.SAMPLE_RUN_RATE(suiteUserA.id));
      const nonExistentRes = await dispatchHttp('POST', '/api/submissions/run-sample', {
        cookie: suiteUserCookieA,
        body: {
          problemId: sharedProblemId,
          contestId: crypto.randomUUID(),
          code: `console.log("sample_404_${Date.now()}");`,
          language: 'javascript',
        },
      });
      expect(nonExistentRes.status).toBe(404);

      // f) Active contest with valid linked problem accepted (202)
      await redisClient.del(REDIS_KEYS.SAMPLE_RUN_RATE(suiteUserA.id));
      const activeRes = await dispatchHttp('POST', '/api/submissions/run-sample', {
        cookie: suiteUserCookieA,
        body: {
          problemId: sharedProblemId,
          contestId: contestAId,
          code: `console.log("sample_active_${Date.now()}");`,
          language: 'javascript',
        },
      });
      expect(activeRes.status).toBe(202);
      expect(activeRes.body.data.runId).toBeDefined();

      // g) Crucially verify that ZERO submission rows were created in the submissions table
      const finalCount = (await db.select().from(submissions)).length;
      expect(finalCount).toBe(initialCount);
    });

    it('10 & 11. Contest A submission appears in Contest A leaderboard, but NOT in overlapping Contest B', async () => {
      // Register both users as participants in both contests
      await db.insert(contestParticipants).values([
        { contestId: contestAId, userId: suiteUserA.id },
        { contestId: contestBId, userId: suiteUserA.id },
        { contestId: contestAId, userId: suiteUserB.id },
        { contestId: contestBId, userId: suiteUserB.id },
      ]);

      // Insert an ACCEPTED submission for suiteUserA strictly attributed to Contest A
      const [subA] = await db
        .insert(submissions)
        .values({
          problemId: sharedProblemId,
          contestId: contestAId,
          userId: suiteUserA.id,
          code: 'pass_a',
          language: 'javascript',
          status: 'COMPLETED',
          verdict: Verdict.ACCEPTED,
          createdAt: new Date(),
        })
        .returning();
      createdSubmissionIds.push(subA.id);

      // Query Contest A leaderboard
      const boardA = await contestsService.getContestLeaderboard(contestAId, Role.USER, new Date());
      const userIdsA = boardA.map((e) => e.userId);
      expect(userIdsA).toContain(suiteUserA.id);
      const entryA = boardA.find((e) => e.userId === suiteUserA.id);
      expect(entryA?.problemsSolved).toBe(1);
      expect(entryA?.score).toBeGreaterThan(0);

      // Query Contest B leaderboard - suiteUserA MUST NOT appear or have score > 0 on Contest B!
      const boardB = await contestsService.getContestLeaderboard(contestBId, Role.USER, new Date());
      const userIdsB = boardB.map((e) => e.userId);
      expect(userIdsB).not.toContain(suiteUserA.id);
    });

    it('12. Legacy submissions with NULL contestId do not appear in contest standings', async () => {
      // Insert a legacy submission with contestId = NULL for suiteUserB on sharedProblemId
      const [subLegacy] = await db
        .insert(submissions)
        .values({
          problemId: sharedProblemId,
          contestId: null,
          userId: suiteUserB.id,
          code: 'pass_legacy',
          language: 'javascript',
          status: 'COMPLETED',
          verdict: Verdict.ACCEPTED,
          createdAt: new Date(),
        })
        .returning();
      createdSubmissionIds.push(subLegacy.id);

      // Query Contest A leaderboard: suiteUserB's legacy submission MUST NOT appear
      const boardA = await contestsService.getContestLeaderboard(contestAId, Role.USER, new Date());
      const userIdsA = boardA.map((e) => e.userId);
      expect(userIdsA).not.toContain(suiteUserB.id);

      // Query Contest B leaderboard: suiteUserB's legacy submission MUST NOT appear
      const boardB = await contestsService.getContestLeaderboard(contestBId, Role.USER, new Date());
      const userIdsB = boardB.map((e) => e.userId);
      expect(userIdsB).not.toContain(suiteUserB.id);
    });

    it('13. Global leaderboard behavior remains unchanged with explicit or legacy solves', async () => {
      // Record solve for suiteUserA (contest solve) and suiteUserB (legacy solve) in global leaderboard
      await leaderboardService.recordSolve(suiteUserA.id, sharedProblemId, 120);
      await leaderboardService.recordSolve(suiteUserB.id, sharedProblemId, 60);

      // Verify global leaderboard reflects solves correctly
      const page1 = await leaderboardService.getGlobalLeaderboard({ page: 1, limit: 100 });
      const page2 = await leaderboardService.getGlobalLeaderboard({ page: 2, limit: 100 });
      const userIds = [...page1.leaderboard, ...page2.leaderboard].map((e) => e.userId);
      expect(userIds).toContain(suiteUserA.id);
      expect(userIds).toContain(suiteUserB.id);

      // Verify solved set in Redis
      const solvedA = await redisClient.smembers(`judge:user:${suiteUserA.id}:solved`);
      expect(solvedA).toContain(sharedProblemId);

      const solvedB = await redisClient.smembers(`judge:user:${suiteUserB.id}:solved`);
      expect(solvedB).toContain(sharedProblemId);
    });
  });
});
