import Redis from 'ioredis';
import {
  Verdict,
  SubmissionEvent,
  ContestUpdateEvent,
  REDIS_KEYS,
  RECORD_SOLVE_LUA_SCRIPT,
  PENALTY_OFFSET,
  encodeLeaderboardScore,
  decodeLeaderboardScore,
} from '@judge/shared';
import { EvaluatedSubmission } from '../evaluator/evaluator.js';

export interface VerdictSaveOptions {
  submissionId: string;
  problemId: string;
  userId: string;
  contestId?: string;
  evaluation: EvaluatedSubmission;
  dbUpdateFn?: (
    id: string,
    verdict: Verdict,
    execTime: number,
    memoryUsedKb: number,
    failedIndex?: number
  ) => Promise<boolean>;
  redisPublisher?: Redis | null;
}

export class VerdictHandler {
  /**
   * Saves final verdict idempotently and publishes live update event (AC-SJ-06, AC-LB-01).
   */
  async processVerdict(options: VerdictSaveOptions): Promise<boolean> {
    const { submissionId, problemId, userId, contestId, evaluation, dbUpdateFn, redisPublisher } =
      options;
    const finalVerdict = evaluation.finalVerdict;

    // 1. Idempotent DB update: UPDATE ... WHERE status IN ('QUEUED', 'RUNNING')
    if (dbUpdateFn) {
      const updated = await dbUpdateFn(
        submissionId,
        finalVerdict,
        evaluation.maxExecutionTimeMs,
        evaluation.maxMemoryUsedKb,
        evaluation.failedTestIndex
      );

      if (!updated) {
        return false;
      }
    }

    // 2. Publish live SSE event via Redis Pub/Sub
    const event: SubmissionEvent = {
      submissionId,
      status: finalVerdict,
      verdict: finalVerdict,
      failedTestIndex: evaluation.failedTestIndex,
      executionTimeMs: evaluation.maxExecutionTimeMs,
      memoryUsedKb: evaluation.maxMemoryUsedKb,
      timestamp: Date.now(),
    };

    if (redisPublisher && redisPublisher.status === 'ready') {
      try {
        await redisPublisher.publish(REDIS_KEYS.CHANNEL_SUBMISSION_EVENTS, JSON.stringify(event));
      } catch {}
    }

    // 3. Atomically update global leaderboard on first ACCEPTED solve (AC-LB-01, AC-LB-02)
    if (finalVerdict === Verdict.ACCEPTED && redisPublisher && redisPublisher.status === 'ready') {
      try {
        const solvedSetKey = `judge:user:${userId}:solved`;
        const penalty = Math.max(0, Math.floor(evaluation.maxExecutionTimeMs / 1000));

        if (typeof redisPublisher.eval === 'function') {
          await redisPublisher.eval(
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
        } else {
          // Graceful fallback for mock clients without eval
          const isFirstSolve = await redisPublisher.sadd(solvedSetKey, problemId);
          if (isFirstSolve === 1) {
            const rawScore = await redisPublisher.zscore(REDIS_KEYS.GLOBAL_LEADERBOARD, userId);
            const currentScore = rawScore ? parseFloat(rawScore) : 0;
            const { problemsSolved, totalPenaltySeconds } = decodeLeaderboardScore(currentScore);
            const newScore = encodeLeaderboardScore(
              problemsSolved + 1,
              totalPenaltySeconds + penalty
            );
            await redisPublisher.zadd(REDIS_KEYS.GLOBAL_LEADERBOARD, newScore, userId);
          }
        }
      } catch {}
    }

    // 4. Publish contest leaderboard update event on ACCEPTED contest submission (Day 19)
    if (
      finalVerdict === Verdict.ACCEPTED &&
      contestId &&
      redisPublisher &&
      redisPublisher.status === 'ready'
    ) {
      try {
        const contestEvent: ContestUpdateEvent = {
          contestId,
          submissionId,
          problemId,
          userId,
          verdict: finalVerdict,
          timestamp: Date.now(),
        };
        await redisPublisher.publish(
          REDIS_KEYS.CHANNEL_CONTEST_UPDATES,
          JSON.stringify(contestEvent)
        );
      } catch {}
    }

    return true;
  }
}

export const verdictHandler = new VerdictHandler();
