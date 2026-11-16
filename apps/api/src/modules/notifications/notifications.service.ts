import crypto from 'crypto';
import { and, desc, eq, sql } from 'drizzle-orm';
import { db } from '../../db/index.js';
import {
  notifications,
  contests,
  contestParticipants,
  submissions,
  problems,
  type NotificationRecord,
} from '../../db/schema.js';
import {
  Notification,
  NotificationType,
  NotificationActivityItem,
  NotificationLiveEvent,
  SubmissionEvent,
  ERROR_CODES,
  REDIS_KEYS,
  Verdict,
} from '@judge/shared';
import { redisPublisher } from '../../config/redis.js';
import { AppError } from '../../utils/app-error.js';
import { isUuid, mapDatabaseError } from '../../utils/db-error.js';
import { logger } from '../../utils/logger.js';

export interface CreateNotificationInput {
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  data?: Record<string, any>;
  idempotencyKey?: string;
  deduplicate?: boolean;
}

export class NotificationsService {
  /**
   * Maps a database record to the public Notification DTO.
   */
  private mapToDto(record: NotificationRecord): Notification {
    return {
      id: record.id,
      userId: record.userId,
      type: record.type as NotificationType,
      title: record.title,
      message: record.message,
      data: (record.data as Record<string, any>) || {},
      idempotencyKey: record.idempotencyKey,
      isRead: record.isRead,
      createdAt: record.createdAt.toISOString(),
      readAt: record.readAt ? record.readAt.toISOString() : null,
    };
  }

  /**
   * Creates a notification, persists it to PostgreSQL with database-level idempotency,
   * and broadcasts it live via Redis Pub/Sub.
   */
  async createNotification(input: CreateNotificationInput): Promise<Notification> {
    const { userId, type, title, message, data = {}, deduplicate = false } = input;

    if (!isUuid(userId)) {
      throw new AppError(ERROR_CODES.VALIDATION_ERROR, 'Invalid user ID', 400);
    }

    let resolvedKey = input.idempotencyKey;
    if (!resolvedKey && deduplicate && data.contestId) {
      resolvedKey = `${type.toLowerCase()}:${data.contestId}`;
    }

    try {
      // 1. Fast read-lookup check if idempotency key is provided
      if (resolvedKey) {
        const [existing] = await db
          .select()
          .from(notifications)
          .where(
            and(eq(notifications.userId, userId), eq(notifications.idempotencyKey, resolvedKey))
          )
          .limit(1);

        if (existing) {
          return this.mapToDto(existing);
        }
      }

      // 2. Database insert guarded by UNIQUE (user_id, idempotency_key) constraint
      const [inserted] = await db
        .insert(notifications)
        .values({
          userId,
          type,
          title,
          message,
          data,
          idempotencyKey: resolvedKey || null,
          isRead: false,
        })
        .returning();

      const dto = this.mapToDto(inserted);

      // 3. Publish live event via Redis Pub/Sub (Day 20)
      if (redisPublisher && redisPublisher.status === 'ready') {
        const liveEvent: NotificationLiveEvent = {
          userId,
          notification: dto,
          timestamp: Date.now(),
        };
        try {
          await redisPublisher.publish(
            REDIS_KEYS.CHANNEL_NOTIFICATION_EVENTS,
            JSON.stringify(liveEvent)
          );
        } catch (pubErr: any) {
          logger.warn(
            { err: pubErr?.message },
            'Failed publishing notification live event to Redis'
          );
        }
      }

      return dto;
    } catch (err: any) {
      // ACID database uniqueness fallback for concurrent duplicate execution
      if (
        (err?.code === '23505' ||
          err?.cause?.code === '23505' ||
          err?.message?.includes('uq_notifications_user_idempotency')) &&
        resolvedKey
      ) {
        const [found] = await db
          .select()
          .from(notifications)
          .where(
            and(eq(notifications.userId, userId), eq(notifications.idempotencyKey, resolvedKey))
          )
          .limit(1);

        if (found) {
          return this.mapToDto(found);
        }
      }
      throw mapDatabaseError(err);
    }
  }

  /**
   * Retrieves paginated notifications for an authenticated user.
   */
  async getUserNotifications(
    userId: string,
    query: { limit?: number; offset?: number; unreadOnly?: boolean } = {}
  ): Promise<{ notifications: Notification[]; total: number; unreadCount: number }> {
    if (!isUuid(userId)) {
      throw new AppError(ERROR_CODES.VALIDATION_ERROR, 'Invalid user ID', 400);
    }

    const limit = Math.min(Math.max(1, query.limit ?? 50), 100);
    const offset = Math.max(0, query.offset ?? 0);
    const unreadOnly = Boolean(query.unreadOnly);

    try {
      const conditions = [eq(notifications.userId, userId)];
      if (unreadOnly) {
        conditions.push(eq(notifications.isRead, false));
      }

      const [rows, [countRow], [unreadCountRow]] = await Promise.all([
        db
          .select()
          .from(notifications)
          .where(and(...conditions))
          .orderBy(desc(notifications.createdAt))
          .limit(limit)
          .offset(offset),
        db
          .select({ count: sql<number>`count(*)::int` })
          .from(notifications)
          .where(and(...conditions)),
        db
          .select({ count: sql<number>`count(*)::int` })
          .from(notifications)
          .where(and(eq(notifications.userId, userId), eq(notifications.isRead, false))),
      ]);

      return {
        notifications: rows.map((r) => this.mapToDto(r)),
        total: Number(countRow?.count || 0),
        unreadCount: Number(unreadCountRow?.count || 0),
      };
    } catch (err: any) {
      throw mapDatabaseError(err);
    }
  }

  /**
   * Returns the count of unread notifications for a user.
   */
  async getUnreadCount(userId: string): Promise<{ unreadCount: number }> {
    if (!isUuid(userId)) {
      throw new AppError(ERROR_CODES.VALIDATION_ERROR, 'Invalid user ID', 400);
    }

    try {
      const [row] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(notifications)
        .where(and(eq(notifications.userId, userId), eq(notifications.isRead, false)));

      return { unreadCount: Number(row?.count || 0) };
    } catch (err: any) {
      throw mapDatabaseError(err);
    }
  }

  /**
   * Marks a specific notification as read.
   */
  async markAsRead(userId: string, notificationId: string): Promise<Notification> {
    if (!isUuid(userId) || !isUuid(notificationId)) {
      throw new AppError(ERROR_CODES.NOT_FOUND, 'Notification not found', 404);
    }

    try {
      const [existing] = await db
        .select()
        .from(notifications)
        .where(and(eq(notifications.id, notificationId), eq(notifications.userId, userId)))
        .limit(1);

      if (!existing) {
        throw new AppError(ERROR_CODES.NOT_FOUND, 'Notification not found', 404);
      }

      if (existing.isRead) {
        return this.mapToDto(existing);
      }

      const [updated] = await db
        .update(notifications)
        .set({
          isRead: true,
          readAt: new Date(),
        })
        .where(eq(notifications.id, notificationId))
        .returning();

      return this.mapToDto(updated);
    } catch (err: any) {
      if (err instanceof AppError) throw err;
      throw mapDatabaseError(err);
    }
  }

  /**
   * Marks all notifications as read for a user.
   */
  async markAllAsRead(userId: string): Promise<{ success: boolean; updatedCount: number }> {
    if (!isUuid(userId)) {
      throw new AppError(ERROR_CODES.VALIDATION_ERROR, 'Invalid user ID', 400);
    }

    try {
      const updated = await db
        .update(notifications)
        .set({
          isRead: true,
          readAt: new Date(),
        })
        .where(and(eq(notifications.userId, userId), eq(notifications.isRead, false)))
        .returning({ id: notifications.id });

      return { success: true, updatedCount: updated.length };
    } catch (err: any) {
      throw mapDatabaseError(err);
    }
  }

  /**
   * Returns an aggregated list of recent contest-related activity for an authenticated user.
   * Supports bounded limit & offset pagination and deterministic tie-breaking.
   */
  async getUserContestActivity(
    userId: string,
    query: { limit?: number; offset?: number } = {}
  ): Promise<NotificationActivityItem[]> {
    if (!isUuid(userId)) {
      throw new AppError(ERROR_CODES.VALIDATION_ERROR, 'Invalid user ID', 400);
    }

    if (query.offset !== undefined) {
      if (
        typeof query.offset !== 'number' ||
        isNaN(query.offset) ||
        !Number.isInteger(query.offset) ||
        query.offset < 0 ||
        query.offset > 1000
      ) {
        throw new AppError(
          ERROR_CODES.VALIDATION_ERROR,
          'Activity offset must be an integer between 0 and 1000',
          400
        );
      }
    }

    if (query.limit !== undefined) {
      if (
        typeof query.limit !== 'number' ||
        isNaN(query.limit) ||
        !Number.isInteger(query.limit) ||
        query.limit < 1 ||
        query.limit > 50
      ) {
        throw new AppError(
          ERROR_CODES.VALIDATION_ERROR,
          'Activity limit must be an integer between 1 and 50',
          400
        );
      }
    }

    const limit = query.limit ?? 20;
    const offset = query.offset ?? 0;
    const fetchCap = offset + limit;

    try {
      // 1. Fetch user's registered contests (bounded by fetchCap to avoid loading entire history)
      const registrations = await db
        .select({
          contestId: contestParticipants.contestId,
          contestTitle: contests.title,
          registeredAt: contestParticipants.registeredAt,
        })
        .from(contestParticipants)
        .innerJoin(contests, eq(contestParticipants.contestId, contests.id))
        .where(eq(contestParticipants.userId, userId))
        .orderBy(desc(contestParticipants.registeredAt))
        .limit(fetchCap);

      // 2. Fetch user's contest submissions (bounded by fetchCap)
      const contestSubmissions = await db
        .select({
          submissionId: submissions.id,
          contestId: submissions.contestId,
          contestTitle: contests.title,
          problemId: submissions.problemId,
          problemTitle: problems.title,
          verdict: submissions.verdict,
          createdAt: submissions.createdAt,
        })
        .from(submissions)
        .innerJoin(contests, eq(submissions.contestId, contests.id))
        .innerJoin(problems, eq(submissions.problemId, problems.id))
        .where(and(eq(submissions.userId, userId), sql`${submissions.contestId} IS NOT NULL`))
        .orderBy(desc(submissions.createdAt))
        .limit(fetchCap);

      // 3. Fetch user's contest notifications (bounded by fetchCap)
      const userNotifications = await db
        .select()
        .from(notifications)
        .where(eq(notifications.userId, userId))
        .orderBy(desc(notifications.createdAt))
        .limit(fetchCap);

      const items: NotificationActivityItem[] = [];

      for (const reg of registrations) {
        items.push({
          id: `reg-${reg.contestId}`,
          activityType: 'REGISTRATION',
          title: 'Registered for Contest',
          description: `You registered for "${reg.contestTitle}".`,
          timestamp: reg.registeredAt.toISOString(),
          contestId: reg.contestId,
          contestTitle: reg.contestTitle,
        });
      }

      for (const sub of contestSubmissions) {
        items.push({
          id: `sub-${sub.submissionId}`,
          activityType: 'SUBMISSION',
          title: `Contest Submission: ${sub.verdict || 'PENDING'}`,
          description: `Problem "${sub.problemTitle}" in "${sub.contestTitle}".`,
          timestamp: sub.createdAt.toISOString(),
          contestId: sub.contestId || undefined,
          contestTitle: sub.contestTitle,
          problemId: sub.problemId,
          problemTitle: sub.problemTitle,
          verdict: (sub.verdict as Verdict) || undefined,
        });
      }

      for (const n of userNotifications) {
        items.push({
          id: `notif-${n.id}`,
          activityType: 'NOTIFICATION',
          title: n.title,
          description: n.message,
          timestamp: n.createdAt.toISOString(),
          contestId: (n.data as any)?.contestId,
          metadata: (n.data as any) || undefined,
        });
      }

      // Stable sorting using timestamp and deterministic tie-breaker (id)
      items.sort((a, b) => {
        const diff = new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
        if (diff !== 0) return diff;
        return a.id.localeCompare(b.id);
      });

      return items.slice(offset, offset + limit);
    } catch (err: any) {
      throw mapDatabaseError(err);
    }
  }

  /**
   * Alias for getUserContestActivity for backward compatibility.
   */
  async getUserActivityFeed(
    userId: string,
    query: { limit?: number; offset?: number } = {}
  ): Promise<NotificationActivityItem[]> {
    return this.getUserContestActivity(userId, query);
  }

  /**
   * Processes submission verdict event and generates a CONTEST_SUBMISSION_VERDICT notification.
   */
  async handleSubmissionVerdict(event: SubmissionEvent): Promise<Notification | null> {
    if (!event.contestId || !event.userId || !event.verdict) {
      return null;
    }

    try {
      const [contestRow, subRow] = await Promise.all([
        db
          .select({ title: contests.title })
          .from(contests)
          .where(eq(contests.id, event.contestId))
          .limit(1),
        db
          .select({
            problemId: submissions.problemId,
            problemTitle: problems.title,
          })
          .from(submissions)
          .innerJoin(problems, eq(submissions.problemId, problems.id))
          .where(eq(submissions.id, event.submissionId))
          .limit(1),
      ]);

      const contestTitle = contestRow[0]?.title || 'Contest';
      const problemTitle = subRow[0]?.problemTitle || 'Problem';

      const title = `Submission Verdict: ${event.verdict}`;
      const message = `Your submission for "${problemTitle}" in "${contestTitle}" resulted in ${event.verdict}.`;

      return await this.createNotification({
        userId: event.userId,
        type: 'CONTEST_SUBMISSION_VERDICT',
        title,
        message,
        idempotencyKey: `sub_verdict:${event.submissionId}`,
        data: {
          contestId: event.contestId,
          contestTitle,
          problemId: subRow[0]?.problemId,
          problemTitle,
          submissionId: event.submissionId,
          verdict: event.verdict,
          executionTimeMs: event.executionTimeMs,
          memoryUsedKb: event.memoryUsedKb,
        },
      });
    } catch (err: any) {
      logger.warn(
        { err: err?.message },
        'Failed processing contest submission verdict notification'
      );
      return null;
    }
  }

  /**
   * Reconciles completed contest submissions that missed Pub/Sub notification delivery
   * (e.g. during API downtime, Redis disconnection, or worker crash).
   *
   * Guaranteed delivery:
   * - No 2-hour or time-based window limitation; all completed contest submissions lacking a
   *   notification are eligible regardless of age.
   * - Processes in bounded batches (default 50 rows, up to 20 batches per sweep = 1000 items)
   *   with continuation until no pending rows remain or abort signal received.
   */
  async reconcilePendingSubmissionVerdictNotifications(
    options: {
      batchSize?: number;
      maxBatches?: number;
      shouldAbort?: () => boolean;
    } = {}
  ): Promise<{ reconciledCount: number }> {
    const batchSize = Math.min(Math.max(1, options.batchSize ?? 50), 100);
    const maxBatches = Math.min(Math.max(1, options.maxBatches ?? 20), 50);
    let reconciledCount = 0;

    try {
      let batchCount = 0;
      while (batchCount < maxBatches) {
        if (options.shouldAbort && options.shouldAbort()) {
          logger.warn('Submission verdict reconciliation aborted due to abort signal');
          break;
        }

        const missing = await db.execute(sql`
          SELECT s.id as submission_id, s.user_id, s.contest_id, s.problem_id, s.verdict,
                 s.execution_time_ms, s.memory_used_kb,
                 p.title as problem_title, c.title as contest_title
          FROM submissions s
          JOIN problems p ON s.problem_id = p.id
          JOIN contests c ON s.contest_id = c.id
          LEFT JOIN notifications n ON n.user_id = s.user_id AND n.idempotency_key = ('sub_verdict:' || s.id::text)
          WHERE s.status = 'COMPLETED'
            AND s.contest_id IS NOT NULL
            AND n.id IS NULL
          ORDER BY s.created_at ASC
          LIMIT ${batchSize};
        `);

        const rows = missing.rows as any[];
        if (!rows || rows.length === 0) {
          break;
        }

        for (const row of rows) {
          if (options.shouldAbort && options.shouldAbort()) {
            break;
          }

          const title = `Verdict: ${row.verdict || 'COMPLETED'}`;
          const message = `Problem "${row.problem_title}" in contest "${row.contest_title}": ${row.verdict || 'COMPLETED'}`;

          await this.createNotification({
            userId: row.user_id,
            type: 'CONTEST_SUBMISSION_VERDICT',
            title,
            message,
            idempotencyKey: `sub_verdict:${row.submission_id}`,
            data: {
              contestId: row.contest_id,
              contestTitle: row.contest_title,
              problemId: row.problem_id,
              problemTitle: row.problem_title,
              submissionId: row.submission_id,
              verdict: row.verdict,
              executionTimeMs: row.execution_time_ms,
              memoryUsedKb: row.memory_used_kb,
            },
            deduplicate: true,
          });
          reconciledCount++;
        }

        batchCount++;
        if (rows.length < batchSize) {
          break;
        }
      }
    } catch (err: any) {
      logger.warn(
        { err: err?.message },
        'Error during submission verdict notification reconciliation'
      );
    }
    return { reconciledCount };
  }

  /**
   * Renews a distributed lock atomically using a Lua script to ensure
   * only the token owner can extend the lock TTL.
   */
  async renewDistributedLock(lockKey: string, lockToken: string, ttlMs: number): Promise<boolean> {
    if (
      !redisPublisher ||
      redisPublisher.status !== 'ready' ||
      typeof redisPublisher.eval !== 'function'
    ) {
      return false;
    }
    const RENEW_SCRIPT = `
      if redis.call("get", KEYS[1]) == ARGV[1] then
        return redis.call("pexpire", KEYS[1], ARGV[2])
      else
        return 0
      end
    `;
    try {
      const res = await redisPublisher.eval(RENEW_SCRIPT, 1, lockKey, lockToken, ttlMs.toString());
      return res === 1;
    } catch (err: any) {
      logger.warn({ err: err?.message }, 'Failed executing Lua atomic renewal of distributed lock');
      return false;
    }
  }

  /**
   * Releases a distributed lock atomically using a Lua script to ensure
   * only the token owner can release the lock (prevents deleting another instance's lock).
   */
  async releaseDistributedLock(lockKey: string, lockToken: string): Promise<boolean> {
    if (
      !redisPublisher ||
      redisPublisher.status !== 'ready' ||
      typeof redisPublisher.eval !== 'function'
    ) {
      return false;
    }
    const UNLOCK_SCRIPT = `
      if redis.call("get", KEYS[1]) == ARGV[1] then
        return redis.call("del", KEYS[1])
      else
        return 0
      end
    `;
    try {
      const res = await redisPublisher.eval(UNLOCK_SCRIPT, 1, lockKey, lockToken);
      return res === 1;
    } catch (err: any) {
      logger.warn({ err: err?.message }, 'Failed executing Lua atomic release of distributed lock');
      return false;
    }
  }

  /**
   * Sweeper: checks active and upcoming contests and dispatches time-based notifications
   * using distributed Redis locking, atomic heartbeat renewal, and database-level idempotency keys.
   *
   * Durable recovery guarantees:
   * - CONTEST_APPROACHING: within 30 minutes before start (suppressed once start time passes)
   * - CONTEST_STARTED: contest has started (recovers after extended downtime even if contest has ended)
   * - CONTEST_ENDING_SOON: within 15 minutes before end (suppressed once end time passes)
   * - CONTEST_ENDED: contest has concluded (within past 24 hours; recovers after extended downtime)
   */
  async checkAndDispatchContestLifecycleNotifications(): Promise<{ dispatchedCount: number }> {
    const lockKey = REDIS_KEYS.CRON_LOCK('contest-lifecycle-sweeper');
    const lockToken = `${process.pid}_${crypto.randomUUID()}`;
    let lockAcquired = false;
    let isAborted = false;
    let renewalTimer: NodeJS.Timeout | null = null;

    // Distributed lock guard using unique token and NX PX (50s TTL)
    if (
      redisPublisher &&
      redisPublisher.status === 'ready' &&
      typeof redisPublisher.set === 'function'
    ) {
      try {
        const res = await redisPublisher.set(lockKey, lockToken, 'PX', 50000, 'NX');
        if (!res) {
          logger.debug('Contest lifecycle sweeper lock held by another instance; skipping tick.');
          return { dispatchedCount: 0 };
        }
        lockAcquired = true;

        // Periodic renewal heartbeat every 15s to maintain 50s TTL while work is ongoing
        renewalTimer = setInterval(async () => {
          try {
            const renewed = await this.renewDistributedLock(lockKey, lockToken, 50000);
            if (!renewed) {
              logger.warn(
                'Distributed lock renewal failed (ownership lost). Aborting lifecycle sweep.'
              );
              isAborted = true;
              if (renewalTimer) {
                clearInterval(renewalTimer);
                renewalTimer = null;
              }
            }
          } catch (e: any) {
            logger.warn({ err: e?.message }, 'Error in distributed lock renewal heartbeat');
          }
        }, 15000);
      } catch (lockErr: any) {
        logger.warn(
          { err: lockErr?.message },
          'Failed acquiring distributed lock for contest sweeper; continuing with database idempotency'
        );
      }
    }

    const now = new Date();
    const thirtyMinutesMs = 30 * 60 * 1000;
    const fifteenMinutesMs = 15 * 60 * 1000;
    let dispatchedCount = 0;

    try {
      // 1. Durable submission verdict recovery with continuation batches
      const subReconcile = await this.reconcilePendingSubmissionVerdictNotifications({
        shouldAbort: () => lockAcquired && isAborted,
      });
      dispatchedCount += subReconcile.reconciledCount;

      if (lockAcquired && isAborted) {
        logger.warn('Lifecycle sweeper aborted after submission reconciliation due to lost lock');
        return { dispatchedCount };
      }

      // 2. Query upcoming (next 30m), active, or recently ended (past 24h) contests
      const relevantContests = await db
        .select()
        .from(contests)
        .where(
          and(
            sql`${contests.startTime} - INTERVAL '30 minutes' <= ${now}`,
            sql`${contests.endTime} + INTERVAL '24 hours' >= ${now}`
          )
        );

      for (const contest of relevantContests) {
        if (lockAcquired && isAborted) {
          logger.warn('Lifecycle sweeper aborted contest loop due to lost lock');
          break;
        }

        const startDiffMs = contest.startTime.getTime() - now.getTime();
        const endDiffMs = contest.endTime.getTime() - now.getTime();

        // CONTEST_APPROACHING: starts in <= 30 mins, but hasn't started yet
        const isApproaching = startDiffMs > 0 && startDiffMs <= thirtyMinutesMs;

        // CONTEST_STARTED: contest has started (recovers after extended downtime even if contest has ended).
        // Any participant without 'started:${contest.id}' receives it, deduplicated at database level!
        const isStarted = startDiffMs <= 0;

        // CONTEST_ENDING_SOON: ends in <= 15 mins, and hasn't ended yet
        const isEndingSoon = endDiffMs > 0 && endDiffMs <= fifteenMinutesMs;

        // CONTEST_ENDED: contest has concluded (within past 24 hours).
        // Any participant without 'ended:${contest.id}' receives it, deduplicated at database level!
        const isEnded = endDiffMs <= 0;

        if (!isApproaching && !isStarted && !isEndingSoon && !isEnded) {
          continue;
        }

        // Fetch registered participants for this contest
        const participants = await db
          .select({ userId: contestParticipants.userId })
          .from(contestParticipants)
          .where(eq(contestParticipants.contestId, contest.id));

        for (const p of participants) {
          if (lockAcquired && isAborted) {
            logger.warn('Lifecycle sweeper aborted participant dispatch due to lost lock');
            break;
          }

          if (isApproaching) {
            const minutesLeft = Math.max(1, Math.round(startDiffMs / 60000));
            await this.createNotification({
              userId: p.userId,
              type: 'CONTEST_APPROACHING',
              title: `Contest Approaching: ${contest.title}`,
              message: `"${contest.title}" starts in approximately ${minutesLeft} minute(s). Get ready!`,
              idempotencyKey: `approaching:${contest.id}`,
              data: { contestId: contest.id, contestTitle: contest.title },
              deduplicate: true,
            });
            dispatchedCount++;
          }

          if (isStarted) {
            await this.createNotification({
              userId: p.userId,
              type: 'CONTEST_STARTED',
              title: `Contest Started: ${contest.title}`,
              message: `"${contest.title}" is now LIVE! Jump in and start solving.`,
              idempotencyKey: `started:${contest.id}`,
              data: { contestId: contest.id, contestTitle: contest.title },
              deduplicate: true,
            });
            dispatchedCount++;
          }

          if (isEndingSoon) {
            const minutesLeft = Math.max(1, Math.round(endDiffMs / 60000));
            await this.createNotification({
              userId: p.userId,
              type: 'CONTEST_ENDING_SOON',
              title: `Contest Ending Soon: ${contest.title}`,
              message: `"${contest.title}" ends in approximately ${minutesLeft} minute(s). Submit your final solutions!`,
              idempotencyKey: `ending_soon:${contest.id}`,
              data: { contestId: contest.id, contestTitle: contest.title },
              deduplicate: true,
            });
            dispatchedCount++;
          }

          if (isEnded) {
            await this.createNotification({
              userId: p.userId,
              type: 'CONTEST_ENDED',
              title: `Contest Ended: ${contest.title}`,
              message: `"${contest.title}" has officially concluded. Final standings are now visible on the leaderboard.`,
              idempotencyKey: `ended:${contest.id}`,
              data: { contestId: contest.id, contestTitle: contest.title },
              deduplicate: true,
            });
            dispatchedCount++;
          }
        }
      }
    } catch (err: any) {
      logger.warn({ err: err?.message }, 'Error during contest lifecycle notifications check');
    } finally {
      if (renewalTimer) {
        clearInterval(renewalTimer);
        renewalTimer = null;
      }
      if (lockAcquired) {
        await this.releaseDistributedLock(lockKey, lockToken);
      }
    }

    return { dispatchedCount };
  }
}

export const notificationsService = new NotificationsService();
