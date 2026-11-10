import Redis from 'ioredis';
import {
  Verdict,
  SubmissionEvent,
  REDIS_KEYS,
  encodeLeaderboardScore,
  decodeLeaderboardScore,
} from '@judge/shared';
import { EvaluatedSubmission } from '../evaluator/evaluator.js';

export interface VerdictSaveOptions {
  submissionId: string;
  problemId: string;
  userId: string;
  evaluation: EvaluatedSubmission;
  dbUpdateFn?: (
    id: string,
    verdict: Verdict,
    execTime: number,
    failedIndex?: number
  ) => Promise<boolean>;
  redisPublisher?: Redis;
}

export class VerdictHandler {
  /**
   * Saves final verdict idempotently and publishes live update event (Card 2, Card 5, AC-SJ-06, AC-LB-01).
   */
  async processVerdict(options: VerdictSaveOptions): Promise<boolean> {
    const { submissionId, problemId, userId, evaluation, dbUpdateFn, redisPublisher } = options;
    const finalVerdict = evaluation.finalVerdict;

    // 1. Idempotent DB update: UPDATE ... WHERE status IN ('QUEUED', 'RUNNING') (Card 2 / AC-SJ-06)
    if (dbUpdateFn) {
      const updated = await dbUpdateFn(
        submissionId,
        finalVerdict,
        evaluation.maxExecutionTimeMs,
        evaluation.failedTestIndex
      );

      if (!updated) {
        // Already processed or duplicate delivery (Card 2)
        return false;
      }
    }

    // 2. Publish live event via Redis Pub/Sub for SSE streaming (Card 5 / AC-LV-01, AC-LV-02)
    const event: SubmissionEvent = {
      submissionId,
      status: finalVerdict,
      verdict: finalVerdict,
      failedTestIndex: evaluation.failedTestIndex,
      executionTimeMs: evaluation.maxExecutionTimeMs,
      timestamp: Date.now(),
    };

    if (redisPublisher) {
      try {
        await redisPublisher.publish(REDIS_KEYS.CHANNEL_SUBMISSION_EVENTS, JSON.stringify(event));
      } catch {}
    }

    // 3. Update Leaderboard if ACCEPTED (Card 6 / AC-LB-01, AC-LB-02)
    if (finalVerdict === Verdict.ACCEPTED && redisPublisher) {
      try {
        const solvedSetKey = `judge:user:${userId}:solved`;
        // SADD returns 1 if added, 0 if user already solved this problem (AC-LB-02)
        const isFirstSolve = await redisPublisher.sadd(solvedSetKey, problemId);

        if (isFirstSolve === 1) {
          const rawScore = await redisPublisher.zscore(REDIS_KEYS.GLOBAL_LEADERBOARD, userId);
          const currentScore = rawScore ? parseFloat(rawScore) : 0;
          const { problemsSolved, totalPenaltySeconds } = decodeLeaderboardScore(currentScore);
          const penalty = Math.floor(evaluation.maxExecutionTimeMs / 1000);

          const newScore = encodeLeaderboardScore(
            problemsSolved + 1,
            totalPenaltySeconds + penalty
          );
          await redisPublisher.zadd(REDIS_KEYS.GLOBAL_LEADERBOARD, newScore, userId);
        }
      } catch {}
    }

    return true;
  }
}

export const verdictHandler = new VerdictHandler();
