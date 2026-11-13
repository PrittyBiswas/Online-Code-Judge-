import { apiClient } from './apiClient';
import type { LeaderboardQueryParams, LeaderboardResponse } from '../types';

interface LeaderboardEnvelope {
  data: LeaderboardResponse;
}

export async function fetchLeaderboard(
  params: LeaderboardQueryParams = {},
  signal?: AbortSignal
): Promise<LeaderboardResponse> {
  const query: Record<string, number> = {};
  if (params.page !== undefined) {
    query.page = params.page;
  }
  if (params.limit !== undefined) {
    query.limit = params.limit;
  }

  const response = await apiClient.get<LeaderboardEnvelope>('/api/leaderboard', {
    params: query,
    signal,
  });

  return response.data.data;
}
