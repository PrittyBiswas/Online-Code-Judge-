import { apiClient } from './apiClient';
import type {
  Contest,
  ContestProblemSummary,
  ContestRegistrationResponse,
  ContestUnregistrationResponse,
  CreateContestInput,
  LeaderboardEntry,
} from '../types';

interface ContestListEnvelope {
  data: {
    contests: Contest[];
  };
}

interface ContestDetailEnvelope {
  data: {
    contest: Contest;
  };
}

interface ContestProblemsEnvelope {
  data: {
    problems: ContestProblemSummary[];
  };
}

interface ContestRegistrationEnvelope {
  data: ContestRegistrationResponse;
}

interface ContestUnregistrationEnvelope {
  data: ContestUnregistrationResponse;
}

interface ContestLeaderboardEnvelope {
  data: {
    leaderboard: LeaderboardEntry[];
  };
}

export async function getContests(signal?: AbortSignal): Promise<Contest[]> {
  const response = await apiClient.get<ContestListEnvelope>('/api/contests', { signal });
  return response.data.data.contests;
}

export async function getContest(contestId: string, signal?: AbortSignal): Promise<Contest> {
  const response = await apiClient.get<ContestDetailEnvelope>(
    `/api/contests/${encodeURIComponent(contestId)}`,
    { signal }
  );
  return response.data.data.contest;
}

export async function getContestProblems(
  contestId: string,
  signal?: AbortSignal
): Promise<ContestProblemSummary[]> {
  const response = await apiClient.get<ContestProblemsEnvelope>(
    `/api/contests/${encodeURIComponent(contestId)}/problems`,
    { signal }
  );
  return response.data.data.problems;
}

export async function registerForContest(contestId: string): Promise<ContestRegistrationResponse> {
  const response = await apiClient.post<ContestRegistrationEnvelope>(
    `/api/contests/${encodeURIComponent(contestId)}/register`
  );
  return response.data.data;
}

export async function unregisterFromContest(
  contestId: string
): Promise<ContestUnregistrationResponse> {
  const response = await apiClient.delete<ContestUnregistrationEnvelope>(
    `/api/contests/${encodeURIComponent(contestId)}/register`
  );
  return response.data.data;
}

export async function getContestLeaderboard(
  contestId: string,
  signal?: AbortSignal
): Promise<LeaderboardEntry[]> {
  const response = await apiClient.get<ContestLeaderboardEnvelope>(
    `/api/contests/${encodeURIComponent(contestId)}/leaderboard`,
    { signal }
  );
  return response.data.data.leaderboard;
}

export function getContestLeaderboardLiveUrl(contestId: string): string {
  return `/api/contests/${encodeURIComponent(contestId)}/leaderboard/live`;
}

export async function createContest(
  input: CreateContestInput,
  signal?: AbortSignal
): Promise<Contest> {
  const response = await apiClient.post<ContestDetailEnvelope>('/api/contests', input, { signal });
  return response.data.data.contest;
}
