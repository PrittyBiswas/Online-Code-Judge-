export type {
  HealthStatusResponse,
  RootApiInfo,
  Role,
  Problem,
  ProblemDifficulty,
} from '@judge/shared';

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
}

export interface ProblemListQueryParams {
  search?: string;
  difficulty?: import('@judge/shared').ProblemDifficulty;
  tag?: string;
  category?: string;
  cursor?: string;
  limit?: number;
}
