import { apiClient } from './apiClient';
import type { Problem, ProblemListQueryParams, ProblemListResponse } from '../types';

interface ProblemListEnvelope {
  data: ProblemListResponse;
}

interface ProblemDetailEnvelope {
  data: {
    problem: Problem;
  };
}

export async function fetchProblems(
  params: ProblemListQueryParams = {},
  signal?: AbortSignal
): Promise<ProblemListResponse> {
  const query: Record<string, string | number> = {};

  if (params.search && params.search.trim().length > 0) {
    query.search = params.search.trim();
  }
  if (params.difficulty) {
    query.difficulty = params.difficulty;
  }
  if (params.tag && params.tag.trim().length > 0) {
    query.tag = params.tag.trim();
  }
  if (params.category && params.category.trim().length > 0) {
    query.category = params.category.trim();
  }
  if (params.cursor) {
    query.cursor = params.cursor;
  }
  if (params.limit !== undefined) {
    query.limit = params.limit;
  }

  const response = await apiClient.get<ProblemListEnvelope>('/api/problems', {
    params: query,
    signal,
  });

  return response.data.data;
}

export async function fetchProblemById(idOrSlug: string, signal?: AbortSignal): Promise<Problem> {
  const response = await apiClient.get<ProblemDetailEnvelope>(
    `/api/problems/${encodeURIComponent(idOrSlug)}`,
    { signal }
  );
  return response.data.data.problem;
}

