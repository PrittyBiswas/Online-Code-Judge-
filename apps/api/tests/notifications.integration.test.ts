import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import crypto from 'crypto';
import { eq, inArray } from 'drizzle-orm';
import { db, checkDatabaseConnection, closeDatabase } from '../src/db/index.js';
import {
  users,
  notifications,
  contests,
  contestParticipants,
  problems,
  submissions,
} from '../src/db/schema.js';
import { notificationsService } from '../src/modules/notifications/notifications.service.js';
import { app } from '../src/app.js';
import jwt from 'jsonwebtoken';
import { env } from '../src/config/env.js';

import type { Server } from 'http';

describe('Day 20B Notifications & Reliability Integration Tests (PostgreSQL & Redis)', () => {
  const runTag = `${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
  const createdUserIds: string[] = [];
  const createdContestIds: string[] = [];
  const createdProblemIds: string[] = [];
  const createdSubmissionIds: string[] = [];

  let server: Server;
  let baseUrl: string;
  let userAId: string;
  let userBId: string;

  beforeAll(async () => {
    const connected = await checkDatabaseConnection();
    if (!connected) {
      throw new Error('PostgreSQL is unreachable for integration tests. Verify DATABASE_URL.');
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

    // Create 2 test users
    const [userA] = await db
      .insert(users)
      .values({
        username: `notif_user_a_${runTag}`,
        email: `notif_user_a_${runTag}@judge.local`,
        passwordHash: '$2b$10$placeholderpasswordhashfornotifs',
        role: 'user',
      })
      .returning();
    userAId = userA.id;
    createdUserIds.push(userAId);

    const [userB] = await db
      .insert(users)
      .values({
        username: `notif_user_b_${runTag}`,
        email: `notif_user_b_${runTag}@judge.local`,
        passwordHash: '$2b$10$placeholderpasswordhashfornotifs',
        role: 'user',
      })
      .returning();
    userBId = userB.id;
    createdUserIds.push(userBId);
  });

  afterAll(async () => {
    if (createdSubmissionIds.length > 0) {
      await db.delete(submissions).where(inArray(submissions.id, createdSubmissionIds));
    }
    if (createdContestIds.length > 0) {
      await db
        .delete(contestParticipants)
        .where(inArray(contestParticipants.contestId, createdContestIds));
      await db.delete(contests).where(inArray(contests.id, createdContestIds));
    }
    if (createdProblemIds.length > 0) {
      await db.delete(problems).where(inArray(problems.id, createdProblemIds));
    }
    if (createdUserIds.length > 0) {
      await db.delete(notifications).where(inArray(notifications.userId, createdUserIds));
      await db.delete(users).where(inArray(users.id, createdUserIds));
    }
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
    await closeDatabase();
  });

  it('1. Enforces database-level idempotency on concurrent creation (uq_notifications_user_idempotency)', async () => {
    const idempotencyKey = `test_concurrent_${runTag}`;

    // Fire 5 concurrent creation calls with the exact same userId and idempotencyKey
    const results = await Promise.all([
      notificationsService.createNotification({
        userId: userAId,
        type: 'CONTEST_REGISTERED',
        title: 'Registration Confirmed',
        message: 'You have registered for the contest',
        idempotencyKey,
      }),
      notificationsService.createNotification({
        userId: userAId,
        type: 'CONTEST_REGISTERED',
        title: 'Registration Confirmed',
        message: 'You have registered for the contest',
        idempotencyKey,
      }),
      notificationsService.createNotification({
        userId: userAId,
        type: 'CONTEST_REGISTERED',
        title: 'Registration Confirmed',
        message: 'You have registered for the contest',
        idempotencyKey,
      }),
      notificationsService.createNotification({
        userId: userAId,
        type: 'CONTEST_REGISTERED',
        title: 'Registration Confirmed',
        message: 'You have registered for the contest',
        idempotencyKey,
      }),
      notificationsService.createNotification({
        userId: userAId,
        type: 'CONTEST_REGISTERED',
        title: 'Registration Confirmed',
        message: 'You have registered for the contest',
        idempotencyKey,
      }),
    ]);

    // All should succeed and return the same notification ID
    const firstId = results[0].id;
    for (const res of results) {
      expect(res.id).toBe(firstId);
      expect(res.userId).toBe(userAId);
    }

    // Verify exactly 1 record in PostgreSQL
    const rows = await db
      .select()
      .from(notifications)
      .where(eq(notifications.idempotencyKey, idempotencyKey));
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(firstId);
  });

  it('2. Multi-submission notification creation: distinct submissions receive distinct notifications', async () => {
    const sub1Id = crypto.randomUUID();
    const sub2Id = crypto.randomUUID();

    const notif1 = await notificationsService.createNotification({
      userId: userAId,
      type: 'CONTEST_SUBMISSION_VERDICT',
      title: 'Verdict: Accepted',
      message: 'Problem Two Sum: AC',
      idempotencyKey: `sub_verdict:${sub1Id}`,
      data: { submissionId: sub1Id, verdict: 'AC' },
    });

    const notif2 = await notificationsService.createNotification({
      userId: userAId,
      type: 'CONTEST_SUBMISSION_VERDICT',
      title: 'Verdict: Wrong Answer',
      message: 'Problem Two Sum: WA',
      idempotencyKey: `sub_verdict:${sub2Id}`,
      data: { submissionId: sub2Id, verdict: 'WA' },
    });

    expect(notif1.id).not.toBe(notif2.id);

    // Re-delivering sub1 verdict returns identical notif1
    const notif1Redelivery = await notificationsService.createNotification({
      userId: userAId,
      type: 'CONTEST_SUBMISSION_VERDICT',
      title: 'Verdict: Accepted',
      message: 'Problem Two Sum: AC',
      idempotencyKey: `sub_verdict:${sub1Id}`,
      data: { submissionId: sub1Id, verdict: 'AC' },
    });
    expect(notif1Redelivery.id).toBe(notif1.id);
  });

  it('3. User isolation: User A cannot read or mark as read User B notification', async () => {
    const userBNotif = await notificationsService.createNotification({
      userId: userBId,
      type: 'CONTEST_STARTED',
      title: 'Contest Started',
      message: 'Contest is now live',
      idempotencyKey: `started_contest_${runTag}`,
    });

    // User A attempts to mark User B's notification as read
    await expect(notificationsService.markAsRead(userAId, userBNotif.id)).rejects.toThrow(
      'Notification not found'
    );

    // User B successfully marks it as read
    const marked = await notificationsService.markAsRead(userBId, userBNotif.id);
    expect(marked.isRead).toBe(true);

    // Verify in database
    const [row] = await db.select().from(notifications).where(eq(notifications.id, userBNotif.id));
    expect(row.isRead).toBe(true);
  });

  it('4. User feed isolation: User A only sees User A notifications', async () => {
    const userAList = await notificationsService.getUserNotifications(userAId);
    const userBList = await notificationsService.getUserNotifications(userBId);

    expect(userAList.notifications.every((n) => n.userId === userAId)).toBe(true);
    expect(userBList.notifications.every((n) => n.userId === userBId)).toBe(true);
  });

  it('5. Unread count is strictly isolated per user', async () => {
    const unreadA = await notificationsService.getUnreadCount(userAId);
    const unreadB = await notificationsService.getUnreadCount(userBId);

    expect(typeof unreadA.unreadCount).toBe('number');
    expect(unreadA.unreadCount).toBeGreaterThanOrEqual(1);
    expect(unreadB.unreadCount).toBe(0); // userB marked their only notification as read
  });

  it('6. Mark all as read updates only the target user records', async () => {
    // Add another unread notification for user B
    await notificationsService.createNotification({
      userId: userBId,
      type: 'CONTEST_ENDING_SOON',
      title: '15 Minutes Left',
      message: 'Hurry up',
      idempotencyKey: `ending_soon_${runTag}`,
    });

    const unreadBBefore = await notificationsService.getUnreadCount(userBId);
    expect(unreadBBefore.unreadCount).toBe(1);

    // Mark all as read for User A
    const countA = await notificationsService.markAllAsRead(userAId);
    expect(countA.success).toBe(true);
    expect(countA.updatedCount).toBeGreaterThanOrEqual(1);

    // User A unread count should be 0
    const unreadAAfter = await notificationsService.getUnreadCount(userAId);
    expect(unreadAAfter.unreadCount).toBe(0);

    // User B unread count should still be 1 (unaffected by User A mark all)
    const unreadBAfter = await notificationsService.getUnreadCount(userBId);
    expect(unreadBAfter.unreadCount).toBe(1);
  });

  it('7. Extended downtime recovery: recovers CONTEST_STARTED after 35m+ / multi-hour scheduler downtime', async () => {
    // Create a contest that started 2 hours ago and ends in 1 hour
    const [contestStarted2hAgo] = await db
      .insert(contests)
      .values({
        title: `Downtime Recovery Contest ${runTag}`,
        startTime: new Date(Date.now() - 2 * 60 * 60 * 1000), // 2 hours ago
        endTime: new Date(Date.now() + 1 * 60 * 60 * 1000), // ends in 1 hour
        createdBy: userAId,
      })
      .returning();
    createdContestIds.push(contestStarted2hAgo.id);

    // Register User A to this contest
    await db.insert(contestParticipants).values({
      contestId: contestStarted2hAgo.id,
      userId: userAId,
    });

    // Verify User A does NOT have started notification yet
    const notifsBefore = await db
      .select()
      .from(notifications)
      .where(eq(notifications.idempotencyKey, `started:${contestStarted2hAgo.id}`));
    expect(notifsBefore).toHaveLength(0);

    // Trigger sweeper (simulating API coming back online after extended downtime)
    await notificationsService.checkAndDispatchContestLifecycleNotifications();

    // Verify User A now has CONTEST_STARTED notification (recovered!)
    const notifsAfter = await db
      .select()
      .from(notifications)
      .where(eq(notifications.idempotencyKey, `started:${contestStarted2hAgo.id}`));
    expect(notifsAfter).toHaveLength(1);
    expect(notifsAfter[0].type).toBe('CONTEST_STARTED');
    expect(notifsAfter[0].userId).toBe(userAId);

    // Re-running sweep does NOT duplicate the notification
    await notificationsService.checkAndDispatchContestLifecycleNotifications();
    const notifsAfterRerun = await db
      .select()
      .from(notifications)
      .where(eq(notifications.idempotencyKey, `started:${contestStarted2hAgo.id}`));
    expect(notifsAfterRerun).toHaveLength(1);
  });

  it('8. Extended downtime recovery: recovers CONTEST_ENDED even if scheduler was down during contest conclusion', async () => {
    // Create a contest that ended 3 hours ago
    const [contestEnded3hAgo] = await db
      .insert(contests)
      .values({
        title: `Ended Contest Downtime ${runTag}`,
        startTime: new Date(Date.now() - 5 * 60 * 60 * 1000), // 5 hours ago
        endTime: new Date(Date.now() - 3 * 60 * 60 * 1000), // ended 3 hours ago
        createdBy: userBId,
      })
      .returning();
    createdContestIds.push(contestEnded3hAgo.id);

    // Register User B
    await db.insert(contestParticipants).values({
      contestId: contestEnded3hAgo.id,
      userId: userBId,
    });

    // Run sweeper (recovery)
    await notificationsService.checkAndDispatchContestLifecycleNotifications();

    // Verify User B received CONTEST_ENDED notification
    const endedNotifs = await db
      .select()
      .from(notifications)
      .where(eq(notifications.idempotencyKey, `ended:${contestEnded3hAgo.id}`));
    expect(endedNotifs).toHaveLength(1);
    expect(endedNotifs[0].type).toBe('CONTEST_ENDED');
    expect(endedNotifs[0].userId).toBe(userBId);
  });

  it('9. Submission verdict reconciliation: recovers missing verdict notifications without Pub/Sub', async () => {
    // Create problem and contest
    const [prob] = await db
      .insert(problems)
      .values({
        title: `Reconcile Problem ${runTag}`,
        slug: `reconcile-prob-${runTag}`,
        statement: 'Problem for reconciliation test',
        difficulty: 'easy',
        tags: ['test'],
        setterId: userAId,
      })
      .returning();
    createdProblemIds.push(prob.id);

    const [contest] = await db
      .insert(contests)
      .values({
        title: `Reconcile Contest ${runTag}`,
        startTime: new Date(Date.now() - 3600000),
        endTime: new Date(Date.now() + 3600000),
        createdBy: userAId,
      })
      .returning();
    createdContestIds.push(contest.id);

    // Insert completed submission directly into PostgreSQL (simulating verdict persisted but Pub/Sub lost)
    const [sub] = await db
      .insert(submissions)
      .values({
        userId: userAId,
        contestId: contest.id,
        problemId: prob.id,
        language: 'javascript',
        code: 'console.log("hello");',
        status: 'COMPLETED',
        verdict: 'ACCEPTED',
        executionTimeMs: 30,
        memoryUsedKb: 2048,
      })
      .returning();
    createdSubmissionIds.push(sub.id);

    // Verify no notification currently exists for this submission
    const beforeReconcile = await db
      .select()
      .from(notifications)
      .where(eq(notifications.idempotencyKey, `sub_verdict:${sub.id}`));
    expect(beforeReconcile).toHaveLength(0);

    // Run reconciliation
    const reconRes = await notificationsService.reconcilePendingSubmissionVerdictNotifications();
    expect(reconRes.reconciledCount).toBeGreaterThanOrEqual(1);

    // Verify notification was created
    const afterReconcile = await db
      .select()
      .from(notifications)
      .where(eq(notifications.idempotencyKey, `sub_verdict:${sub.id}`));
    expect(afterReconcile).toHaveLength(1);
    expect(afterReconcile[0].type).toBe('CONTEST_SUBMISSION_VERDICT');
    expect(afterReconcile[0].userId).toBe(userAId);

    // Second run is a no-op (idempotent, 0 duplicates)
    const rerun = await notificationsService.reconcilePendingSubmissionVerdictNotifications();
    expect(rerun.reconciledCount).toBe(0);
  });

  it('10. Scalable activity feed: supports bounded limit, offset pagination, and deterministic ordering', async () => {
    // Fetch page 1 (limit 2, offset 0)
    const page1 = await notificationsService.getUserContestActivity(userAId, {
      limit: 2,
      offset: 0,
    });
    expect(page1.length).toBeLessThanOrEqual(2);

    // Fetch page 2 (limit 2, offset 2)
    const page2 = await notificationsService.getUserContestActivity(userAId, {
      limit: 2,
      offset: 2,
    });

    // Ensure no overlapping IDs between distinct pages
    const page1Ids = page1.map((p) => p.id);
    for (const item of page2) {
      expect(page1Ids).not.toContain(item.id);
    }
  });

  it('11. Canonical route integration: PATCH /api/notifications/read-all marks all notifications as read', async () => {
    // Create an unread notification for user A
    await notificationsService.createNotification({
      userId: userAId,
      type: 'CONTEST_REGISTERED',
      title: 'Canonical Test',
      message: 'Unread test notification',
      idempotencyKey: `canonical_test_${runTag}`,
    });

    const token = jwt.sign({ id: userAId, role: 'user' }, env.JWT_SECRET, { expiresIn: '15m' });
    const cookie = `${env.AUTH_COOKIE_NAME}=${token}`;

    // Invoke canonical PATCH /api/notifications/read-all via HTTP
    const res = await fetch(`${baseUrl}/api/notifications/read-all`, {
      method: 'PATCH',
      headers: {
        Cookie: cookie,
      },
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.data.success).toBe(true);

    // Verify unread count is now 0
    const unread = await notificationsService.getUnreadCount(userAId);
    expect(unread.unreadCount).toBe(0);
  });

  it('12. Day 20C Issue 1: Recovers BOTH CONTEST_STARTED and CONTEST_ENDED when contest started and ended during scheduler downtime', async () => {
    // Create a contest that started 4 hours ago and ended 2 hours ago
    const [downtimeContest] = await db
      .insert(contests)
      .values({
        title: `Full Missed Contest ${runTag}`,
        startTime: new Date(Date.now() - 4 * 60 * 60 * 1000), // 4 hours ago
        endTime: new Date(Date.now() - 2 * 60 * 60 * 1000), // 2 hours ago
        createdBy: userAId,
      })
      .returning();
    createdContestIds.push(downtimeContest.id);

    // Register User A
    await db.insert(contestParticipants).values({
      contestId: downtimeContest.id,
      userId: userAId,
    });

    // Run sweeper (simulating scheduler recovery)
    await notificationsService.checkAndDispatchContestLifecycleNotifications();

    // Verify User A receives BOTH CONTEST_STARTED and CONTEST_ENDED
    const startedNotifs = await db
      .select()
      .from(notifications)
      .where(eq(notifications.idempotencyKey, `started:${downtimeContest.id}`));
    expect(startedNotifs).toHaveLength(1);
    expect(startedNotifs[0].type).toBe('CONTEST_STARTED');
    expect(startedNotifs[0].userId).toBe(userAId);

    const endedNotifs = await db
      .select()
      .from(notifications)
      .where(eq(notifications.idempotencyKey, `ended:${downtimeContest.id}`));
    expect(endedNotifs).toHaveLength(1);
    expect(endedNotifs[0].type).toBe('CONTEST_ENDED');
    expect(endedNotifs[0].userId).toBe(userAId);

    // Verify approaching and ending-soon were NOT created (past window)
    const approachingNotifs = await db
      .select()
      .from(notifications)
      .where(eq(notifications.idempotencyKey, `approaching:${downtimeContest.id}`));
    expect(approachingNotifs).toHaveLength(0);

    const endingSoonNotifs = await db
      .select()
      .from(notifications)
      .where(eq(notifications.idempotencyKey, `ending_soon:${downtimeContest.id}`));
    expect(endingSoonNotifs).toHaveLength(0);

    // Re-running sweep does NOT duplicate either notification
    await notificationsService.checkAndDispatchContestLifecycleNotifications();
    const startedRerun = await db
      .select()
      .from(notifications)
      .where(eq(notifications.idempotencyKey, `started:${downtimeContest.id}`));
    expect(startedRerun).toHaveLength(1);

    const endedRerun = await db
      .select()
      .from(notifications)
      .where(eq(notifications.idempotencyKey, `ended:${downtimeContest.id}`));
    expect(endedRerun).toHaveLength(1);
  });

  it('13. Day 20C Issue 3: Reconciles completed submissions older than 2 hours with multi-batch continuation', async () => {
    // Create problem and contest
    const [prob] = await db
      .insert(problems)
      .values({
        title: `Old Submissions Problem ${runTag}`,
        slug: `old-subs-prob-${runTag}`,
        statement: 'Problem for old submission reconciliation test',
        difficulty: 'medium',
        tags: ['test'],
        setterId: userAId,
      })
      .returning();
    createdProblemIds.push(prob.id);

    const [contest] = await db
      .insert(contests)
      .values({
        title: `Old Submissions Contest ${runTag}`,
        startTime: new Date(Date.now() - 10 * 3600000),
        endTime: new Date(Date.now() + 3600000),
        createdBy: userAId,
      })
      .returning();
    createdContestIds.push(contest.id);

    // Insert 2 completed submissions: one 6 hours old (well beyond previous 2-hour window) and one 4 hours old
    const [oldSub1] = await db
      .insert(submissions)
      .values({
        userId: userBId,
        contestId: contest.id,
        problemId: prob.id,
        language: 'python',
        code: 'print(42)',
        status: 'COMPLETED',
        verdict: 'ACCEPTED',
        createdAt: new Date(Date.now() - 6 * 3600000),
        updatedAt: new Date(Date.now() - 6 * 3600000),
      })
      .returning();
    createdSubmissionIds.push(oldSub1.id);

    const [oldSub2] = await db
      .insert(submissions)
      .values({
        userId: userBId,
        contestId: contest.id,
        problemId: prob.id,
        language: 'python',
        code: 'print(99)',
        status: 'COMPLETED',
        verdict: 'WRONG_ANSWER',
        createdAt: new Date(Date.now() - 4 * 3600000),
        updatedAt: new Date(Date.now() - 4 * 3600000),
      })
      .returning();
    createdSubmissionIds.push(oldSub2.id);

    // Reconcile with batchSize=1 to prove continuation across multiple batches
    const reconRes = await notificationsService.reconcilePendingSubmissionVerdictNotifications({
      batchSize: 1,
      maxBatches: 10,
    });
    expect(reconRes.reconciledCount).toBeGreaterThanOrEqual(2);

    // Verify both submissions received notifications
    const notif1 = await db
      .select()
      .from(notifications)
      .where(eq(notifications.idempotencyKey, `sub_verdict:${oldSub1.id}`));
    expect(notif1).toHaveLength(1);
    expect(notif1[0].userId).toBe(userBId);

    const notif2 = await db
      .select()
      .from(notifications)
      .where(eq(notifications.idempotencyKey, `sub_verdict:${oldSub2.id}`));
    expect(notif2).toHaveLength(1);
    expect(notif2[0].userId).toBe(userBId);

    // Second run produces 0 duplicates
    const rerun = await notificationsService.reconcilePendingSubmissionVerdictNotifications({
      batchSize: 1,
    });
    expect(rerun.reconciledCount).toBe(0);
  });

  it('14. Day 20C Issue 4: HTTP endpoint GET /api/notifications/activity validates and bounds offset and limit', async () => {
    const token = jwt.sign({ id: userAId, role: 'user' }, env.JWT_SECRET, { expiresIn: '15m' });
    const cookie = `${env.AUTH_COOKIE_NAME}=${token}`;

    // Test offset > 1000 returns 400
    const resOverOffset = await fetch(`${baseUrl}/api/notifications/activity?offset=1001`, {
      headers: { Cookie: cookie },
    });
    expect(resOverOffset.status).toBe(400);

    // Test negative offset returns 400
    const resNegativeOffset = await fetch(`${baseUrl}/api/notifications/activity?offset=-5`, {
      headers: { Cookie: cookie },
    });
    expect(resNegativeOffset.status).toBe(400);

    // Test limit > 50 returns 400
    const resOverLimit = await fetch(`${baseUrl}/api/notifications/activity?limit=51`, {
      headers: { Cookie: cookie },
    });
    expect(resOverLimit.status).toBe(400);

    // Test valid boundary params returns 200
    const resValid = await fetch(`${baseUrl}/api/notifications/activity?offset=0&limit=20`, {
      headers: { Cookie: cookie },
    });
    expect(resValid.status).toBe(200);
    const body = (await resValid.json()) as any;
    expect(Array.isArray(body.data.activity)).toBe(true);
  });
});
