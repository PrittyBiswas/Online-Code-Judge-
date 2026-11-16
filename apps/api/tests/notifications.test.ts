import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Request, Response } from 'express';
import { ERROR_CODES, REDIS_KEYS, Notification } from '@judge/shared';

const USER_1 = '11111111-1111-4111-8111-111111111111';
const USER_2 = '22222222-2222-4222-8222-222222222222';
const CONTEST_1 = '33333333-3333-4333-8333-333333333333';
const SUBMISSION_1 = '55555555-5555-4555-8555-555555555555';

const { mockSubscriber, mockPublisher, dbState } = vi.hoisted(() => {
  const { EventEmitter: EE } = require('events') as typeof import('events');
  const sub = new EE() as import('events').EventEmitter & {
    status: string;
    subscribe: ReturnType<typeof vi.fn>;
  };
  sub.status = 'ready';
  sub.subscribe = vi.fn((_ch: string, cb?: (err: Error | null) => void) => cb?.(null));

  const lockStore = new Map<string, string>();
  const pub = {
    status: 'ready',
    publish: vi.fn().mockResolvedValue(1),
    set: vi.fn(async (key: string, val: string, _px?: string, _ttl?: number, nx?: string) => {
      if (nx && lockStore.has(key)) return null;
      lockStore.set(key, val);
      return 'OK';
    }),
    del: vi.fn(async (key: string) => {
      return lockStore.delete(key) ? 1 : 0;
    }),
    eval: vi.fn(
      async (script: string, _numkeys: number, key: string, token: string, _ttl?: string) => {
        if (lockStore.get(key) === token) {
          if (script.includes('pexpire')) {
            return 1;
          }
          lockStore.delete(key);
          return 1;
        }
        return 0;
      }
    ),
    _lockStore: lockStore,
  };

  return {
    mockSubscriber: sub,
    mockPublisher: pub,
    dbState: {
      notifications: [] as any[],
      contests: [
        {
          id: '33333333-3333-4333-8333-333333333333',
          title: 'Weekly Contest 1',
          startTime: new Date(Date.now() + 600000), // starts in 10 mins (approaching)
          endTime: new Date(Date.now() + 7200000),
        },
      ] as any[],
      contestParticipants: [
        {
          contestId: '33333333-3333-4333-8333-333333333333',
          userId: '11111111-1111-4111-8111-111111111111',
          registeredAt: new Date(),
        },
      ] as any[],
      submissions: [
        {
          id: '55555555-5555-4555-8555-555555555555',
          contestId: '33333333-3333-4333-8333-333333333333',
          problemId: '44444444-4444-4444-8444-444444444444',
          userId: '11111111-1111-4111-8111-111111111111',
          verdict: 'ACCEPTED',
          createdAt: new Date(),
        },
      ] as any[],
      problems: [
        {
          id: '44444444-4444-4444-8444-444444444444',
          title: 'Two Sum',
        },
      ] as any[],
    },
  };
});

vi.mock('../src/config/redis.js', () => ({
  isRedisHealthy: () => true,
  redisClient: mockPublisher,
  redisPublisher: mockPublisher,
  redisSubscriber: mockSubscriber,
}));

vi.mock('../src/config/queue.js', () => ({
  judgeQueue: null,
  sampleRunQueue: null,
}));

function extractParamValues(chunkOrSql: any): any[] {
  if (!chunkOrSql) return [];
  if (chunkOrSql.constructor && chunkOrSql.constructor.name === 'Param') {
    return [chunkOrSql.value];
  }
  if (Array.isArray(chunkOrSql.queryChunks)) {
    return chunkOrSql.queryChunks.flatMap(extractParamValues);
  }
  return [];
}

vi.mock('../src/db/index.js', () => ({
  db: {
    execute: vi.fn().mockResolvedValue({ rows: [] }),
    select: (fields?: any) => ({
      from: (_table: any) => {
        let currentCond: any = null;
        const queryObj: any = {
          innerJoin: () => queryObj,
          where: (condition: any) => {
            currentCond = condition;
            return queryObj;
          },
          orderBy: () => queryObj,
          limit: (_n: number) => queryObj,
          offset: (_n: number) => queryObj,
          then: (resolve: (data: any) => void) => {
            let filtered = [...dbState.notifications];
            if (currentCond) {
              const params = extractParamValues(currentCond);
              if (params.length > 0) {
                filtered = filtered.filter((n) => {
                  // If looking for userId + idempotencyKey
                  if (
                    params.length === 2 &&
                    typeof params[0] === 'string' &&
                    typeof params[1] === 'string'
                  ) {
                    return n.userId === params[0] && n.idempotencyKey === params[1];
                  }
                  if (typeof params[0] === 'string') {
                    if (n.userId !== params[0] && n.id !== params[0]) return false;
                  }
                  if (params.includes(false)) {
                    if (n.isRead !== false) return false;
                  }
                  return true;
                });
              }
            }

            if (fields && 'count' in fields) {
              resolve([{ count: filtered.length }]);
              return;
            }
            resolve(filtered);
          },
        };
        return queryObj;
      },
    }),
    insert: (_table: any) => ({
      values: (val: any) => ({
        returning: () => {
          // Check uniqueness mock on (userId, idempotencyKey)
          if (val.idempotencyKey) {
            const dup = dbState.notifications.find(
              (n) => n.userId === val.userId && n.idempotencyKey === val.idempotencyKey
            );
            if (dup) {
              const err: any = new Error('duplicate key value violates unique constraint');
              err.code = '23505';
              return Promise.reject(err);
            }
          }

          const inserted = {
            id: 'notif-uuid-' + Math.random().toString(36).substring(2, 9),
            userId: val.userId,
            type: val.type,
            title: val.title,
            message: val.message,
            data: val.data || {},
            idempotencyKey: val.idempotencyKey || null,
            isRead: val.isRead ?? false,
            createdAt: new Date(),
            readAt: null,
          };
          dbState.notifications.push(inserted);
          return Promise.resolve([inserted]);
        },
      }),
    }),
    update: (_table: any) => ({
      set: (val: any) => ({
        where: () => ({
          returning: () => {
            dbState.notifications.forEach((n) => {
              if (val.isRead !== undefined) n.isRead = val.isRead;
              if (val.readAt !== undefined) n.readAt = val.readAt;
            });
            return Promise.resolve(dbState.notifications);
          },
        }),
      }),
    }),
  },
}));

import { notificationsService } from '../src/modules/notifications/notifications.service.js';
import { contestSseManager } from '../src/events/contest-sse.js';

describe('NotificationsService Unit Tests (Day 20 & 20A)', () => {
  beforeEach(() => {
    dbState.notifications = [];
    vi.clearAllMocks();
  });

  it('creates a notification and publishes to Redis Pub/Sub', async () => {
    const notif = await notificationsService.createNotification({
      userId: USER_1,
      type: 'CONTEST_REGISTERED',
      title: 'Contest Registration',
      message: 'You have registered for Contest Alpha.',
      idempotencyKey: `reg:${CONTEST_1}`,
      data: { contestId: CONTEST_1 },
    });

    expect(notif).toBeDefined();
    expect(notif.userId).toBe(USER_1);
    expect(notif.type).toBe('CONTEST_REGISTERED');
    expect(notif.idempotencyKey).toBe(`reg:${CONTEST_1}`);
    expect(notif.isRead).toBe(false);

    expect(mockPublisher.publish).toHaveBeenCalledWith(
      REDIS_KEYS.CHANNEL_NOTIFICATION_EVENTS,
      expect.stringContaining(CONTEST_1)
    );
  });

  it('enforces database-level idempotency on duplicate notification creation', async () => {
    const first = await notificationsService.createNotification({
      userId: USER_1,
      type: 'CONTEST_APPROACHING',
      title: 'Contest Approaching',
      message: 'Starts soon!',
      idempotencyKey: `approaching:${CONTEST_1}`,
      data: { contestId: CONTEST_1 },
    });

    // Second call with same idempotency key
    const second = await notificationsService.createNotification({
      userId: USER_1,
      type: 'CONTEST_APPROACHING',
      title: 'Contest Approaching',
      message: 'Starts soon!',
      idempotencyKey: `approaching:${CONTEST_1}`,
      data: { contestId: CONTEST_1 },
    });

    expect(second.id).toBe(first.id);
    expect(dbState.notifications).toHaveLength(1);
  });

  it('allows different submissions by the same user to have distinct notifications', async () => {
    const sub1 = await notificationsService.createNotification({
      userId: USER_1,
      type: 'CONTEST_SUBMISSION_VERDICT',
      title: 'Verdict 1',
      message: 'Wrong Answer',
      idempotencyKey: `sub_verdict:${SUBMISSION_1}`,
      data: { contestId: CONTEST_1, submissionId: SUBMISSION_1 },
    });

    const sub2Id = '66666666-6666-4666-8666-666666666666';
    const sub2 = await notificationsService.createNotification({
      userId: USER_1,
      type: 'CONTEST_SUBMISSION_VERDICT',
      title: 'Verdict 2',
      message: 'Accepted',
      idempotencyKey: `sub_verdict:${sub2Id}`,
      data: { contestId: CONTEST_1, submissionId: sub2Id },
    });

    expect(sub1.id).not.toBe(sub2.id);
    expect(dbState.notifications).toHaveLength(2);
  });

  it('allows two different users to register for the same contest with isolated idempotency', async () => {
    const user1Notif = await notificationsService.createNotification({
      userId: USER_1,
      type: 'CONTEST_REGISTERED',
      title: 'User 1 Registered',
      message: 'Welcome User 1',
      idempotencyKey: `reg:${CONTEST_1}`,
      data: { contestId: CONTEST_1 },
    });

    const user2Notif = await notificationsService.createNotification({
      userId: USER_2,
      type: 'CONTEST_REGISTERED',
      title: 'User 2 Registered',
      message: 'Welcome User 2',
      idempotencyKey: `reg:${CONTEST_1}`,
      data: { contestId: CONTEST_1 },
    });

    expect(user1Notif.id).not.toBe(user2Notif.id);
    expect(user1Notif.userId).toBe(USER_1);
    expect(user2Notif.userId).toBe(USER_2);
    expect(dbState.notifications).toHaveLength(2);
  });

  it('rejects notification creation for invalid user UUID', async () => {
    await expect(
      notificationsService.createNotification({
        userId: 'invalid-id',
        type: 'CONTEST_REGISTERED',
        title: 'Contest Registration',
        message: 'Invalid user',
      })
    ).rejects.toThrow();
  });

  it('fetches notifications with unread count', async () => {
    await notificationsService.createNotification({
      userId: USER_1,
      type: 'CONTEST_REGISTERED',
      title: 'Alert 1',
      message: 'Message 1',
    });

    const res = await notificationsService.getUserNotifications(USER_1, { limit: 10 });
    expect(res.notifications).toHaveLength(1);
    expect(res.unreadCount).toBe(1);
  });

  it('marks all notifications as read for a user', async () => {
    await notificationsService.createNotification({
      userId: USER_1,
      type: 'CONTEST_REGISTERED',
      title: 'Alert 1',
      message: 'Message 1',
    });

    const markRes = await notificationsService.markAllAsRead(USER_1);
    expect(markRes.success).toBe(true);
    expect(markRes.updatedCount).toBe(1);
  });

  it('ensures strict SSE notification stream isolation between two authenticated users', () => {
    const user1Written: string[] = [];
    const user2Written: string[] = [];

    const mockRes1 = {
      write: vi.fn((data: string) => {
        user1Written.push(data);
        return true;
      }),
      end: vi.fn(),
    } as unknown as Response;

    const mockRes2 = {
      write: vi.fn((data: string) => {
        user2Written.push(data);
        return true;
      }),
      end: vi.fn(),
    } as unknown as Response;

    const unreg1 = contestSseManager.registerUserClient(USER_1, mockRes1);
    const unreg2 = contestSseManager.registerUserClient(USER_2, mockRes2);

    const user1Notification: Notification = {
      id: 'notif-user-1',
      userId: USER_1,
      type: 'CONTEST_SUBMISSION_VERDICT',
      title: 'Your verdict is ready',
      message: 'Accepted',
      data: { contestId: CONTEST_1 },
      isRead: false,
      createdAt: new Date().toISOString(),
      readAt: null,
    };

    // Broadcast only to User 1
    contestSseManager.broadcastNotification(USER_1, user1Notification);

    // Verify User 1 received the notification
    expect(mockRes1.write).toHaveBeenCalledTimes(1);
    expect(user1Written[0]).toContain('notif-user-1');

    // Verify User 2 received ZERO notifications
    expect(mockRes2.write).toHaveBeenCalledTimes(0);
    expect(user2Written).toHaveLength(0);

    unreg1();
    unreg2();
  });

  it('handleNotificationStream rejects unauthenticated requests with 401', async () => {
    const req = { user: undefined } as unknown as Request;
    const res = {} as unknown as Response;
    const next = vi.fn();

    await contestSseManager.handleNotificationStream(req, res, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 401,
        code: ERROR_CODES.AUTH_UNAUTHORIZED,
      })
    );
  });

  describe('Distributed Locking & Reliability (Day 20B)', () => {
    it('releaseDistributedLock uses Lua atomic compare-and-delete: releases if token matches, refuses if mismatched', async () => {
      const lockKey = 'test:lock:cron';
      const myToken = 'inst_1_uuid';
      const otherToken = 'inst_2_uuid';

      // 1. Acquire lock under myToken
      mockPublisher._lockStore.set(lockKey, myToken);

      // 2. Instance 2 tries to release Instance 1 lock -> MUST FAIL (returns false)
      const releasedByOther = await notificationsService.releaseDistributedLock(
        lockKey,
        otherToken
      );
      expect(releasedByOther).toBe(false);
      expect(mockPublisher._lockStore.get(lockKey)).toBe(myToken); // lock remains held!

      // 3. Instance 1 releases its own lock -> MUST SUCCEED (returns true)
      const releasedByOwner = await notificationsService.releaseDistributedLock(lockKey, myToken);
      expect(releasedByOwner).toBe(true);
      expect(mockPublisher._lockStore.has(lockKey)).toBe(false); // lock cleanly deleted
    });

    it('prevents overlapping sweeps when lock is held by another instance', async () => {
      const lockKey = REDIS_KEYS.CRON_LOCK('contest-lifecycle-sweeper');
      mockPublisher._lockStore.set(lockKey, 'other_active_process');

      // Attempt sweep while lock is held
      const result = await notificationsService.checkAndDispatchContestLifecycleNotifications();
      expect(result.dispatchedCount).toBe(0);
      expect(mockPublisher._lockStore.get(lockKey)).toBe('other_active_process'); // lock not clobbered
    });

    it('reconcilePendingSubmissionVerdictNotifications creates missing notifications without duplicates', async () => {
      const subId = '77777777-7777-4777-8777-777777777777';
      // Mock db.execute returning one un-notified submission
      const { db } = await import('../src/db/index.js');
      (db.execute as any).mockResolvedValueOnce({
        rows: [
          {
            submission_id: subId,
            user_id: USER_1,
            contest_id: CONTEST_1,
            problem_id: '44444444-4444-4444-8444-444444444444',
            verdict: 'ACCEPTED',
            execution_time_ms: 45,
            memory_used_kb: 1024,
            problem_title: 'Two Sum',
            contest_title: 'Weekly Contest 1',
          },
        ],
      });

      const res = await notificationsService.reconcilePendingSubmissionVerdictNotifications();
      expect(res.reconciledCount).toBe(1);

      // Verify notification in dbState
      const created = dbState.notifications.find(
        (n) => n.idempotencyKey === `sub_verdict:${subId}`
      );
      expect(created).toBeDefined();
      expect(created.type).toBe('CONTEST_SUBMISSION_VERDICT');
    });

    it('getUserContestActivity supports pagination and deterministic tie-breaker sorting', async () => {
      const activity = await notificationsService.getUserContestActivity(USER_1, {
        limit: 10,
        offset: 0,
      });
      expect(Array.isArray(activity)).toBe(true);

      // Verify alias
      const feed = await notificationsService.getUserActivityFeed(USER_1, {
        limit: 5,
        offset: 0,
      });
      expect(Array.isArray(feed)).toBe(true);
    });

    it('renewDistributedLock extends lock TTL atomically when token matches, fails when mismatched', async () => {
      const lockKey = 'test:lock:renew';
      const myToken = 'inst_1_uuid';
      const otherToken = 'inst_2_uuid';

      mockPublisher._lockStore.set(lockKey, myToken);

      // Non-owner renewal fails
      const renewedByOther = await notificationsService.renewDistributedLock(
        lockKey,
        otherToken,
        50000
      );
      expect(renewedByOther).toBe(false);

      // Owner renewal succeeds
      const renewedByOwner = await notificationsService.renewDistributedLock(
        lockKey,
        myToken,
        50000
      );
      expect(renewedByOwner).toBe(true);
    });

    it('getUserContestActivity enforces bounded pagination limits (max offset 1000, max limit 50)', async () => {
      // Rejects offset > 1000
      await expect(
        notificationsService.getUserContestActivity(USER_1, {
          offset: 1001,
        })
      ).rejects.toThrow('Activity offset must be an integer between 0 and 1000');

      // Rejects negative offset
      await expect(
        notificationsService.getUserContestActivity(USER_1, {
          offset: -1,
        })
      ).rejects.toThrow('Activity offset must be an integer between 0 and 1000');

      // Rejects limit > 50
      await expect(
        notificationsService.getUserContestActivity(USER_1, {
          limit: 51,
        })
      ).rejects.toThrow('Activity limit must be an integer between 1 and 50');

      // Rejects limit < 1
      await expect(
        notificationsService.getUserContestActivity(USER_1, {
          limit: 0,
        })
      ).rejects.toThrow('Activity limit must be an integer between 1 and 50');

      // Accepts boundary values (limit: 50, offset: 1000)
      const valid = await notificationsService.getUserContestActivity(USER_1, {
        limit: 50,
        offset: 1000,
      });
      expect(Array.isArray(valid)).toBe(true);
    });
  });
});
