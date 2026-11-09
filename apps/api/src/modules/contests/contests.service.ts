import crypto from 'crypto';
import { memoryDb } from '../../config/db.js';
import {
  CreateContestInput,
  Contest,
  LeaderboardEntry,
  Role,
  ERROR_CODES,
  Verdict,
  encodeLeaderboardScore,
  decodeLeaderboardScore,
} from '@judge/shared';
import { AppError } from '../../utils/app-error.js';
import { ContestRow } from '../../../../drizzle/schema.js';

export class ContestsService {
  async createContest(creatorId: string, input: CreateContestInput): Promise<Contest> {
    const id = crypto.randomUUID();
    const contestRow: ContestRow = {
      id,
      title: input.title,
      description: input.description || '',
      start_time: new Date(input.startTime),
      end_time: new Date(input.endTime),
      freeze_minutes: input.freezeMinutes ?? 60,
      created_by: creatorId,
      created_at: new Date(),
    };

    memoryDb.contests.set(id, contestRow);
    return this.mapToDto(contestRow);
  }

  async listContests(): Promise<Contest[]> {
    const contests = Array.from(memoryDb.contests.values());
    contests.sort((a, b) => b.start_time.getTime() - a.start_time.getTime());
    return contests.map((c) => this.mapToDto(c));
  }

  async getContest(id: string): Promise<Contest> {
    const contest = memoryDb.contests.get(id);
    if (!contest) {
      throw new AppError(ERROR_CODES.NOT_FOUND, 'Contest not found', 404);
    }
    return this.mapToDto(contest);
  }

  /**
   * Retrieves contest leaderboard with freeze window enforcement (AC-CT-02).
   * In freeze window, public leaderboard freezes while admin sees real-time data.
   */
  async getContestLeaderboard(contestId: string, callerRole?: Role): Promise<LeaderboardEntry[]> {
    const contest = memoryDb.contests.get(contestId);
    if (!contest) {
      throw new AppError(ERROR_CODES.NOT_FOUND, 'Contest not found', 404);
    }

    const now = new Date();
    const freezeStartTime = new Date(contest.end_time.getTime() - contest.freeze_minutes * 60 * 1000);
    const isFrozenForPublic = now >= freezeStartTime && callerRole !== Role.ADMIN;

    // Filter submissions within contest time bounds
    const submissions = Array.from(memoryDb.submissions.values()).filter((s) => {
      const subTime = s.created_at;
      const inTime = subTime >= contest.start_time && subTime <= contest.end_time;
      if (!inTime) return false;
      // If frozen for public, ignore submissions submitted during freeze window (AC-CT-02)
      if (isFrozenForPublic && subTime >= freezeStartTime) {
        return false;
      }
      return true;
    });

    const userStats = new Map<string, { solved: Set<string>; penalty: number }>();
    for (const sub of submissions) {
      if (sub.verdict === Verdict.ACCEPTED) {
        if (!userStats.has(sub.user_id)) {
          userStats.set(sub.user_id, { solved: new Set(), penalty: 0 });
        }
        const stat = userStats.get(sub.user_id)!;
        if (!stat.solved.has(sub.problem_id)) {
          stat.solved.add(sub.problem_id);
          const penaltyMinutes = Math.floor((sub.created_at.getTime() - contest.start_time.getTime()) / 60000);
          stat.penalty += penaltyMinutes;
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
        username: user?.username || `Participant_${userId.substring(0, 6)}`,
        problemsSolved: stat.solved.size,
        totalPenaltySeconds: stat.penalty * 60,
        score,
      });
    }

    entries.sort((a, b) => b.score - a.score);
    entries.forEach((e, idx) => {
      e.rank = idx + 1;
    });

    return entries;
  }

  private mapToDto(c: ContestRow): Contest {
    const now = new Date();
    const isOpen = now >= c.start_time && now < c.end_time;
    const isEnded = now >= c.end_time;
    const freezeStartTime = new Date(c.end_time.getTime() - c.freeze_minutes * 60 * 1000);
    const isFrozen = now >= freezeStartTime && now < c.end_time;

    return {
      id: c.id,
      title: c.title,
      description: c.description,
      startTime: c.start_time.toISOString(),
      endTime: c.end_time.toISOString(),
      freezeMinutes: c.freeze_minutes,
      createdBy: c.created_by,
      isOpen,
      isFrozen,
      isEnded,
      createdAt: c.created_at.toISOString(),
    };
  }
}

export const contestsService = new ContestsService();
