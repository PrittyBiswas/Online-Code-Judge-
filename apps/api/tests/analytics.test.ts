import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import { Role, Verdict } from '@judge/shared';
import { analyticsService } from '../src/modules/analytics/analytics.service.js';
import { analyticsController } from '../src/modules/analytics/analytics.controller.js';

const USER_A = '11111111-1111-4111-8111-111111111111';
const USER_B = '22222222-2222-4222-8222-222222222222';
const PROB_EASY = '33333333-3333-4333-8333-333333333331';
const PROB_MED = '33333333-3333-4333-8333-333333333332';
const PROB_HARD = '33333333-3333-4333-8333-333333333333';
const PROB_ARCHIVED = '33333333-3333-4333-8333-333333333334';

const store = {
  problems: [
    { id: PROB_EASY, title: 'Two Sum', difficulty: 'easy', isArchived: false },
    { id: PROB_MED, title: 'Add Two Numbers', difficulty: 'medium', isArchived: false },
    { id: PROB_HARD, title: 'Median of Two Sorted Arrays', difficulty: 'hard', isArchived: false },
    { id: PROB_ARCHIVED, title: 'Old Problem', difficulty: 'easy', isArchived: true },
  ],
  submissions: [] as any[],
};

vi.mock('../src/config/redis.js', () => ({
  isRedisHealthy: vi.fn(() => true),
  redisClient: {
    zrevrank: vi.fn(async (_key: string, member: string) => {
      if (member === USER_A) return 0; // Rank 1
      return null;
    }),
  },
}));

vi.mock('../src/db/index.js', () => ({
  db: {
    select: () => ({
      from: (table: any) => {
        const isSubmissions =
          table?.[Symbol.for('drizzle:Name')] === 'submissions' ||
          table?.name === 'submissions' ||
          table?._?.name === 'submissions';

        return {
          where: (cond: any) => {
            // Filter by userId if submissions
            return {
              orderBy: () => {
                if (isSubmissions) {
                  // extract userId if present
                  let targetUserId = USER_A;
                  if (cond && cond.queryChunks) {
                    for (const chunk of cond.queryChunks) {
                      if (chunk?.value === USER_B) targetUserId = USER_B;
                      if (chunk?.value === USER_A) targetUserId = USER_A;
                    }
                  }
                  return Promise.resolve(
                    store.submissions.filter((s) => s.userId === targetUserId)
                  );
                }
                return Promise.resolve(store.problems);
              },
              then: (resolve: any) => {
                if (isSubmissions) {
                  return resolve(store.submissions);
                }
                return resolve(store.problems);
              },
            };
          },
          then: (resolve: any) => {
            if (isSubmissions) {
              return resolve(store.submissions);
            }
            return resolve(store.problems);
          },
        };
      },
    }),
  },
}));

function createMockReqRes(options: { userId?: string } = {}) {
  const req = {
    user: options.userId ? { id: options.userId, role: Role.USER } : undefined,
  } as unknown as Request;

  const res = {
    statusCode: 200,
    body: null as any,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: any) {
      this.body = payload;
      return this;
    },
  } as unknown as Response & { statusCode: number; body: any };

  const next = vi.fn() as unknown as NextFunction;
  return { req, res, next };
}

describe('Phase 5 Analytics Service and Controller', () => {
  beforeEach(() => {
    store.submissions = [
      // USER A submissions
      {
        id: 'sub-1',
        problemId: PROB_EASY,
        userId: USER_A,
        language: 'javascript',
        status: 'COMPLETED',
        verdict: Verdict.ACCEPTED,
        executionTimeMs: 45,
        memoryUsedKb: 12000,
        createdAt: new Date('2026-03-01T10:00:00Z'),
      },
      {
        id: 'sub-2',
        problemId: PROB_EASY, // re-solve same problem
        userId: USER_A,
        language: 'python',
        status: 'COMPLETED',
        verdict: Verdict.ACCEPTED,
        executionTimeMs: 60,
        memoryUsedKb: 15000,
        createdAt: new Date('2026-03-01T11:00:00Z'),
      },
      {
        id: 'sub-3',
        problemId: PROB_MED,
        userId: USER_A,
        language: 'rust',
        status: 'COMPLETED',
        verdict: Verdict.WRONG_ANSWER,
        executionTimeMs: 15,
        memoryUsedKb: 8000,
        createdAt: new Date('2026-03-02T10:00:00Z'),
      },
      {
        id: 'sub-4',
        problemId: PROB_MED,
        userId: USER_A,
        language: 'rust',
        status: 'COMPLETED',
        verdict: Verdict.TIME_LIMIT_EXCEEDED,
        executionTimeMs: 2000,
        memoryUsedKb: 9000,
        createdAt: new Date('2026-03-02T12:00:00Z'),
      },
      // USER B submission
      {
        id: 'sub-b1',
        problemId: PROB_HARD,
        userId: USER_B,
        language: 'cpp',
        status: 'COMPLETED',
        verdict: Verdict.ACCEPTED,
        executionTimeMs: 10,
        memoryUsedKb: 5000,
        createdAt: new Date('2026-03-02T14:00:00Z'),
      },
    ];
  });

  describe('analyticsService.getUserAnalytics', () => {
    it('calculates correct overview metrics for User A', async () => {
      const analytics = await analyticsService.getUserAnalytics(USER_A);

      expect(analytics.overview.totalSubmissions).toBe(4);
      expect(analytics.overview.totalAccepted).toBe(2);
      expect(analytics.overview.acceptanceRate).toBe(50.0);
      expect(analytics.overview.totalSolvedProblems).toBe(1); // PROB_EASY solved twice counts as 1
      expect(analytics.overview.totalAttemptedProblems).toBe(2); // PROB_EASY and PROB_MED
      expect(analytics.overview.globalRank).toBe(1);
    });

    it('calculates correct difficulty breakdown excluding archived problems', async () => {
      const analytics = await analyticsService.getUserAnalytics(USER_A);

      expect(analytics.difficultyBreakdown.easy).toEqual({ solved: 1, total: 1 });
      expect(analytics.difficultyBreakdown.medium).toEqual({ solved: 0, total: 1 });
      expect(analytics.difficultyBreakdown.hard).toEqual({ solved: 0, total: 1 });
    });

    it('calculates correct verdict distribution', async () => {
      const analytics = await analyticsService.getUserAnalytics(USER_A);

      const ac = analytics.verdictDistribution.find((v) => v.verdict === Verdict.ACCEPTED);
      const wa = analytics.verdictDistribution.find((v) => v.verdict === Verdict.WRONG_ANSWER);
      const tle = analytics.verdictDistribution.find(
        (v) => v.verdict === Verdict.TIME_LIMIT_EXCEEDED
      );

      expect(ac?.count).toBe(2);
      expect(ac?.percentage).toBe(50.0);
      expect(wa?.count).toBe(1);
      expect(wa?.percentage).toBe(25.0);
      expect(tle?.count).toBe(1);
      expect(tle?.percentage).toBe(25.0);
    });

    it('calculates correct language usage stats', async () => {
      const analytics = await analyticsService.getUserAnalytics(USER_A);

      const rust = analytics.languageUsage.find((l) => l.language === 'rust');
      const js = analytics.languageUsage.find((l) => l.language === 'javascript');
      const py = analytics.languageUsage.find((l) => l.language === 'python');

      expect(rust?.count).toBe(2);
      expect(rust?.percentage).toBe(50.0);
      expect(js?.count).toBe(1);
      expect(js?.percentage).toBe(25.0);
      expect(py?.count).toBe(1);
      expect(py?.percentage).toBe(25.0);
    });

    it('aggregates activity heatmap entries by date', async () => {
      const analytics = await analyticsService.getUserAnalytics(USER_A);

      expect(analytics.activityHeatmap).toEqual([
        { date: '2026-03-01', count: 2, acceptedCount: 2 },
        { date: '2026-03-02', count: 2, acceptedCount: 0 },
      ]);
    });

    it('includes performance trends for accepted submissions with problem titles', async () => {
      const analytics = await analyticsService.getUserAnalytics(USER_A);

      expect(analytics.performanceTrends.length).toBe(2);
      expect(analytics.performanceTrends[0].problemTitle).toBe('Two Sum');
      expect(analytics.performanceTrends[0].executionTimeMs).toBeDefined();
      expect(analytics.performanceTrends[0].memoryUsedKb).toBeDefined();
    });

    it('handles zero submissions gracefully without NaN or errors', async () => {
      store.submissions = [];
      const analytics = await analyticsService.getUserAnalytics(USER_A);

      expect(analytics.overview.totalSubmissions).toBe(0);
      expect(analytics.overview.totalAccepted).toBe(0);
      expect(analytics.overview.acceptanceRate).toBe(0);
      expect(analytics.overview.totalSolvedProblems).toBe(0);
      expect(analytics.overview.totalAttemptedProblems).toBe(0);
      expect(analytics.languageUsage).toEqual([]);
      expect(analytics.activityHeatmap).toEqual([]);
      expect(analytics.performanceTrends).toEqual([]);
    });
  });

  describe('analyticsController.getMyAnalytics', () => {
    it('returns 200 with user analytics data', async () => {
      const { req, res, next } = createMockReqRes({ userId: USER_A });

      await analyticsController.getMyAnalytics(req, res, next);

      expect(res.statusCode).toBe(200);
      expect(res.body.data).toBeDefined();
      expect(res.body.data.overview.totalSubmissions).toBe(4);
      expect(next).not.toHaveBeenCalled();
    });

    it('calls next with error if service throws', async () => {
      const { req, res, next } = createMockReqRes({ userId: USER_A });
      vi.spyOn(analyticsService, 'getUserAnalytics').mockRejectedValueOnce(new Error('DB failure'));

      await analyticsController.getMyAnalytics(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(Error));
    });
  });
});
