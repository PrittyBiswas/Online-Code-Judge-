export enum Role {
  USER = 'user',
  PROBLEM_SETTER = 'problem_setter',
  ADMIN = 'admin',
}

export enum Verdict {
  ACCEPTED = 'ACCEPTED',
  WRONG_ANSWER = 'WRONG_ANSWER',
  TIME_LIMIT_EXCEEDED = 'TIME_LIMIT_EXCEEDED',
  MEMORY_LIMIT_EXCEEDED = 'MEMORY_LIMIT_EXCEEDED',
  RUNTIME_ERROR = 'RUNTIME_ERROR',
  COMPILATION_ERROR = 'COMPILATION_ERROR',
  OUTPUT_LIMIT_EXCEEDED = 'OUTPUT_LIMIT_EXCEEDED',
  INTERNAL_ERROR = 'INTERNAL_ERROR',
}

export enum SubmissionStatus {
  QUEUED = 'QUEUED',
  RUNNING = 'RUNNING',
  COMPLETED = 'COMPLETED',
}

export enum ProblemDifficulty {
  EASY = 'easy',
  MEDIUM = 'medium',
  HARD = 'hard',
}

export type SupportedLanguage = 'javascript' | 'python';

export interface User {
  id: string;
  username: string;
  email: string;
  role: Role;
  createdAt: string;
  updatedAt: string;
}

export interface Problem {
  id: string;
  title: string;
  slug: string;
  statement: string;
  difficulty: ProblemDifficulty;
  tags: string[];
  timeLimitMs: number;
  memoryLimitMb: number;
  sampleInput: string;
  sampleExpectedOutput: string;
  setterId: string;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface TestCase {
  id: string;
  problemId: string;
  index: number;
  inputKey: string;
  expectedOutputKey: string;
  isHidden: boolean;
  createdAt: string;
}

export interface TestCaseResult {
  index: number;
  verdict: Verdict;
  executionTimeMs: number;
  memoryUsedKb: number;
  // Hidden test input and output are strictly NEVER returned
  sampleInput?: string;
  sampleExpectedOutput?: string;
  actualOutput?: string;
}

export interface Submission {
  id: string;
  problemId: string;
  userId: string;
  code: string;
  language: SupportedLanguage;
  status: SubmissionStatus;
  verdict?: Verdict;
  executionTimeMs?: number;
  memoryUsedKb?: number;
  failedTestIndex?: number;
  testCaseResults?: TestCaseResult[];
  retryCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface SubmissionJobData {
  submissionId: string;
  problemId: string;
  userId: string;
  code: string;
  language: SupportedLanguage;
  timeLimitMs: number;
  memoryLimitMb: number;
}

export interface SubmissionEvent {
  submissionId: string;
  status: SubmissionStatus | Verdict;
  verdict?: Verdict;
  failedTestIndex?: number;
  executionTimeMs?: number;
  memoryUsedKb?: number;
  timestamp: number;
}

export interface LeaderboardEntry {
  rank: number;
  userId: string;
  username: string;
  problemsSolved: number;
  totalPenaltySeconds: number; // in seconds
  score: number;
}

export interface HealthStatusResponse {
  status: 'ok' | 'healthy' | 'degraded';
  service: string;
  uptime: number;
  timestamp: string;
}

export interface RootApiInfo {
  name: string;
  version: string;
  status: string;
  healthEndpoint: string;
}

export interface Contest {
  id: string;
  title: string;
  description: string;
  startTime: string; // ISO UTC
  endTime: string; // ISO UTC
  freezeMinutes: number;
  createdBy: string;
  isOpen?: boolean;
  isFrozen?: boolean;
  isEnded?: boolean;
  createdAt: string;
}

export interface ContestProblem {
  contestId: string;
  problemId: string;
  problemOrder: number;
  problem?: Problem;
}

export interface ApiResponse<T = any> {
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
}
