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

export enum ProblemVisibility {
  PUBLIC = 'public',
  CONTEST_ONLY = 'contest_only',
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
  visibility: ProblemVisibility;
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
  contestId?: string | null;
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
  contestId?: string;
}

export type SampleRunStatus = 'QUEUED' | 'RUNNING' | 'COMPLETED' | 'FAILED';

export type SampleRunOutcome =
  | 'SUCCESS'
  | 'COMPILATION_ERROR'
  | 'RUNTIME_ERROR'
  | 'TIME_LIMIT_EXCEEDED'
  | 'MEMORY_LIMIT_EXCEEDED'
  | 'OUTPUT_LIMIT_EXCEEDED'
  | 'INTERNAL_ERROR';

export interface SampleRunJobData {
  type: 'SAMPLE_RUN';
  runId: string;
  problemId: string;
  userId: string;
  code: string;
  language: SupportedLanguage;
  sampleInput: string;
  timeLimitMs: number;
  memoryLimitMb: number;
}

export interface SampleRunResult {
  runId: string;
  problemId: string;
  language: SupportedLanguage;
  status: SampleRunStatus;
  outcome?: SampleRunOutcome;
  stdout?: string;
  stderr?: string;
  expectedOutput?: string;
  executionTimeMs?: number;
  memoryUsedKb?: number;
  exitCode?: number | null;
  errorMessage?: string;
  createdAt: string;
  updatedAt: string;
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

export interface ContestUpdateEvent {
  contestId: string;
  submissionId: string;
  problemId: string;
  userId: string;
  verdict: Verdict;
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

export interface LeaderboardPagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface LeaderboardResponse {
  leaderboard: LeaderboardEntry[];
  pagination: LeaderboardPagination;
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

export type ContestStatus = 'UPCOMING' | 'RUNNING' | 'ENDED';

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
  status?: ContestStatus;
  problemCount?: number;
  participantCount?: number;
  isRegistered?: boolean;
  createdAt: string;
  updatedAt?: string;
}

export interface ContestProblem {
  contestId: string;
  problemId: string;
  problemOrder: number;
  problem?: Problem;
}

export interface ContestProblemSummary {
  id: string;
  title: string;
  slug: string;
  difficulty: ProblemDifficulty;
  problemOrder: number;
  statement?: string;
  tags?: string[];
  timeLimitMs?: number;
  memoryLimitMb?: number;
  sampleInput?: string;
  sampleExpectedOutput?: string;
}

export interface ContestRegistrationResponse {
  registered: boolean;
  registeredAt: string;
}

export interface ContestUnregistrationResponse {
  unregistered: boolean;
}

export interface ApiResponse<T = any> {
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
}
