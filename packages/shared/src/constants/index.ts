export const APP_INFO = {
  NAME: 'Online Code Judge',
  VERSION: '1.0.0',
} as const;

export const LIMITS = {
  MAX_CODE_SIZE_BYTES: 64 * 1024, // 64 KB
  MAX_OUTPUT_BYTES: 64 * 1024, // 64 KB
  DEFAULT_TIME_LIMIT_MS: 2000,
  MAX_TIME_LIMIT_MS: 10000,
  DEFAULT_MEMORY_LIMIT_MB: 128,
  MAX_MEMORY_LIMIT_MB: 512,
  TMPFS_SIZE_MB: 16,
  PIDS_LIMIT: 64,
  CPUS_LIMIT: '0.5',
  OUTPUT_TRUNCATION_LIMIT: 2048,
};

export const SECURITY = {
  SANDBOX_USER: '1000:1000',
  DEFAULT_SANDBOX_IMAGE: 'node:20-alpine',
  DEFAULT_PYTHON_IMAGE: 'python:3.11-alpine',
};

export const RATE_LIMITS = {
  LOGIN_MAX_FAILURES: 5,
  LOGIN_LOCKOUT_SECONDS: 900, // 15 minutes lockout window
  LOGIN_WINDOW_SECONDS: 300, // 5 minutes failure window
  SUBMISSIONS_PER_MINUTE: 5,
  DOUBLE_CLICK_GUARD_SECONDS: 3,
};

export const QUEUES = {
  JUDGE: 'judge-queue',
  CRON: 'cron-queue',
};

export const REDIS_KEYS = {
  PREFIX: 'judge:',
  AUTH_FAILURES: (target: string) => `judge:auth:fail:${target}`,
  AUTH_LOCKOUT: (target: string) => `judge:auth:lockout:${target}`,
  SUBMISSION_RATE: (userId: string) => `judge:rate:sub:${userId}`,
  DOUBLE_CLICK_GUARD: (userId: string, hash: string) => `judge:guard:sub:${userId}:${hash}`,
  PROBLEM_CACHE: (idOrSlug: string) => `judge:cache:problem:${idOrSlug}`,
  GLOBAL_LEADERBOARD: 'judge:leaderboard:global',
  CONTEST_LEADERBOARD: (contestId: string) => `judge:leaderboard:contest:${contestId}`,
  CHANNEL_SUBMISSION_EVENTS: 'judge:pubsub:submissions',
  CRON_LOCK: (jobName: string) => `judge:lock:cron:${jobName}`,
};

export const ERROR_CODES = {
  AUTH_INVALID_CREDENTIALS: 'AUTH_INVALID_CREDENTIALS',
  AUTH_LOCKED_OUT: 'AUTH_LOCKED_OUT',
  AUTH_UNAUTHORIZED: 'AUTH_UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',
  DOUBLE_SUBMIT_GUARD: 'DOUBLE_SUBMIT_GUARD',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  CONTEST_NOT_STARTED: 'CONTEST_NOT_STARTED',
  CONTEST_ENDED: 'CONTEST_ENDED',
  CODE_SIZE_EXCEEDED: 'CODE_SIZE_EXCEEDED',
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];
