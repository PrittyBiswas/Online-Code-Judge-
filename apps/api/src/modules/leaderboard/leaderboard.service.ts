import { eq, inArray } from 'drizzle-orm';
import { redisClient, isRedisHealthy } from '../../config/redis.js';
import { db } from '../../db/index.js';
import { submissions, users } from '../../db/schema.js';
import {
  REDIS_KEYS,
  LeaderboardEntry,
  Verdict,
  encodeLeaderboardScore,
  decodeLeaderboardScore,
} from '@judge/shared';
import { mapDatabaseError } from '../../utils/db-error.js';

export class LeaderboardService {
  /**
   * Records an ACCEPTED solve for a user and problem (AC-LB-01, AC-LB-02).
   * Idempotent: re-solving the same problem never awards double credit.
   */
  async recordSolve(userId: string, problemId: string, penaltySeconds: number = 0): Promise<void> {
    const solvedSetKey = `judge:user:${userId}:solved`;

    // 1. Check if user already solved this problem (AC-LB-02)
    let alreadySolved = false;
    if (isRedisHealthy()) {
      try {
        const added = await redisClient.sadd(solvedSetKey, problemId);
        alreadySolved = added === 0;
      } catch {}
    }

    if (alreadySolved) {
      return; // Idempotent: No duplicate credit
    }

    // 2. Compute updated score
    let currentScore = 0;
    if (isRedisHealthy()) {
      try {
        const rawScore = await redisClient.zscore(REDIS_KEYS.GLOBAL_LEADERBOARD, userId);
        if (rawScore) {
          currentScore = parseFloat(rawScore);
        }
      } catch {}
    }

    const { problemsSolved, totalPenaltySeconds } = decodeLeaderboardScore(currentScore);
    const newScore = encodeLeaderboardScore(
      problemsSolved + 1,
      totalPenaltySeconds + penaltySeconds
    );

    if (isRedisHealthy()) {
      try {
        await redisClient.zadd(REDIS_KEYS.GLOBAL_LEADERBOARD, newScore, userId);
      } catch {}
    }
  }

  /**
   * Retrieves live global leaderboard from Redis Sorted Set (AC-LB-01, AC-LB-04)
   */
  async getGlobalLeaderboard(limit: number = 50): Promise<LeaderboardEntry[]> {
    if (!isRedisHealthy()) {
      return this.computeFromDatabase();
    }

    try {
      const raw = await redisClient.zrevrange(
        REDIS_KEYS.GLOBAL_LEADERBOARD,
        0,
        limit - 1,
        'WITHSCORES'
      );
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
          rank: i / 2 + 1,
          userId,
          username: usernameMap.get(userId) || `User_${userId.substring(0, 6)}`,
          problemsSolved,
          totalPenaltySeconds,
          score,
        });
      }

      return entries;
    } catch {
      return this.computeFromDatabase();
    }
  }

  /**
   * Rebuilds Redis leaderboard from Postgres state (AC-LB-03 / Card 6)
   */
  async rebuildLeaderboard(): Promise<{ count: number; rebuiltEntries: LeaderboardEntry[] }> {
    try {
      const acceptedSubs = await db
        .select({
          userId: submissions.userId,
          problemId: submissions.problemId,
          executionTimeMs: submissions.executionTimeMs,
        })
        .from(submissions)
        .where(eq(submissions.verdict, Verdict.ACCEPTED));

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

      if (isRedisHealthy()) {
        try {
          await redisClient.del(REDIS_KEYS.GLOBAL_LEADERBOARD);
        } catch {}
      }

      const usernameMap = await this.fetchUsernames(Array.from(solvedMap.keys()));
      const rebuiltEntries: LeaderboardEntry[] = [];

      for (const [userId, problemSet] of solvedMap.entries()) {
        const penalty = penaltyMap.get(userId) || 0;
        const score = encodeLeaderboardScore(problemSet.size, penalty);

        if (isRedisHealthy()) {
          try {
            await redisClient.zadd(REDIS_KEYS.GLOBAL_LEADERBOARD, score, userId);
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

      rebuiltEntries.sort((a, b) => b.score - a.score);
      rebuiltEntries.forEach((e, idx) => {
        e.rank = idx + 1;
      });

      return {
        count: rebuiltEntries.length,
        rebuiltEntries,
      };
    } catch (err) {
      throw mapDatabaseError(err);
    }
  }

  private async computeFromDatabase(): Promise<LeaderboardEntry[]> {
    try {
      const acceptedSubs = await db
        .select({
          userId: submissions.userId,
          problemId: submissions.problemId,
          executionTimeMs: submissions.executionTimeMs,
        })
        .from(submissions)
        .where(eq(submissions.verdict, Verdict.ACCEPTED));

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

      entries.sort((a, b) => b.score - a.score);
      entries.forEach((e, idx) => {
        e.rank = idx + 1;
      });

      return entries;
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
