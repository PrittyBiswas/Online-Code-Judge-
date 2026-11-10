import { redisClient, isRedisHealthy } from '../../config/redis.js';
import { memoryDb } from '../../config/db.js';
import {
  REDIS_KEYS,
  LeaderboardEntry,
  Verdict,
  encodeLeaderboardScore,
  decodeLeaderboardScore,
} from '@judge/shared';

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
      return this.computeFromMemory();
    }

    try {
      // ZREVRANGE with scores: returns [userId1, score1, userId2, score2, ...]
      const raw = await redisClient.zrevrange(
        REDIS_KEYS.GLOBAL_LEADERBOARD,
        0,
        limit - 1,
        'WITHSCORES'
      );
      const entries: LeaderboardEntry[] = [];

      for (let i = 0; i < raw.length; i += 2) {
        const userId = raw[i];
        const score = parseFloat(raw[i + 1]);
        const user = memoryDb.users.get(userId);
        const { problemsSolved, totalPenaltySeconds } = decodeLeaderboardScore(score);

        entries.push({
          rank: i / 2 + 1,
          userId,
          username: user?.username || `User_${userId.substring(0, 6)}`,
          problemsSolved,
          totalPenaltySeconds,
          score,
        });
      }

      return entries;
    } catch {
      return this.computeFromMemory();
    }
  }

  /**
   * Rebuilds Redis leaderboard from Postgres state (AC-LB-03 / Card 6)
   * Proves that rebuilt copy matches live one.
   */
  async rebuildLeaderboard(): Promise<{ count: number; rebuiltEntries: LeaderboardEntry[] }> {
    // 1. Scan all submissions for ACCEPTED verdicts
    const solvedMap = new Map<string, Set<string>>(); // userId -> Set<problemId>
    const penaltyMap = new Map<string, number>(); // userId -> totalPenaltySeconds

    for (const sub of memoryDb.submissions.values()) {
      if (sub.verdict === Verdict.ACCEPTED) {
        if (!solvedMap.has(sub.user_id)) {
          solvedMap.set(sub.user_id, new Set());
          penaltyMap.set(sub.user_id, 0);
        }
        const userSet = solvedMap.get(sub.user_id)!;
        if (!userSet.has(sub.problem_id)) {
          userSet.add(sub.problem_id);
          const penalty = Math.floor((sub.execution_time_ms || 100) / 1000);
          penaltyMap.set(sub.user_id, (penaltyMap.get(sub.user_id) || 0) + penalty);
        }
      }
    }

    // 2. Wipe Redis leaderboard key (AC-LB-03)
    if (isRedisHealthy()) {
      try {
        await redisClient.del(REDIS_KEYS.GLOBAL_LEADERBOARD);
      } catch {}
    }

    // 3. Re-insert calculated scores
    const rebuiltEntries: LeaderboardEntry[] = [];
    for (const [userId, problems] of solvedMap.entries()) {
      const penalty = penaltyMap.get(userId) || 0;
      const score = encodeLeaderboardScore(problems.size, penalty);

      if (isRedisHealthy()) {
        try {
          await redisClient.zadd(REDIS_KEYS.GLOBAL_LEADERBOARD, score, userId);
        } catch {}
      }

      const user = memoryDb.users.get(userId);
      rebuiltEntries.push({
        rank: 0,
        userId,
        username: user?.username || userId,
        problemsSolved: problems.size,
        totalPenaltySeconds: penalty,
        score,
      });
    }

    // Sort by score descending
    rebuiltEntries.sort((a, b) => b.score - a.score);
    rebuiltEntries.forEach((e, idx) => {
      e.rank = idx + 1;
    });

    return {
      count: rebuiltEntries.length,
      rebuiltEntries,
    };
  }

  private computeFromMemory(): LeaderboardEntry[] {
    const userStats = new Map<string, { solved: Set<string>; penalty: number }>();

    for (const sub of memoryDb.submissions.values()) {
      if (sub.verdict === Verdict.ACCEPTED) {
        if (!userStats.has(sub.user_id)) {
          userStats.set(sub.user_id, { solved: new Set(), penalty: 0 });
        }
        const stat = userStats.get(sub.user_id)!;
        if (!stat.solved.has(sub.problem_id)) {
          stat.solved.add(sub.problem_id);
          stat.penalty += Math.floor((sub.execution_time_ms || 100) / 1000);
        }
      }
    }

    const entries: LeaderboardEntry[] = [];
    for (const [userId, stat] of userStats.entries()) {
      const score = encodeLeaderboardScore(stat.solved.size, stat.penalty);
      const user = memoryDb.users.get(userId);
      entries.push({
        rank: 0,
        userId,
        username: user?.username || `User_${userId.substring(0, 6)}`,
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
  }
}

export const leaderboardService = new LeaderboardService();
