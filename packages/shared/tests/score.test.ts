import { describe, it, expect } from 'vitest';
import { encodeLeaderboardScore, decodeLeaderboardScore } from '../src/utils/score.js';

describe('Leaderboard Score Encoding (Card 6 & AC-LB-04)', () => {
  it('ranks higher problems solved strictly above fewer problems solved', () => {
    // User 1: 4 problems solved with high penalty (5000s)
    const scoreUser1 = encodeLeaderboardScore(4, 5000);
    // User 2: 3 problems solved with zero penalty (0s)
    const scoreUser2 = encodeLeaderboardScore(3, 0);

    expect(scoreUser1).toBeGreaterThan(scoreUser2);
  });

  it('breaks ties using lower total penalty time (AC-LB-04)', () => {
    // Both users solved 2 problems
    // User A took 150 seconds penalty
    const scoreUserA = encodeLeaderboardScore(2, 150);
    // User B took 300 seconds penalty
    const scoreUserB = encodeLeaderboardScore(2, 300);

    expect(scoreUserA).toBeGreaterThan(scoreUserB);
  });

  it('encodes and decodes score accurately without loss', () => {
    const problems = 5;
    const penalty = 1234;
    const score = encodeLeaderboardScore(problems, penalty);
    const decoded = decodeLeaderboardScore(score);

    expect(decoded.problemsSolved).toBe(problems);
    expect(decoded.totalPenaltySeconds).toBe(penalty);
  });
});

