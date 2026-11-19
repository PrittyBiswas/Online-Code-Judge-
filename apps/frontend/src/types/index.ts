export { Role, ProblemDifficulty, SubmissionStatus, Verdict } from '@judge/shared';

export type {
  HealthStatusResponse,
  RootApiInfo,
  Problem,
  ProblemExample,
  SupportedLanguage,
  SampleRunStatus,
  SampleRunOutcome,
  SampleRunResult,
  Submission,
  SubmissionSummary,
  SubmissionPagination,
  SubmissionListResponse,
  QuerySubmissionsInput,
  SubmissionEvent,
  TestCaseResult,
  LeaderboardEntry,
  LeaderboardPagination,
  LeaderboardResponse,
  Contest,
  ContestStatus,
  ContestProblem,
  ContestProblemSummary,
  ContestRegistrationResponse,
  ContestUnregistrationResponse,
  CreateContestInput,
  DifficultyStats,
  DifficultyBreakdown,
  VerdictStat,
  LanguageStat,
  ActivityHeatmapDay,
  PerformanceTrendPoint,
  UserAnalyticsOverview,
  UserAnalytics,
} from '@judge/shared';

export interface LeaderboardQueryParams {
  page?: number;
  limit?: number;
}

export interface AuthUserDto {
  id: string;
  username: string;
  email: string;
  role: string;
}

export interface PlatformFeature {
  title: string;
  description: string;
  status: 'ready' | 'upcoming';
}

export interface ProblemListResponse {
  items: import('@judge/shared').Problem[];
  nextCursor: string | null;
  total?: number;
}

export interface ProblemListQueryParams {
  search?: string;
  difficulty?: import('@judge/shared').ProblemDifficulty;
  tag?: string;
  category?: string;
  cursor?: string;
  limit?: number;
}
