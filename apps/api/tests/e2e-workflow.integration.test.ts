import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Server } from 'http';
import crypto from 'crypto';
import { inArray, eq } from 'drizzle-orm';
import { Verdict, SubmissionStatus, SubmissionEvent } from '@judge/shared';
import { app } from '../src/app.js';
import { redisClient } from '../src/config/redis.js';
import { db, checkDatabaseConnection, closeDatabase } from '../src/db/index.js';
import {
  users,
  problems,
  contests,
  contestProblems,
  contestParticipants,
  submissions,
  notifications,
} from '../src/db/schema.js';
import { notificationsService } from '../src/modules/notifications/notifications.service.js';

let server: Server;
let baseUrl: string;

async function apiRequest(
  method: string,
  path: string,
  options: { body?: unknown; cookie?: string; headers?: Record<string, string> } = {}
): Promise<{ status: number; body: any; headers: Headers }> {
  const headers: Record<string, string> = {
    ...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    ...(options.cookie ? { Cookie: options.cookie } : {}),
    ...(options.headers || {}),
  };

  const res = await fetch(`${baseUrl}${path}`, {
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
    headers: res.headers,
  };
}

describe('Day 21 E2E Integration Suite: Days 1–20 Complete Lifecycle Workflow', () => {
  const runTag = `${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
  const createdUserIds: string[] = [];
  const createdProblemIds: string[] = [];
  const createdContestIds: string[] = [];
  const createdSubmissionIds: string[] = [];

  let adminUser: { id: string; email: string; cookie: string };
  let participantUser: { id: string; email: string; cookie: string };
  let bystanderUser: { id: string; email: string; cookie: string };
  let testProblemId: string;
  let testContestId: string;
  let createdSubmissionId: string;

  beforeAll(async () => {
    const connected = await checkDatabaseConnection();
    if (!connected) {
      throw new Error('PostgreSQL is unreachable for E2E integration tests');
    }

    if (redisClient.status !== 'ready') {
      await redisClient.connect().catch(() => {});
    }

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
  });

  afterAll(async () => {
    if (createdSubmissionIds.length > 0) {
      await db
        .delete(submissions)
        .where(inArray(submissions.id, createdSubmissionIds))
        .catch(() => {});
    }
    if (createdContestIds.length > 0) {
      await db
        .delete(contestParticipants)
        .where(inArray(contestParticipants.contestId, createdContestIds))
        .catch(() => {});
      await db
        .delete(contestProblems)
        .where(inArray(contestProblems.contestId, createdContestIds))
        .catch(() => {});
      await db
        .delete(contests)
        .where(inArray(contests.id, createdContestIds))
        .catch(() => {});
    }
    if (createdProblemIds.length > 0) {
      await db
        .delete(problems)
        .where(inArray(problems.id, createdProblemIds))
        .catch(() => {});
    }
    if (createdUserIds.length > 0) {
      await db
        .delete(notifications)
        .where(inArray(notifications.userId, createdUserIds))
        .catch(() => {});
      await db
        .delete(users)
        .where(inArray(users.id, createdUserIds))
        .catch(() => {});
    }

    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
    await closeDatabase().catch(() => {});
  });

  // -------------------------------------------------------------
  // Workflow 1: Authentication & Authorization (Days 4, 18)
  // -------------------------------------------------------------
  it('E2E-01: Registers users and establishes HttpOnly JWT session cookies', async () => {
    // 1. Register regular participant
    const regRes = await apiRequest('POST', '/api/auth/register', {
      body: {
        username: `user_${runTag}`,
        email: `participant_${runTag}@judge.local`,
        password: 'Password123!',
      },
    });
    expect(regRes.status).toBe(201);
    const participantId = regRes.body.data.user.id;
    createdUserIds.push(participantId);

    // Login participant to get cookie
    const loginRes = await apiRequest('POST', '/api/auth/login', {
      body: {
        email: `participant_${runTag}@judge.local`,
        password: 'Password123!',
      },
    });
    expect(loginRes.status).toBe(200);
    const cookieHeader = loginRes.headers.get('set-cookie') || '';
    expect(cookieHeader).toContain('token=');
    expect(cookieHeader.toLowerCase()).toContain('httponly');

    const participantCookie = cookieHeader.split(';')[0];
    participantUser = {
      id: participantId,
      email: `participant_${runTag}@judge.local`,
      cookie: participantCookie,
    };

    // 2. Create Admin user directly in DB (with role: admin)
    const [adminDb] = await db
      .insert(users)
      .values({
        username: `admin_${runTag}`,
        email: `admin_${runTag}@judge.local`,
        passwordHash: '$2b$10$placeholderpasswordhashfornotifs',
        role: 'admin',
      })
      .returning();
    createdUserIds.push(adminDb.id);

    const jwtMod = await import('jsonwebtoken');
    const { env } = await import('../src/config/env.js');
    const adminToken = jwtMod.default.sign({ id: adminDb.id, role: 'admin' }, env.JWT_SECRET, {
      expiresIn: '1h',
    });
    adminUser = {
      id: adminDb.id,
      email: adminDb.email,
      cookie: `${env.AUTH_COOKIE_NAME}=${adminToken}`,
    };

    // 3. Create Bystander user (for isolation checks)
    const [bystanderDb] = await db
      .insert(users)
      .values({
        username: `bystander_${runTag}`,
        email: `bystander_${runTag}@judge.local`,
        passwordHash: '$2b$10$placeholderpasswordhashfornotifs',
        role: 'user',
      })
      .returning();
    createdUserIds.push(bystanderDb.id);
    const bystanderToken = jwtMod.default.sign(
      { id: bystanderDb.id, role: 'user' },
      env.JWT_SECRET,
      { expiresIn: '1h' }
    );
    bystanderUser = {
      id: bystanderDb.id,
      email: bystanderDb.email,
      cookie: `${env.AUTH_COOKIE_NAME}=${bystanderToken}`,
    };
  });

  it('E2E-02: Protects authenticated routes and verifies /api/auth/me', async () => {
    // Unauthenticated access fails with 401
    const unauthRes = await apiRequest('GET', '/api/auth/me');
    expect(unauthRes.status).toBe(401);

    // Authenticated access succeeds
    const authRes = await apiRequest('GET', '/api/auth/me', { cookie: participantUser.cookie });
    expect(authRes.status).toBe(200);
    expect(authRes.body.data.user.id).toBe(participantUser.id);
  });

  // -------------------------------------------------------------
  // Workflow 2: Problems & Admin Contest Creation (Days 5, 17, 18)
  // -------------------------------------------------------------
  it('E2E-03: Admin creates a contest with time-gated problem; non-admin is rejected', async () => {
    // 1. Create a problem
    const [prob] = await db
      .insert(problems)
      .values({
        title: `E2E Sum Problem ${runTag}`,
        slug: `e2e-sum-${runTag}`,
        statement: 'Calculate sum of two numbers',
        difficulty: 'easy',
        tags: ['math'],
        setterId: adminUser.id,
      })
      .returning();
    testProblemId = prob.id;
    createdProblemIds.push(prob.id);

    // 2. Regular user cannot create contest (403 Forbidden)
    const forbiddenRes = await apiRequest('POST', '/api/contests', {
      body: {
        title: `Forbidden Contest ${runTag}`,
        description: 'Should fail',
        startTime: new Date(Date.now() + 1000).toISOString(),
        endTime: new Date(Date.now() + 3600000).toISOString(),
        freezeMinutes: 0,
        problemIds: [testProblemId],
      },
      cookie: participantUser.cookie,
    });
    expect(forbiddenRes.status).toBe(403);

    // 3. Admin creates an upcoming contest (starts in 1.5 seconds)
    const createContestRes = await apiRequest('POST', '/api/contests', {
      body: {
        title: `E2E Live Contest ${runTag}`,
        description: 'Contest for end-to-end integration verification',
        startTime: new Date(Date.now() + 1500).toISOString(), // Starts in 1.5s
        endTime: new Date(Date.now() + 50 * 60000).toISOString(), // Ends in 50m
        freezeMinutes: 10,
        problemIds: [testProblemId],
      },
      cookie: adminUser.cookie,
    });
    expect(createContestRes.status).toBe(201);
    testContestId = createContestRes.body.data.contest.id;
    createdContestIds.push(testContestId);
  });

  // -------------------------------------------------------------
  // Workflow 3: Contest Registration & Notifications (Days 18, 20)
  // -------------------------------------------------------------
  it('E2E-04: User registers for upcoming contest and receives CONTEST_REGISTERED notification', async () => {
    // 1. Register participant while contest is upcoming
    const regContestRes = await apiRequest('POST', `/api/contests/${testContestId}/register`, {
      cookie: participantUser.cookie,
    });
    expect(regContestRes.status).toBe(200);
    expect(regContestRes.body.data.registered).toBe(true);

    // 2. Check notifications API
    const notifRes = await apiRequest('GET', '/api/notifications', {
      cookie: participantUser.cookie,
    });
    expect(notifRes.status).toBe(200);
    const notifs = notifRes.body.data.notifications;
    const regNotif = notifs.find((n: any) => n.type === 'CONTEST_REGISTERED');
    expect(regNotif).toBeDefined();
    expect(regNotif.data.contestId).toBe(testContestId);

    // 3. Check unread count
    const unreadRes = await apiRequest('GET', '/api/notifications/unread-count', {
      cookie: participantUser.cookie,
    });
    expect(unreadRes.status).toBe(200);
    expect(unreadRes.body.data.unreadCount).toBeGreaterThanOrEqual(1);

    // Fast-forward contest startTime to 10 seconds in the past so contest is now LIVE
    await db
      .update(contests)
      .set({ startTime: new Date(Date.now() - 10000) })
      .where(eq(contests.id, testContestId));
  });

  // -------------------------------------------------------------
  // Workflow 4: Contest Submission & Leaderboard Update (Days 18, 19)
  // -------------------------------------------------------------
  it('E2E-05: Submits solution within active contest and processes accepted verdict', async () => {
    // 1. Submit code for contest problem
    const subRes = await apiRequest('POST', '/api/submissions', {
      body: {
        problemId: testProblemId,
        contestId: testContestId,
        language: 'javascript',
        code: 'console.log("accepted");',
      },
      cookie: participantUser.cookie,
    });
    expect(subRes.status).toBe(202);
    expect(subRes.body.data.id).toBeDefined();
    createdSubmissionId = subRes.body.data.id;
    createdSubmissionIds.push(createdSubmissionId);
    expect(subRes.body.data.status).toBe(SubmissionStatus.QUEUED);

    // 2. Simulate worker completing evaluation with ACCEPTED verdict
    await db
      .update(submissions)
      .set({
        status: SubmissionStatus.COMPLETED,
        verdict: Verdict.ACCEPTED,
        executionTimeMs: 45,
        memoryUsedKb: 14200,
        updatedAt: new Date(),
      })
      .where(eq(submissions.id, createdSubmissionId));

    // 3. Trigger submission event notification handler
    const event: SubmissionEvent = {
      submissionId: createdSubmissionId,
      userId: participantUser.id,
      contestId: testContestId,
      status: Verdict.ACCEPTED,
      verdict: Verdict.ACCEPTED,
      executionTimeMs: 45,
      memoryUsedKb: 14200,
      timestamp: Date.now(),
    };
    await notificationsService.handleSubmissionVerdict(event);

    // 4. Verify contest leaderboard reflects the accepted solve
    const leaderboardRes = await apiRequest('GET', `/api/contests/${testContestId}/leaderboard`, {
      cookie: participantUser.cookie,
    });
    expect(leaderboardRes.status).toBe(200);
    const leaderboard = leaderboardRes.body.data.leaderboard;
    expect(Array.isArray(leaderboard)).toBe(true);
    const participantEntry = leaderboard.find((e: any) => e.userId === participantUser.id);
    expect(participantEntry).toBeDefined();
    expect(participantEntry.problemsSolved).toBe(1);
  });

  // -------------------------------------------------------------
  // Workflow 5: Notification Delivery & Read Lifecycle (Day 20)
  // -------------------------------------------------------------
  it('E2E-06: Verifies verdict notification and marks notification as read', async () => {
    // 1. Fetch notifications - should have CONTEST_SUBMISSION_VERDICT
    const notifRes = await apiRequest('GET', '/api/notifications', {
      cookie: participantUser.cookie,
    });
    expect(notifRes.status).toBe(200);
    const verdictNotif = notifRes.body.data.notifications.find(
      (n: any) => n.type === 'CONTEST_SUBMISSION_VERDICT'
    );
    expect(verdictNotif).toBeDefined();
    expect(verdictNotif.data.submissionId).toBe(createdSubmissionId);
    expect(verdictNotif.isRead).toBe(false);

    // 2. Mark this notification as read
    const markRes = await apiRequest('PATCH', `/api/notifications/${verdictNotif.id}/read`, {
      cookie: participantUser.cookie,
    });
    expect(markRes.status).toBe(200);
    expect(markRes.body.data.isRead).toBe(true);

    // 3. Verify notification is now marked read
    const verifyNotifRes = await apiRequest('GET', '/api/notifications', {
      cookie: participantUser.cookie,
    });
    const updatedNotif = verifyNotifRes.body.data.notifications.find(
      (n: any) => n.id === verdictNotif.id
    );
    expect(updatedNotif.isRead).toBe(true);
  });

  // -------------------------------------------------------------
  // Workflow 6: Activity Feed & Security Isolation (Day 20)
  // -------------------------------------------------------------
  it('E2E-07: Verifies activity feed and strict user isolation', async () => {
    // 1. Participant fetches own activity feed
    const activityRes = await apiRequest('GET', '/api/notifications/activity?limit=10&offset=0', {
      cookie: participantUser.cookie,
    });
    expect(activityRes.status).toBe(200);
    const items = activityRes.body.data.activity;
    expect(items.length).toBeGreaterThanOrEqual(1);

    // 2. Bystander user checks notifications - should have 0 notifications
    const bystanderNotifRes = await apiRequest('GET', '/api/notifications', {
      cookie: bystanderUser.cookie,
    });
    expect(bystanderNotifRes.status).toBe(200);
    expect(bystanderNotifRes.body.data.notifications).toHaveLength(0);

    // 3. Bystander cannot mark Participant's notification as read (404 Not Found)
    const notifs = (
      await apiRequest('GET', '/api/notifications', { cookie: participantUser.cookie })
    ).body.data.notifications;
    const targetNotifId = notifs[0].id;

    const crossUserRes = await apiRequest('PATCH', `/api/notifications/${targetNotifId}/read`, {
      cookie: bystanderUser.cookie,
    });
    expect(crossUserRes.status).toBe(404);
  });

  // -------------------------------------------------------------
  // Workflow 7: Lifecycle Recovery & Idempotency (Day 20C)
  // -------------------------------------------------------------
  it('E2E-08: Sweeper runs idempotently and recovers missed contest lifecycle notifications', async () => {
    // Run lifecycle sweeper
    const sweepRes = await notificationsService.checkAndDispatchContestLifecycleNotifications();
    expect(sweepRes).toBeDefined();

    // Verify participant received CONTEST_STARTED (since contest has started)
    const startedNotif = await db
      .select()
      .from(notifications)
      .where(eq(notifications.idempotencyKey, `started:${testContestId}`));
    expect(startedNotif).toHaveLength(1);
    expect(startedNotif[0].userId).toBe(participantUser.id);

    // Rerunning sweeper is strictly idempotent (0 duplicate rows created)
    await notificationsService.checkAndDispatchContestLifecycleNotifications();
    const countCheck = await db
      .select()
      .from(notifications)
      .where(eq(notifications.idempotencyKey, `started:${testContestId}`));
    expect(countCheck).toHaveLength(1);
  });
});
