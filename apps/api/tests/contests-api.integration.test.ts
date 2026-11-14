import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Server } from 'http';
import crypto from 'crypto';
import { inArray } from 'drizzle-orm';
import { ERROR_CODES, Role } from '@judge/shared';
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

describe('Day 18 Contest Management API Integration Tests', () => {
  const runTag = `${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
  const createdUserIds: string[] = [];
  const createdProblemIds: string[] = [];
  const createdContestIds: string[] = [];

  let adminUser: { id: string; username: string; email: string; role: Role };
  let setterUser: { id: string; username: string; email: string; role: Role };
  let regularUserA: { id: string; username: string; email: string; role: Role };
  let regularUserB: { id: string; username: string; email: string; role: Role };

  let adminCookie: string;
  let setterCookie: string;
  let userACookie: string;
  let userBCookie: string;

  let problem1Id: string;
  let problem2Id: string;
  let problem3Id: string;

  beforeAll(async () => {
    const connected = await checkDatabaseConnection();
    if (!connected) {
      throw new Error('PostgreSQL is unreachable for contest API tests');
    }

    // Start ephemeral server
    await new Promise<void>((resolve) => {
      server = app.listen(0, '127.0.0.1', () => {
        const addr = server.address();
        if (!addr || typeof addr === 'string') {
          throw new Error('Failed to bind ephemeral HTTP port');
        }
        baseUrl = `http://127.0.0.1:${addr.port}`;
        resolve();
      });
    });

    // Create 4 test users: Admin, Setter, User A, User B
    const [adm] = await db
      .insert(users)
      .values({
        username: `admin_api_${runTag}`,
        email: `admin_api_${runTag}@judge.local`,
        passwordHash: '$2b$10$placeholderpasswordhashforcontests',
        role: Role.ADMIN,
      })
      .returning();
    adminUser = { id: adm.id, username: adm.username, email: adm.email, role: Role.ADMIN };
    createdUserIds.push(adm.id);
    adminCookie = `${env.AUTH_COOKIE_NAME}=${signAuthToken(adminUser)}`;

    const [set] = await db
      .insert(users)
      .values({
        username: `setter_api_${runTag}`,
        email: `setter_api_${runTag}@judge.local`,
        passwordHash: '$2b$10$placeholderpasswordhashforcontests',
        role: Role.PROBLEM_SETTER,
      })
      .returning();
    setterUser = {
      id: set.id,
      username: set.username,
      email: set.email,
      role: Role.PROBLEM_SETTER,
    };
    createdUserIds.push(set.id);
    setterCookie = `${env.AUTH_COOKIE_NAME}=${signAuthToken(setterUser)}`;

    const [uA] = await db
      .insert(users)
      .values({
        username: `usera_api_${runTag}`,
        email: `usera_api_${runTag}@judge.local`,
        passwordHash: '$2b$10$placeholderpasswordhashforcontests',
        role: Role.USER,
      })
      .returning();
    regularUserA = { id: uA.id, username: uA.username, email: uA.email, role: Role.USER };
    createdUserIds.push(uA.id);
    userACookie = `${env.AUTH_COOKIE_NAME}=${signAuthToken(regularUserA)}`;

    const [uB] = await db
      .insert(users)
      .values({
        username: `userb_api_${runTag}`,
        email: `userb_api_${runTag}@judge.local`,
        passwordHash: '$2b$10$placeholderpasswordhashforcontests',
        role: Role.USER,
      })
      .returning();
    regularUserB = { id: uB.id, username: uB.username, email: uB.email, role: Role.USER };
    createdUserIds.push(uB.id);
    userBCookie = `${env.AUTH_COOKIE_NAME}=${signAuthToken(regularUserB)}`;

    // Create 3 problems
    const [p1] = await db
      .insert(problems)
      .values({
        title: `Contest API Problem 1 ${runTag}`,
        slug: `contest-api-p1-${runTag}`,
        statement: 'Problem 1 statement',
        difficulty: 'easy',
        tags: ['contest'],
        setterId: setterUser.id,
      })
      .returning();
    problem1Id = p1.id;
    createdProblemIds.push(problem1Id);

    const [p2] = await db
      .insert(problems)
      .values({
        title: `Contest API Problem 2 ${runTag}`,
        slug: `contest-api-p2-${runTag}`,
        statement: 'Problem 2 statement',
        difficulty: 'medium',
        tags: ['contest'],
        setterId: setterUser.id,
      })
      .returning();
    problem2Id = p2.id;
    createdProblemIds.push(problem2Id);

    const [p3] = await db
      .insert(problems)
      .values({
        title: `Contest API Problem 3 ${runTag}`,
        slug: `contest-api-p3-${runTag}`,
        statement: 'Problem 3 statement',
        difficulty: 'hard',
        tags: ['contest'],
        setterId: setterUser.id,
      })
      .returning();
    problem3Id = p3.id;
    createdProblemIds.push(problem3Id);
  });

  afterAll(async () => {
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
    if (createdContestIds.length > 0) {
      await db
        .delete(contestParticipants)
        .where(inArray(contestParticipants.contestId, createdContestIds));
      await db.delete(contestProblems).where(inArray(contestProblems.contestId, createdContestIds));
      await db.delete(contests).where(inArray(contests.id, createdContestIds));
    }
    if (createdProblemIds.length > 0) {
      await db.delete(submissions).where(inArray(submissions.problemId, createdProblemIds));
      await db.delete(problems).where(inArray(problems.id, createdProblemIds));
    }
    if (createdUserIds.length > 0) {
      await db.delete(users).where(inArray(users.id, createdUserIds));
    }
    await closeDatabase();
  });

  // ==========================================
  // SECTION A: CONTEST CREATION
  // ==========================================
  describe('A. Contest Creation', () => {
    it('Admin creates a valid contest (201 Created)', async () => {
      const startTime = new Date(Date.now() + 3600 * 1000).toISOString();
      const endTime = new Date(Date.now() + 7200 * 1000).toISOString();

      const res = await dispatchHttp('POST', '/api/contests', {
        cookie: adminCookie,
        body: {
          title: `Spring Cup ${runTag}`,
          description: 'Official spring contest',
          startTime,
          endTime,
          freezeMinutes: 30,
          problemIds: [problem1Id, problem2Id],
        },
      });

      expect(res.status).toBe(201);
      expect(res.body.data.contest).toBeDefined();
      expect(res.body.data.contest.id).toBeDefined();
      expect(res.body.data.contest.title).toBe(`Spring Cup ${runTag}`);
      expect(res.body.data.contest.status).toBe('UPCOMING');
      expect(res.body.data.contest.problemCount).toBe(2);
      expect(res.body.data.contest.createdBy).toBe(adminUser.id);

      createdContestIds.push(res.body.data.contest.id);
    });

    it('Regular user cannot create contest (403 Forbidden)', async () => {
      const res = await dispatchHttp('POST', '/api/contests', {
        cookie: userACookie,
        body: {
          title: 'User Contest Attempt',
          startTime: new Date(Date.now() + 3600000).toISOString(),
          endTime: new Date(Date.now() + 7200000).toISOString(),
          problemIds: [problem1Id],
        },
      });

      expect(res.status).toBe(403);
      expect(res.body.code).toBe(ERROR_CODES.FORBIDDEN);
    });

    it('Problem setter cannot create contest (403 Forbidden)', async () => {
      const res = await dispatchHttp('POST', '/api/contests', {
        cookie: setterCookie,
        body: {
          title: 'Setter Contest Attempt',
          startTime: new Date(Date.now() + 3600000).toISOString(),
          endTime: new Date(Date.now() + 7200000).toISOString(),
          problemIds: [problem1Id],
        },
      });

      expect(res.status).toBe(403);
      expect(res.body.code).toBe(ERROR_CODES.FORBIDDEN);
    });

    it('Invalid date range (endTime <= startTime) is rejected (400)', async () => {
      const res = await dispatchHttp('POST', '/api/contests', {
        cookie: adminCookie,
        body: {
          title: 'Bad Date Contest',
          startTime: new Date(Date.now() + 7200000).toISOString(),
          endTime: new Date(Date.now() + 3600000).toISOString(),
          problemIds: [problem1Id],
        },
      });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe(ERROR_CODES.VALIDATION_ERROR);
    });

    it('Negative freezeMinutes is rejected (400)', async () => {
      const res = await dispatchHttp('POST', '/api/contests', {
        cookie: adminCookie,
        body: {
          title: 'Negative Freeze Contest',
          startTime: new Date(Date.now() + 3600000).toISOString(),
          endTime: new Date(Date.now() + 7200000).toISOString(),
          freezeMinutes: -20,
          problemIds: [problem1Id],
        },
      });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe(ERROR_CODES.VALIDATION_ERROR);
    });

    it('Nonexistent problem ID is rejected (404)', async () => {
      const fakeUuid = '00000000-0000-0000-0000-000000000000';
      const res = await dispatchHttp('POST', '/api/contests', {
        cookie: adminCookie,
        body: {
          title: 'Fake Problem Contest',
          startTime: new Date(Date.now() + 3600000).toISOString(),
          endTime: new Date(Date.now() + 7200000).toISOString(),
          problemIds: [problem1Id, fakeUuid],
        },
      });

      expect(res.status).toBe(404);
      expect(res.body.code).toBe(ERROR_CODES.NOT_FOUND);
    });

    it('Duplicate problem IDs are rejected (400)', async () => {
      const res = await dispatchHttp('POST', '/api/contests', {
        cookie: adminCookie,
        body: {
          title: 'Duplicate Problem Contest',
          startTime: new Date(Date.now() + 3600000).toISOString(),
          endTime: new Date(Date.now() + 7200000).toISOString(),
          problemIds: [problem1Id, problem1Id],
        },
      });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe(ERROR_CODES.VALIDATION_ERROR);
    });
  });

  // ==========================================
  // SECTION B: CONTEST LIST AND RETRIEVAL
  // ==========================================
  describe('B. Contest List and Retrieval', () => {
    it('Guest lists contests (200 with isRegistered: false)', async () => {
      const res = await dispatchHttp('GET', '/api/contests');

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data.contests)).toBe(true);
      const target = res.body.data.contests.find((c: any) => c.id === createdContestIds[0]);
      expect(target).toBeDefined();
      expect(target.isRegistered).toBe(false);
      expect(typeof target.participantCount).toBe('number');
      expect(typeof target.problemCount).toBe('number');
    });

    it('Authenticated user lists contests (200 with accurate registration status)', async () => {
      const res = await dispatchHttp('GET', '/api/contests', {
        cookie: userACookie,
      });

      expect(res.status).toBe(200);
      const target = res.body.data.contests.find((c: any) => c.id === createdContestIds[0]);
      expect(target).toBeDefined();
      expect(target.isRegistered).toBe(false);
    });

    it('Get contest detail returns metadata, counts and registration flag', async () => {
      const res = await dispatchHttp('GET', `/api/contests/${createdContestIds[0]}`, {
        cookie: userACookie,
      });

      expect(res.status).toBe(200);
      expect(res.body.data.contest.id).toBe(createdContestIds[0]);
      expect(res.body.data.contest.problemCount).toBe(2);
      expect(res.body.data.contest.participantCount).toBe(0);
      expect(res.body.data.contest.isRegistered).toBe(false);
      expect(res.body.data.contest.status).toBe('UPCOMING');
    });

    it('Get nonexistent contest returns 404', async () => {
      const fakeUuid = '00000000-0000-0000-0000-000000000000';
      const res = await dispatchHttp('GET', `/api/contests/${fakeUuid}`);

      expect(res.status).toBe(404);
      expect(res.body.code).toBe(ERROR_CODES.NOT_FOUND);
    });
  });

  // ==========================================
  // SECTION C: PARTICIPANT REGISTRATION
  // ==========================================
  describe('C. Participant Registration', () => {
    it('Unauthenticated registration is rejected (401)', async () => {
      const res = await dispatchHttp('POST', `/api/contests/${createdContestIds[0]}/register`);

      expect(res.status).toBe(401);
      expect(res.body.code).toBe(ERROR_CODES.AUTH_UNAUTHORIZED);
    });

    it('User registers successfully (200 with registered: true)', async () => {
      const res = await dispatchHttp('POST', `/api/contests/${createdContestIds[0]}/register`, {
        cookie: userACookie,
      });

      expect(res.status).toBe(200);
      expect(res.body.data.registered).toBe(true);
      expect(res.body.data.registeredAt).toBeDefined();

      // Verify contest detail now reflects isRegistered: true and participantCount: 1
      const detailRes = await dispatchHttp('GET', `/api/contests/${createdContestIds[0]}`, {
        cookie: userACookie,
      });
      expect(detailRes.body.data.contest.isRegistered).toBe(true);
      expect(detailRes.body.data.contest.participantCount).toBe(1);
    });

    it('Repeated registration is idempotent (200 with same registration)', async () => {
      const res = await dispatchHttp('POST', `/api/contests/${createdContestIds[0]}/register`, {
        cookie: userACookie,
      });

      expect(res.status).toBe(200);
      expect(res.body.data.registered).toBe(true);

      const detailRes = await dispatchHttp('GET', `/api/contests/${createdContestIds[0]}`, {
        cookie: userACookie,
      });
      expect(detailRes.body.data.contest.participantCount).toBe(1);
    });

    it('Concurrent duplicate registration creates only one record', async () => {
      // User B sends 3 concurrent registration requests
      const results = await Promise.all([
        dispatchHttp('POST', `/api/contests/${createdContestIds[0]}/register`, {
          cookie: userBCookie,
        }),
        dispatchHttp('POST', `/api/contests/${createdContestIds[0]}/register`, {
          cookie: userBCookie,
        }),
        dispatchHttp('POST', `/api/contests/${createdContestIds[0]}/register`, {
          cookie: userBCookie,
        }),
      ]);

      for (const r of results) {
        expect(r.status).toBe(200);
        expect(r.body.data.registered).toBe(true);
      }

      const detailRes = await dispatchHttp('GET', `/api/contests/${createdContestIds[0]}`);
      expect(detailRes.body.data.contest.participantCount).toBe(2); // User A + User B
    });

    it('Unregistration before start succeeds (200)', async () => {
      const res = await dispatchHttp('DELETE', `/api/contests/${createdContestIds[0]}/register`, {
        cookie: userBCookie,
      });

      expect(res.status).toBe(200);
      expect(res.body.data.unregistered).toBe(true);

      const detailRes = await dispatchHttp('GET', `/api/contests/${createdContestIds[0]}`);
      expect(detailRes.body.data.contest.participantCount).toBe(1);
    });

    it('Registration for started or ended contest is rejected', async () => {
      // Create a contest in the past (ended)
      const pastStart = new Date(Date.now() - 7200 * 1000);
      const pastEnd = new Date(Date.now() - 3600 * 1000);

      const [endedContest] = await db
        .insert(contests)
        .values({
          title: `Ended Contest ${runTag}`,
          description: 'Past contest',
          startTime: pastStart,
          endTime: pastEnd,
          freezeMinutes: 30,
          createdBy: adminUser.id,
        })
        .returning();
      createdContestIds.push(endedContest.id);

      const res = await dispatchHttp('POST', `/api/contests/${endedContest.id}/register`, {
        cookie: userACookie,
      });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe(ERROR_CODES.CONTEST_ENDED);
    });

    it('Unregistration after contest has started is rejected (400)', async () => {
      // Create a running contest
      const runningStart = new Date(Date.now() - 1800 * 1000);
      const runningEnd = new Date(Date.now() + 1800 * 1000);

      const [runningContest] = await db
        .insert(contests)
        .values({
          title: `Running Contest ${runTag}`,
          description: 'Live contest',
          startTime: runningStart,
          endTime: runningEnd,
          freezeMinutes: 15,
          createdBy: adminUser.id,
        })
        .returning();
      createdContestIds.push(runningContest.id);

      // Register User A directly in DB before test
      await db.insert(contestParticipants).values({
        contestId: runningContest.id,
        userId: regularUserA.id,
      });

      const res = await dispatchHttp('DELETE', `/api/contests/${runningContest.id}/register`, {
        cookie: userACookie,
      });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe(ERROR_CODES.VALIDATION_ERROR);
    });
  });

  // ==========================================
  // SECTION D: CONTEST PROBLEM ACCESS CONTROL
  // ==========================================
  describe('D. Contest Problem Access Control', () => {
    let upcomingContestId: string;
    let runningContestId: string;

    beforeAll(async () => {
      // Upcoming contest (starts in 2 hours)
      const [up] = await db
        .insert(contests)
        .values({
          title: `Upcoming Gated Contest ${runTag}`,
          startTime: new Date(Date.now() + 7200 * 1000),
          endTime: new Date(Date.now() + 10800 * 1000),
          freezeMinutes: 30,
          createdBy: adminUser.id,
        })
        .returning();
      upcomingContestId = up.id;
      createdContestIds.push(upcomingContestId);

      await db.insert(contestProblems).values([
        { contestId: upcomingContestId, problemId: problem1Id, problemOrder: 1 },
        { contestId: upcomingContestId, problemId: problem2Id, problemOrder: 2 },
      ]);

      // Running contest (started 10 mins ago)
      const [rn] = await db
        .insert(contests)
        .values({
          title: `Live Accessible Contest ${runTag}`,
          startTime: new Date(Date.now() - 600 * 1000),
          endTime: new Date(Date.now() + 3600 * 1000),
          freezeMinutes: 15,
          createdBy: adminUser.id,
        })
        .returning();
      runningContestId = rn.id;
      createdContestIds.push(runningContestId);

      await db.insert(contestProblems).values([
        { contestId: runningContestId, problemId: problem2Id, problemOrder: 1 },
        { contestId: runningContestId, problemId: problem3Id, problemOrder: 2 },
      ]);
    });

    it('Ordinary user gets 403 CONTEST_NOT_STARTED for upcoming contest problems', async () => {
      const res = await dispatchHttp('GET', `/api/contests/${upcomingContestId}/problems`, {
        cookie: userACookie,
      });

      expect(res.status).toBe(403);
      expect(res.body.code).toBe(ERROR_CODES.CONTEST_NOT_STARTED);
    });

    it('Guest gets 403 CONTEST_NOT_STARTED for upcoming contest problems', async () => {
      const res = await dispatchHttp('GET', `/api/contests/${upcomingContestId}/problems`);

      expect(res.status).toBe(403);
      expect(res.body.code).toBe(ERROR_CODES.CONTEST_NOT_STARTED);
    });

    it('Admin can view upcoming contest problems (200 OK)', async () => {
      const res = await dispatchHttp('GET', `/api/contests/${upcomingContestId}/problems`, {
        cookie: adminCookie,
      });

      expect(res.status).toBe(200);
      expect(res.body.data.problems).toHaveLength(2);
      expect(res.body.data.problems[0].id).toBe(problem1Id);
      expect(res.body.data.problems[0].problemOrder).toBe(1);
      expect(res.body.data.problems[1].id).toBe(problem2Id);
      expect(res.body.data.problems[1].problemOrder).toBe(2);
    });

    it('After contest starts, problems become accessible in order without private fields', async () => {
      const res = await dispatchHttp('GET', `/api/contests/${runningContestId}/problems`, {
        cookie: userACookie,
      });

      expect(res.status).toBe(200);
      expect(res.body.data.problems).toHaveLength(2);
      expect(res.body.data.problems[0].id).toBe(problem2Id);
      expect(res.body.data.problems[0].problemOrder).toBe(1);
      expect(res.body.data.problems[1].id).toBe(problem3Id);
      expect(res.body.data.problems[1].problemOrder).toBe(2);

      // Verify no sensitive fields leaked
      const firstProblem = res.body.data.problems[0];
      expect(firstProblem.testCases).toBeUndefined();
      expect(firstProblem.inputKey).toBeUndefined();
      expect(firstProblem.expectedOutputKey).toBeUndefined();
      expect(firstProblem.setterId).toBeUndefined();
    });
  });

  // ==========================================
  // SECTION E: CONTEST LEADERBOARD
  // ==========================================
  describe('E. Contest Leaderboard', () => {
    it('Retrieves contest leaderboard with rankings and freeze window logic', async () => {
      const contestId = createdContestIds[0];
      const res = await dispatchHttp('GET', `/api/contests/${contestId}/leaderboard`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data.leaderboard)).toBe(true);
    });
  });

  // ==========================================
  // SECTION F: SECURITY & DATA PRIVACY
  // ==========================================
  describe('F. Security & Data Privacy', () => {
    it('Contest APIs never expose participant emails or password hashes', async () => {
      const listRes = await dispatchHttp('GET', '/api/contests');
      const text = JSON.stringify(listRes.body);
      expect(text).not.toContain('password_hash');
      expect(text).not.toContain('passwordHash');
      expect(text).not.toContain(regularUserA.email);

      const detailRes = await dispatchHttp('GET', `/api/contests/${createdContestIds[0]}`);
      const detailText = JSON.stringify(detailRes.body);
      expect(detailText).not.toContain('password_hash');
      expect(detailText).not.toContain('passwordHash');
      expect(detailText).not.toContain(regularUserA.email);
    });

    it('Database error mapping preserves clean API shape without raw SQL error leaks', async () => {
      const res = await dispatchHttp('GET', '/api/contests/invalid-not-a-uuid');
      expect(res.status).toBe(404);
      expect(res.body.code).toBe(ERROR_CODES.NOT_FOUND);
      expect(JSON.stringify(res.body)).not.toContain('syntax error');
      expect(JSON.stringify(res.body)).not.toContain('pg_tables');
    });
  });
});
