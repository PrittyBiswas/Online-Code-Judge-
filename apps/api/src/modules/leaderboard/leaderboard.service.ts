import { eq, inArray, asc, and } from 'drizzle-orm';
import { redisClient, isRedisHealthy } from '../../config/redis.js';
import { db } from '../../db/index.js';
import { submissions, users } from '../../db/schema.js';
import {
  REDIS_KEYS,
  LeaderboardEntry,
  LeaderboardResponse,
  Verdict,
  encodeLeaderboardScore,
  decodeLeaderboardScore,
  RECORD_SOLVE_LUA_SCRIPT,
  RECONCILE_USER_SOLVED_SET_LUA_SCRIPT,
  SWAP_LEADERBOARD_KEYS_LUA_SCRIPT,
  PENALTY_OFFSET,
} from '@judge/shared';
import { mapDatabaseError } from '../../utils/db-error.js';

export class LeaderboardService {
  /**
   * Records an ACCEPTED solve for a user and problem (AC-LB-01, AC-LB-02).
   * Idempotent: re-solving the same problem never awards double credit.
   * Atomically executes first-solve deduplication and score update via Redis Lua script.
   */
  async recordSolve(userId: string, problemId: string, penaltySeconds: number = 0): Promise<void> {
    if (!isRedisHealthy()) return;
    const solvedSetKey = `judge:user:${userId}:solved`;
    const penalty = Math.max(0, Math.floor(penaltySeconds));

    try {
      if (typeof redisClient.eval === 'function') {
        await redisClient.eval(
          RECORD_SOLVE_LUA_SCRIPT,
          3,
          solvedSetKey,
          REDIS_KEYS.GLOBAL_LEADERBOARD,
          'judge:leaderboard:rebuilding',
          problemId,
          userId,
          penalty,
          PENALTY_OFFSET
        );
      }
      // Note: Live solves do NOT set 'judge:leaderboard:meta:status' = 'ready' (Audit Item 1).
      // Note: Live solves do NOT set 'judge:leaderboard:meta:status' = 'ready' (Audit Item 1).
    } catch {}
  }

  /**
   * Retrieves live global leaderboard from Redis Sorted Set (AC-LB-01, AC-LB-04)
   * with automatic fallback to PostgreSQL. Supports bounded pagination.
   * Guarantees canonical global ordering: (1) Score DESC, (2) Username ASC, (3) UserId ASC.
   */
  async getGlobalLeaderboard(
    params: { page?: number; limit?: number } = {}
  ): Promise<LeaderboardResponse> {
    const page = Math.max(1, params.page ?? 1);
    const limit = Math.min(100, Math.max(1, params.limit ?? 50));

    if (!isRedisHealthy()) {
      return this.computeFromDatabase({ page, limit });
    }

    try {
      // 1. Check for cache completeness against PostgreSQL durable source of truth
      let isCacheComplete = false;
      const metaStatus =
        typeof redisClient.get === 'function'
          ? await redisClient.get('judge:leaderboard:meta:status').catch(() => null)
          : null;

      const keyType =
        typeof redisClient.type === 'function'
          ? await redisClient.type(REDIS_KEYS.GLOBAL_LEADERBOARD).catch(() => 'none')
          : await redisClient
              .zcard(REDIS_KEYS.GLOBAL_LEADERBOARD)
              .then((c) => (c > 0 ? 'zset' : 'none'))
              .catch(() => 'none');

      // If sorted set key is missing or not a zset, cache is invalid even if meta is 'ready'
      if (keyType === 'zset' && metaStatus === 'ready') {
        const currentRedisTotal = await redisClient.zcard(REDIS_KEYS.GLOBAL_LEADERBOARD);
        const expectedCountStr =
          typeof redisClient.get === 'function'
            ? await redisClient.get('judge:leaderboard:meta:count').catch(() => null)
            : null;
        const expectedCount = expectedCountStr !== null ? parseInt(expectedCountStr, 10) : null;

        // If expectedCount is set and redis total is less, cache is partial/evicted!
        if (expectedCount !== null && currentRedisTotal < expectedCount) {
          isCacheComplete = false;
        } else {
          // Perform full bi-directional verification against PostgreSQL durable truth
          const acceptedSubs = await db
            .select({ userId: submissions.userId })
            .from(submissions)
            .where(eq(submissions.verdict, Verdict.ACCEPTED));
          const dbUserIds = new Set(acceptedSubs.map((s) => s.userId));

          if (dbUserIds.size > 0) {
            const rawMembers = await redisClient.zrevrange(REDIS_KEYS.GLOBAL_LEADERBOARD, 0, -1);
            const redisUserIds = new Set(rawMembers);

            const allDbInRedis = Array.from(dbUserIds).every((id) => redisUserIds.has(id));
            const allRedisInDb = Array.from(redisUserIds).every((id) => dbUserIds.has(id));

            if (allDbInRedis && allRedisInDb && dbUserIds.size === redisUserIds.size) {
              isCacheComplete = true;
            } else {
              isCacheComplete = false;
            }
          } else {
            isCacheComplete = true;
          }
        }
      } else {
        isCacheComplete = false;
      }

      // If cache is not complete, auto-heal from PostgreSQL:
      if (!isCacheComplete) {
        try {
          await this.rebuildLeaderboard();
        } catch {
          // If rebuild is locked by another concurrent request, serve from PostgreSQL directly
          return this.computeFromDatabase({ page, limit });
        }
      }

      let totalInRedis = await redisClient.zcard(REDIS_KEYS.GLOBAL_LEADERBOARD);
      if (typeof totalInRedis !== 'number') {
        totalInRedis = 0;
      }

      if (totalInRedis === 0) {
        return {
          leaderboard: [],
          pagination: { page, limit, total: 0, totalPages: 1 },
        };
      }

      // 2. Fetch all members & scores from Redis to enforce global canonical ordering:
      // (1) Score DESC, (2) Username ASC, (3) UserId ASC
      const raw = await redisClient.zrevrange(REDIS_KEYS.GLOBAL_LEADERBOARD, 0, -1, 'WITHSCORES');

      const userIds: string[] = [];
      for (let i = 0; i < raw.length; i += 2) {
        userIds.push(raw[i]);
      }

      const usernameMap = await this.fetchUsernames(userIds);
      const entries: LeaderboardEntry[] = [];

      for (let i = 0; i < raw.length; i += 2) {
        const userId = raw[i];
        const score = parseFloat(raw[i + 1]);
        const { problemsSolved, totalPenaltySeconds } = decodeLeaderboardScore(score);

        entries.push({
          rank: 0,
          userId,
          username: usernameMap.get(userId) || `User_${userId.substring(0, 6)}`,
          problemsSolved,
          totalPenaltySeconds,
          score,
        });
      }

      // Global deterministic tie-breaking: Score DESC, Username ASC, UserId ASC
      entries.sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        const nameCmp = (a.username || '').localeCompare(b.username || '');
        if (nameCmp !== 0) return nameCmp;
        return a.userId.localeCompare(b.userId);
      });

      entries.forEach((e, idx) => {
        e.rank = idx + 1;
      });

      const total = entries.length;
      const totalPages = Math.max(1, Math.ceil(total / limit));
      const start = (page - 1) * limit;
      const pagedEntries = entries.slice(start, start + limit);

      return {
        leaderboard: pagedEntries,
        pagination: {
          page,
          limit,
          total,
          totalPages,
        },
      };
    } catch {
      return this.computeFromDatabase({ page, limit });
    }
  }

  /**
   * Rebuilds Redis leaderboard from Postgres state (AC-LB-03 / Card 6)
   * Deterministic ordering by (createdAt ASC, id ASC).
   * Safe atomic publication via temporary Redis key and zero loss of live updates.
   */
  async rebuildLeaderboard(): Promise<{ count: number; rebuiltEntries: LeaderboardEntry[] }> {
    const lockKey = 'judge:lock:leaderboard:rebuild';
    const lockToken = `${Date.now()}:${Math.random().toString(36).substring(2, 9)}`;
    const lockTtlMs = 15000;
    let lockAcquired = false;
    let heartbeat: NodeJS.Timeout | null = null;
    let lockLost = false;

    if (isRedisHealthy() && typeof redisClient.set === 'function') {
      const res = await redisClient
        .set(lockKey, lockToken, 'PX', lockTtlMs, 'NX')
        .catch(() => null);
      if (res === 'OK') {
        lockAcquired = true;
      } else {
        // Distributed lock held by another active rebuild! Wait briefly for completion.
        for (let i = 0; i < 15; i++) {
          await new Promise((r) => setTimeout(r, 200));
          const status =
            typeof redisClient.get === 'function'
              ? await redisClient.get('judge:leaderboard:meta:status').catch(() => null)
              : null;
          if (status === 'ready') {
            const currentTotal =
              (await redisClient.zcard(REDIS_KEYS.GLOBAL_LEADERBOARD).catch(() => 0)) || 0;
            return {
              count: currentTotal,
              rebuiltEntries: [],
            };
          }
        }
        throw new Error('Leaderboard rebuild already in progress');
      }
    }

    // Start heartbeat watchdog to renew lock and rebuilding pointer every 5000ms checking ownership token
    if (lockAcquired) {
      heartbeat = setInterval(async () => {
        try {
          if (typeof redisClient.eval === 'function') {
            const renewLua = `
              if redis.call('get', KEYS[1]) == ARGV[1] then
                redis.call('pexpire', KEYS[1], ARGV[2])
                if redis.call('exists', KEYS[2]) == 1 then
                  redis.call('pexpire', KEYS[2], ARGV[2])
                end
                return 1
              else
                return 0
              end
            `;
            const renewed = await redisClient.eval(
              renewLua,
              2,
              lockKey,
              'judge:leaderboard:rebuilding',
              lockToken,
              lockTtlMs
            );
            if (renewed === 0) {
              lockLost = true;
              if (heartbeat) clearInterval(heartbeat);
            }
          } else {
            const currentToken = await redisClient.get(lockKey);
            if (currentToken !== lockToken) {
              lockLost = true;
              if (heartbeat) clearInterval(heartbeat);
            } else {
              if (typeof redisClient.pexpire === 'function') {
                await redisClient.pexpire(lockKey, lockTtlMs).catch(() => null);
                await redisClient
                  .pexpire('judge:leaderboard:rebuilding', lockTtlMs)
                  .catch(() => null);
              }
            }
          }
        } catch {
          lockLost = true;
        }
      }, 5000);
    }

    const tempLeaderboardKey = `${REDIS_KEYS.GLOBAL_LEADERBOARD}:rebuild:${Date.now()}:${Math.random().toString(36).substring(2, 7)}`;
    try {
      // Announce active temp key so any concurrent live solve writes to both keys
      if (isRedisHealthy() && typeof redisClient.set === 'function') {
        await redisClient
          .set('judge:leaderboard:rebuilding', tempLeaderboardKey, 'PX', 30000)
          .catch(() => null);
      }

      const acceptedSubs = await db
        .select({
          id: submissions.id,
          userId: submissions.userId,
          problemId: submissions.problemId,
          executionTimeMs: submissions.executionTimeMs,
          createdAt: submissions.createdAt,
        })
        .from(submissions)
        .where(eq(submissions.verdict, Verdict.ACCEPTED))
        .orderBy(asc(submissions.createdAt), asc(submissions.id));

      const solvedMap = new Map<string, Set<string>>();
      const penaltyMap = new Map<string, number>();

      for (const sub of acceptedSubs) {
        if (!solvedMap.has(sub.userId)) {
          solvedMap.set(sub.userId, new Set());
          penaltyMap.set(sub.userId, 0);
        }
        const userSet = solvedMap.get(sub.userId)!;
        if (!userSet.has(sub.problemId)) {
          userSet.add(sub.problemId);
          const penalty = Math.floor((sub.executionTimeMs || 100) / 1000);
          penaltyMap.set(sub.userId, (penaltyMap.get(sub.userId) || 0) + penalty);
        }
      }

      const usernameMap = await this.fetchUsernames(Array.from(solvedMap.keys()));
      const rebuiltEntries: LeaderboardEntry[] = [];

      for (const [userId, problemSet] of solvedMap.entries()) {
        const penalty = penaltyMap.get(userId) || 0;
        const score = encodeLeaderboardScore(problemSet.size, penalty);

        if (isRedisHealthy()) {
          try {
            await redisClient.zadd(tempLeaderboardKey, score, userId);
          } catch {}
        }

        rebuiltEntries.push({
          rank: 0,
          userId,
          username: usernameMap.get(userId) || userId,
          problemsSolved: problemSet.size,
          totalPenaltySeconds: penalty,
          score,
        });
      }

      // Reconcile per-user solved sets to eliminate stale problem IDs while preserving live solves atomically
      if (isRedisHealthy()) {
        try {
          for (const userId of solvedMap.keys()) {
            const userSolvedKey = `judge:user:${userId}:solved`;
            const dbProblems = solvedMap.get(userId)!;
            const dbProblemArray = Array.from(dbProblems);
            const liveSolvesKey = `${tempLeaderboardKey}:livesolves:${userId}`;

            if (typeof redisClient.eval === 'function') {
              await redisClient.eval(
                RECONCILE_USER_SOLVED_SET_LUA_SCRIPT,
                2,
                userSolvedKey,
                liveSolvesKey,
                ...dbProblemArray
              );
            } else {
              // Fallback for mocks/clients without eval
              const liveSolvesList =
                typeof redisClient.smembers === 'function'
                  ? await redisClient.smembers(liveSolvesKey).catch(() => [])
                  : [];
              const validProblems = new Set([...dbProblems, ...liveSolvesList]);

              const currentInRedis =
                typeof redisClient.smembers === 'function'
                  ? await redisClient.smembers(userSolvedKey).catch(() => [])
                  : [];

              for (const p of currentInRedis) {
                if (!validProblems.has(p)) {
                  if (typeof redisClient.srem === 'function') {
                    await redisClient.srem(userSolvedKey, p).catch(() => null);
                  }
                }
              }

              for (const p of validProblems) {
                await redisClient.sadd(userSolvedKey, p).catch(() => null);
              }
            }

            if (typeof redisClient.del === 'function') {
              await redisClient.del(liveSolvesKey).catch(() => null);
            }
          }
        } catch {}
      }

      // If lock was acquired, verify it wasn't lost or stolen during database compute
      if (lockAcquired && isRedisHealthy()) {
        const currentLock =
          typeof redisClient.get === 'function'
            ? await redisClient.get(lockKey).catch(() => null)
            : null;
        if (currentLock !== lockToken || lockLost) {
          throw new Error('Leaderboard rebuild lock expired or stolen during processing');
        }
      }

      // Check if any live updates happened in REDIS_KEYS.GLOBAL_LEADERBOARD during rebuild:
      if (isRedisHealthy()) {
        try {
          const liveMembers = await redisClient.zrevrange(
            REDIS_KEYS.GLOBAL_LEADERBOARD,
            0,
            -1,
            'WITHSCORES'
          );
          for (let i = 0; i < liveMembers.length; i += 2) {
            const liveUserId = liveMembers[i];
            const liveScore = parseFloat(liveMembers[i + 1]);
            const rebuiltScore = (await redisClient.zscore(tempLeaderboardKey, liveUserId)) ?? null;
            if (rebuiltScore !== null) {
              if (liveScore > parseFloat(rebuiltScore)) {
                // Live solve happened while rebuild was computing! Preserve the higher live score.
                await redisClient.zadd(tempLeaderboardKey, liveScore, liveUserId);
              }
            } else {
              // Check if user has active solves recorded in their solved set or in Postgres
              const userSolvedCount =
                typeof redisClient.scard === 'function'
                  ? await redisClient.scard(`judge:user:${liveUserId}:solved`).catch(() => 0)
                  : 0;
              if (userSolvedCount > 0) {
                await redisClient.zadd(tempLeaderboardKey, liveScore, liveUserId);
              } else {
                const hasAcceptedSub = await db
                  .select({ id: submissions.id })
                  .from(submissions)
                  .where(
                    and(
                      eq(submissions.userId, liveUserId),
                      eq(submissions.verdict, Verdict.ACCEPTED)
                    )
                  )
                  .limit(1);
                if (hasAcceptedSub.length > 0) {
                  await redisClient.zadd(tempLeaderboardKey, liveScore, liveUserId);
                }
              }
            }
          }

          // Atomically swap the temporary leaderboard key to canonical key AND delete rebuilding pointer
          if (typeof redisClient.eval === 'function') {
            await redisClient.eval(
              SWAP_LEADERBOARD_KEYS_LUA_SCRIPT,
              3,
              tempLeaderboardKey,
              REDIS_KEYS.GLOBAL_LEADERBOARD,
              'judge:leaderboard:rebuilding'
            );
          } else if (typeof redisClient.rename === 'function') {
            await redisClient.rename(tempLeaderboardKey, REDIS_KEYS.GLOBAL_LEADERBOARD);
            await redisClient.del('judge:leaderboard:rebuilding');
          } else {
            // Fallback for mocks without rename
            await redisClient.del(REDIS_KEYS.GLOBAL_LEADERBOARD);
            const tempScores = await redisClient.zrevrange(tempLeaderboardKey, 0, -1, 'WITHSCORES');
            for (let i = 0; i < tempScores.length; i += 2) {
              await redisClient.zadd(
                REDIS_KEYS.GLOBAL_LEADERBOARD,
                parseFloat(tempScores[i + 1]),
                tempScores[i]
              );
            }
            await redisClient.del(tempLeaderboardKey);
            await redisClient.del('judge:leaderboard:rebuilding');
          }

          // Defensive cleanup: Ensure tempLeaderboardKey is deleted even if recreated by an edge-case solve
          await redisClient.del(tempLeaderboardKey).catch(() => null);

          // Mark cache status as ready and record member count
          if (typeof redisClient.set === 'function') {
            await redisClient.set('judge:leaderboard:meta:status', 'ready');
            await redisClient.set('judge:leaderboard:meta:count', String(rebuiltEntries.length));
          }
        } catch (redisErr) {
          try {
            await redisClient.del(tempLeaderboardKey);
            await redisClient.del('judge:leaderboard:rebuilding');
          } catch {}
        }
      }

      rebuiltEntries.sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        const nameCmp = (a.username || '').localeCompare(b.username || '');
        if (nameCmp !== 0) return nameCmp;
        return a.userId.localeCompare(b.userId);
      });

      rebuiltEntries.forEach((e, idx) => {
        e.rank = idx + 1;
      });

      return {
        count: rebuiltEntries.length,
        rebuiltEntries,
      };
    } catch (err) {
      if (isRedisHealthy()) {
        try {
          await redisClient.del(tempLeaderboardKey);
          await redisClient.del('judge:leaderboard:rebuilding');
        } catch {}
      }
      throw mapDatabaseError(err);
    } finally {
      if (heartbeat) {
        clearInterval(heartbeat);
      }
      if (lockAcquired && isRedisHealthy()) {
        try {
          if (typeof redisClient.eval === 'function') {
            const releaseLua = `
              if redis.call('get', KEYS[1]) == ARGV[1] then
                return redis.call('del', KEYS[1])
              else
                return 0
              end
            `;
            await redisClient.eval(releaseLua, 1, lockKey, lockToken);
          } else {
            const currentToken = await redisClient.get(lockKey);
            if (currentToken === lockToken) {
              await redisClient.del(lockKey);
            }
          }
        } catch {}
      }
    }
  }

  private async computeFromDatabase(params: {
    page: number;
    limit: number;
  }): Promise<LeaderboardResponse> {
    const { page, limit } = params;
    try {
      const acceptedSubs = await db
        .select({
          id: submissions.id,
          userId: submissions.userId,
          problemId: submissions.problemId,
          executionTimeMs: submissions.executionTimeMs,
          createdAt: submissions.createdAt,
        })
        .from(submissions)
        .where(eq(submissions.verdict, Verdict.ACCEPTED))
        .orderBy(asc(submissions.createdAt), asc(submissions.id));

      const userStats = new Map<string, { solved: Set<string>; penalty: number }>();

      for (const sub of acceptedSubs) {
        if (!userStats.has(sub.userId)) {
          userStats.set(sub.userId, { solved: new Set(), penalty: 0 });
        }
        const stat = userStats.get(sub.userId)!;
        if (!stat.solved.has(sub.problemId)) {
          stat.solved.add(sub.problemId);
          stat.penalty += Math.floor((sub.executionTimeMs || 100) / 1000);
        }
      }

      const usernameMap = await this.fetchUsernames(Array.from(userStats.keys()));
      const entries: LeaderboardEntry[] = [];

      for (const [userId, stat] of userStats.entries()) {
        const score = encodeLeaderboardScore(stat.solved.size, stat.penalty);
        entries.push({
          rank: 0,
          userId,
          username: usernameMap.get(userId) || `User_${userId.substring(0, 6)}`,
          problemsSolved: stat.solved.size,
          totalPenaltySeconds: stat.penalty,
          score,
        });
      }

      entries.sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        const nameCmp = (a.username || '').localeCompare(b.username || '');
        if (nameCmp !== 0) return nameCmp;
        return a.userId.localeCompare(b.userId);
      });

      entries.forEach((e, idx) => {
        e.rank = idx + 1;
      });

      const total = entries.length;
      const totalPages = Math.max(1, Math.ceil(total / limit));
      const start = (page - 1) * limit;
      const pagedEntries = entries.slice(start, start + limit);

      return {
        leaderboard: pagedEntries,
        pagination: {
          page,
          limit,
          total,
          totalPages,
        },
      };
    } catch (err) {
      throw mapDatabaseError(err);
    }
  }

  private async fetchUsernames(userIds: string[]): Promise<Map<string, string>> {
    const map = new Map<string, string>();
    if (userIds.length === 0) return map;

    try {
      const rows = await db
        .select({ id: users.id, username: users.username })
        .from(users)
        .where(inArray(users.id, userIds));
      for (const row of rows) {
        map.set(row.id, row.username);
      }
    } catch {}
    return map;
  }
}

export const leaderboardService = new LeaderboardService();
