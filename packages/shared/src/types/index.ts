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
  NOT_EXECUTED = 'NOT_EXECUTED',
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

export const SUPPORTED_LANGUAGES = [
  'javascript',
  'python',
  'c',
  'cpp',
  'java',
  'go',
  'rust',
] as const;

export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

export interface User {
  id: string;
  username: string;
  email: string;
  role: Role;
  createdAt: string;
  updatedAt: string;
}

export interface UserProfile {
  id: string;
  role: Role;
  createdAt: string;
  updatedAt: string;
  emailVerified: boolean;
  accountStatus: 'active' | 'suspended';

  username: string;
  email: string;
  fullName: string | null;
  phoneNumber: string | null;
  avatarUrl: string | null;
  bio: string | null;
  country: string | null;
  state: string | null;
  city: string | null;

  education: string | null;
  college: string | null;
  degree: string | null;
  skills: string[];
  githubUrl: string | null;
  linkedinUrl: string | null;
  portfolioUrl: string | null;
}

export interface UpdateUserProfileInput {
  username?: string;
  email?: string;
  fullName?: string | null;
  phoneNumber?: string | null;
  avatarUrl?: string | null;
  bio?: string | null;
  country?: string | null;
  state?: string | null;
  city?: string | null;
  education?: string | null;
  college?: string | null;
  degree?: string | null;
  skills?: string[];
  githubUrl?: string | null;
  linkedinUrl?: string | null;
  portfolioUrl?: string | null;
}

export interface ProblemExample {
  input: string;
  output: string;
  explanation?: string;
}

export type UserProblemStatus = 'SOLVED' | 'ATTEMPTED' | 'UNATTEMPTED';

export interface Problem {
  id: string;
  title: string;
  slug: string;
  statement: string;
  description?: string;
  difficulty: ProblemDifficulty;
  tags: string[];
  timeLimitMs: number;
  memoryLimitMb: number;
  sampleInput: string;
  sampleExpectedOutput: string;
  visibility: ProblemVisibility;
  inputFormat?: string;
  outputFormat?: string;
  constraints?: string;
  examples?: ProblemExample[];
  starterCode?: Partial<Record<SupportedLanguage, string>>;
  isPublished?: boolean;
  setterId: string;
  isArchived: boolean;
  submissionStatus?: UserProblemStatus;
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
  isHidden?: boolean;
  // Hidden test input and output are strictly NEVER returned
  sampleInput?: string;
  sampleExpectedOutput?: string;
  actualOutput?: string;
  diagnostic?: string;
}

export interface Submission {
  id: string;
  problemId: string;
  problemTitle?: string;
  problemSlug?: string;
  problemDifficulty?: ProblemDifficulty;
  userId: string;
  contestId?: string | null;
  contestTitle?: string;
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

export interface SubmissionSummary {
  id: string;
  problemId: string;
  problemTitle?: string;
  problemSlug?: string;
  problemDifficulty?: ProblemDifficulty;
  userId: string;
  contestId?: string | null;
  contestTitle?: string;
  language: SupportedLanguage;
  status: SubmissionStatus;
  verdict?: Verdict;
  executionTimeMs?: number;
  memoryUsedKb?: number;
  failedTestIndex?: number;
  retryCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface SubmissionPagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

export interface SubmissionListResponse {
  items: SubmissionSummary[];
  pagination: SubmissionPagination;
  nextCursor?: string | null;
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
  customInput?: string;
  isCustomInput?: boolean;
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
  customInput?: string;
  isCustomInput?: boolean;
  executionTimeMs?: number;
  memoryUsedKb?: number;
  exitCode?: number | null;
  errorMessage?: string;
  createdAt: string;
  updatedAt: string;
}

export interface SubmissionEvent {
  submissionId: string;
  userId?: string;
  contestId?: string;
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

export type NotificationType =
  | 'CONTEST_REGISTERED'
  | 'CONTEST_APPROACHING'
  | 'CONTEST_STARTED'
  | 'CONTEST_SUBMISSION_VERDICT'
  | 'CONTEST_ENDING_SOON'
  | 'CONTEST_ENDED';

export const NOTIFICATION_TYPES: NotificationType[] = [
  'CONTEST_REGISTERED',
  'CONTEST_APPROACHING',
  'CONTEST_STARTED',
  'CONTEST_SUBMISSION_VERDICT',
  'CONTEST_ENDING_SOON',
  'CONTEST_ENDED',
];

export interface Notification<TData = Record<string, any>> {
  id: string;
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  data: TData;
  idempotencyKey?: string | null;
  isRead: boolean;
  createdAt: string;
  readAt: string | null;
}

export interface NotificationActivityItem {
  id: string;
  activityType: 'REGISTRATION' | 'SUBMISSION' | 'NOTIFICATION';
  title: string;
  description: string;
  timestamp: string;
  contestId?: string;
  contestTitle?: string;
  problemId?: string;
  problemTitle?: string;
  verdict?: Verdict;
  metadata?: Record<string, any>;
}

export interface UnreadNotificationCountResponse {
  unreadCount: number;
}

export interface NotificationLiveEvent {
  userId: string;
  notification: Notification;
  timestamp: number;
}

// ============================================================================
// Phase 5: Analytics and Performance Dashboard Types
// ============================================================================

export interface DifficultyStats {
  solved: number;
  total: number;
}

export interface DifficultyBreakdown {
  easy: DifficultyStats;
  medium: DifficultyStats;
  hard: DifficultyStats;
}

export interface VerdictStat {
  verdict: Verdict;
  count: number;
  percentage: number;
}

export interface LanguageStat {
  language: SupportedLanguage;
  count: number;
  percentage: number;
}

export interface ActivityHeatmapDay {
  date: string; // YYYY-MM-DD
  count: number;
  acceptedCount: number;
}

export interface PerformanceTrendPoint {
  submissionId: string;
  problemId: string;
  problemTitle?: string;
  language: SupportedLanguage;
  verdict: Verdict;
  executionTimeMs?: number;
  memoryUsedKb?: number;
  createdAt: string;
}

export interface UserAnalyticsOverview {
  totalSubmissions: number;
  totalAccepted: number;
  acceptanceRate: number;
  totalSolvedProblems: number;
  totalAttemptedProblems: number;
  globalRank?: number | null;
}

export interface UserAnalytics {
  overview: UserAnalyticsOverview;
  difficultyBreakdown: DifficultyBreakdown;
  verdictDistribution: VerdictStat[];
  languageUsage: LanguageStat[];
  activityHeatmap: ActivityHeatmapDay[];
  performanceTrends: PerformanceTrendPoint[];
}
