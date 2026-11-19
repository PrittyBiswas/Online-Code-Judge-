import { desc, eq } from 'drizzle-orm';
import {
  DifficultyBreakdown,
  LanguageStat,
  PerformanceTrendPoint,
  SupportedLanguage,
  UserAnalytics,
  Verdict,
  VerdictStat,
  REDIS_KEYS,
} from '@judge/shared';
import { db } from '../../db/index.js';
import { problems, submissions } from '../../db/schema.js';
import { redisClient, isRedisHealthy } from '../../config/redis.js';
import { logger } from '../../utils/logger.js';

export class AnalyticsService {
  async getUserAnalytics(userId: string): Promise<UserAnalytics> {
    // 1. Fetch all submissions for the user ordered by creation date descending
    const userSubmissions = await db
      .select({
        id: submissions.id,
        problemId: submissions.problemId,
        language: submissions.language,
        status: submissions.status,
        verdict: submissions.verdict,
        executionTimeMs: submissions.executionTimeMs,
        memoryUsedKb: submissions.memoryUsedKb,
        createdAt: submissions.createdAt,
      })
      .from(submissions)
      .where(eq(submissions.userId, userId))
      .orderBy(desc(submissions.createdAt));

    // 2. Fetch all problems to compute difficulty totals and map titles
    const allProblems = await db
      .select({
        id: problems.id,
        title: problems.title,
        difficulty: problems.difficulty,
        isArchived: problems.isArchived,
      })
      .from(problems);

    const activeProblems = allProblems.filter((p) => !p.isArchived);
    const problemMap = new Map(allProblems.map((p) => [p.id, p]));

    // 3. Overview calculation
    const totalSubmissions = userSubmissions.length;
    const acceptedSubmissions = userSubmissions.filter(
      (s) => s.verdict === Verdict.ACCEPTED || s.verdict === 'ACCEPTED'
    );
    const totalAccepted = acceptedSubmissions.length;
    const acceptanceRate =
      totalSubmissions > 0 ? Math.round((totalAccepted / totalSubmissions) * 1000) / 10 : 0;

    const solvedProblemIds = new Set(acceptedSubmissions.map((s) => s.problemId));
    const attemptedProblemIds = new Set(userSubmissions.map((s) => s.problemId));

    const totalSolvedProblems = solvedProblemIds.size;
    const totalAttemptedProblems = attemptedProblemIds.size;

    // 4. Global rank from Redis if available
    let globalRank: number | null = null;
    if (isRedisHealthy() && redisClient && typeof redisClient.zrevrank === 'function') {
      try {
        const rankIndex = await redisClient.zrevrank(
          REDIS_KEYS.GLOBAL_LEADERBOARD,
          userId
        );
        if (rankIndex !== null && rankIndex !== undefined) {
          globalRank = Number(rankIndex) + 1;
        }
      } catch (err) {
        logger.debug(
          { err: err instanceof Error ? err.message : String(err), userId },
          'Redis rank lookup fallback'
        );
      }
    }

    // 5. Difficulty breakdown
    let totalEasy = 0;
    let totalMedium = 0;
    let totalHard = 0;
    let solvedEasy = 0;
    let solvedMedium = 0;
    let solvedHard = 0;

    for (const prob of activeProblems) {
      const diff = prob.difficulty?.toLowerCase();
      if (diff === 'easy') {
        totalEasy++;
        if (solvedProblemIds.has(prob.id)) solvedEasy++;
      } else if (diff === 'hard') {
        totalHard++;
        if (solvedProblemIds.has(prob.id)) solvedHard++;
      } else {
        totalMedium++;
        if (solvedProblemIds.has(prob.id)) solvedMedium++;
      }
    }

    const difficultyBreakdown: DifficultyBreakdown = {
      easy: { solved: solvedEasy, total: totalEasy },
      medium: { solved: solvedMedium, total: totalMedium },
      hard: { solved: solvedHard, total: totalHard },
    };

    // 6. Verdict distribution
    const standardVerdicts = [
      Verdict.ACCEPTED,
      Verdict.WRONG_ANSWER,
      Verdict.TIME_LIMIT_EXCEEDED,
      Verdict.MEMORY_LIMIT_EXCEEDED,
      Verdict.RUNTIME_ERROR,
      Verdict.COMPILATION_ERROR,
    ];

    const verdictDistribution: VerdictStat[] = standardVerdicts.map((v) => {
      const count = userSubmissions.filter((s) => s.verdict === v).length;
      const percentage =
        totalSubmissions > 0 ? Math.round((count / totalSubmissions) * 1000) / 10 : 0;
      return { verdict: v, count, percentage };
    });

    // 7. Language usage
    const langMap = new Map<SupportedLanguage, number>();
    for (const s of userSubmissions) {
      if (s.language) {
        const lang = s.language as SupportedLanguage;
        langMap.set(lang, (langMap.get(lang) || 0) + 1);
      }
    }

    const languageUsage: LanguageStat[] = Array.from(langMap.entries())
      .map(([language, count]) => ({
        language,
        count,
        percentage: totalSubmissions > 0 ? Math.round((count / totalSubmissions) * 1000) / 10 : 0,
      }))
      .sort((a, b) => b.count - a.count);

    // 8. Activity heatmap
    const dateMap = new Map<string, { count: number; acceptedCount: number }>();
    for (const s of userSubmissions) {
      const d = new Date(s.createdAt);
      const dateStr = d.toISOString().slice(0, 10);
      const current = dateMap.get(dateStr) ?? { count: 0, acceptedCount: 0 };
      current.count += 1;
      if (s.verdict === Verdict.ACCEPTED || s.verdict === 'ACCEPTED') {
        current.acceptedCount += 1;
      }
      dateMap.set(dateStr, current);
    }

    const activityHeatmap = Array.from(dateMap.entries())
      .map(([date, stats]) => ({
        date,
        count: stats.count,
        acceptedCount: stats.acceptedCount,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    // 9. Performance trends (up to 20 recent accepted submissions)
    const performanceTrends: PerformanceTrendPoint[] = acceptedSubmissions.slice(0, 20).map((s) => {
      const prob = problemMap.get(s.problemId);
      return {
        submissionId: s.id,
        problemId: s.problemId,
        problemTitle: prob?.title ?? 'Unknown Problem',
        language: s.language as SupportedLanguage,
        verdict: (s.verdict as Verdict) ?? Verdict.ACCEPTED,
        executionTimeMs:
          s.executionTimeMs !== null && s.executionTimeMs !== undefined
            ? Number(s.executionTimeMs)
            : undefined,
        memoryUsedKb:
          s.memoryUsedKb !== null && s.memoryUsedKb !== undefined
            ? Number(s.memoryUsedKb)
            : undefined,
        createdAt: new Date(s.createdAt).toISOString(),
      };
    });

    return {
      overview: {
        totalSubmissions,
        totalAccepted,
        acceptanceRate,
        totalSolvedProblems,
        totalAttemptedProblems,
        globalRank,
      },
      difficultyBreakdown,
      verdictDistribution,
      languageUsage,
      activityHeatmap,
      performanceTrends,
    };
  }
}

export const analyticsService = new AnalyticsService();
