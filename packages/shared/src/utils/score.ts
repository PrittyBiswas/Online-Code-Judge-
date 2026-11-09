/**
 * Leaderboard Score Encoding / Decoding (Card 6)
 * Encodes "more problems solved ranks higher; ties broken by lower penalty" into a single float
 * suitable for Redis Sorted Sets (ZADD, ZREVRANGE).
 */

const PENALTY_OFFSET = 10_000_000; // Max penalty capacity (approx 115 days)

export function encodeLeaderboardScore(problemsSolved: number, totalPenaltySeconds: number): number {
  const boundedPenalty = Math.min(Math.max(0, totalPenaltySeconds), PENALTY_OFFSET - 1);
  return problemsSolved * PENALTY_OFFSET + (PENALTY_OFFSET - boundedPenalty);
}

export function decodeLeaderboardScore(score: number): { problemsSolved: number; totalPenaltySeconds: number } {
  const problemsSolved = Math.floor(score / PENALTY_OFFSET);
  const remainder = score % PENALTY_OFFSET;
  const totalPenaltySeconds = PENALTY_OFFSET - remainder;
  return {
    problemsSolved,
    totalPenaltySeconds: Math.max(0, totalPenaltySeconds),
  };
}

/**
 * Timezone helpers (Part 1 Core Definitions: "Store UTC; display and schedule contests in IST")
 */
export function formatIST(dateInput: Date | string | number): string {
  const date = new Date(dateInput);
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  }).format(date);
}

export function toUTC(dateInput: Date | string | number): string {
  return new Date(dateInput).toISOString();
}

