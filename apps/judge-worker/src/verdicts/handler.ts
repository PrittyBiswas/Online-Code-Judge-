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
    const { submissionId, problemId, userId, evaluation, dbUpdateFn, redisPublisher } = options;
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

    // 3. Update global leaderboard on first ACCEPTED solve
    if (finalVerdict === Verdict.ACCEPTED && redisPublisher && redisPublisher.status === 'ready') {
      try {
        const solvedSetKey = `judge:user:${userId}:solved`;
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
