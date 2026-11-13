import { useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import {
  AlertCircle,
  Award,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Loader2,
  RefreshCw,
  Trophy,
  Users,
} from 'lucide-react';
import { fetchLeaderboard } from '../services/leaderboardApi';
import { getApiErrorMessage } from '../services/apiClient';
import { useAuth } from '../context/AuthContext';
import type { LeaderboardEntry } from '../types';

function formatPenalty(seconds: number): string {
  if (seconds < 60) {
    return `${seconds}s`;
  }
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}m ${secs}s`;
}

function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/15 px-2.5 py-0.5 text-xs font-bold text-amber-300">
        <Trophy className="h-3.5 w-3.5 text-amber-400" />
        #1
      </span>
    );
  }
  if (rank === 2) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-slate-400/40 bg-slate-400/15 px-2.5 py-0.5 text-xs font-bold text-slate-200">
        <Award className="h-3.5 w-3.5 text-slate-300" />
        #2
      </span>
    );
  }
  if (rank === 3) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-amber-700/40 bg-amber-700/15 px-2.5 py-0.5 text-xs font-bold text-amber-500">
        <Award className="h-3.5 w-3.5 text-amber-600" />
        #3
      </span>
    );
  }
  return <span className="text-sm font-semibold text-slate-400">#{rank}</span>;
}

export function LeaderboardPage() {
  const { user } = useAuth();
  const [page, setPage] = useState(1);
  const limit = 20;

  const { data, isLoading, isFetching, isError, error, refetch } = useQuery({
    queryKey: ['leaderboard', { page, limit }],
    queryFn: ({ signal }) => fetchLeaderboard({ page, limit }, signal),
    placeholderData: keepPreviousData,
  });

  const entries = data?.leaderboard ?? [];
  const pagination = data?.pagination;
  const totalPages = pagination?.totalPages ?? 1;
  const totalUsers = pagination?.total ?? 0;

  function handlePrevPage() {
    if (page > 1 && !isFetching) {
      setPage((prev) => prev - 1);
    }
  }

  function handleNextPage() {
    if (page < totalPages && !isFetching) {
      setPage((prev) => prev + 1);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header section */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/20 text-amber-400">
              <Trophy className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-slate-100">
                Global Leaderboard
              </h1>
              <p className="text-sm text-slate-400">
                Rankings based on total problems solved and penalty time
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => void refetch()}
            disabled={isFetching}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-200 transition hover:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-400 disabled:opacity-50"
            title="Refresh leaderboard"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <div className="flex items-center gap-1.5 rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-1.5 text-xs text-slate-400">
            <Users className="h-3.5 w-3.5 text-slate-500" />
            <span>{totalUsers} Ranked Coders</span>
          </div>
        </div>
      </div>

      {/* Error state */}
      {isError && (
        <div
          role="alert"
          className="flex flex-col gap-3 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-red-200 sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-400" />
            <div>
              <p className="text-sm font-medium">Failed to load leaderboard</p>
              <p className="text-xs text-red-300/80">{getApiErrorMessage(error)}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void refetch()}
            className="inline-flex items-center justify-center rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-red-500 focus:outline-none focus:ring-2 focus:ring-red-400"
          >
            Try again
          </button>
        </div>
      )}

      {/* Loading Skeleton */}
      {isLoading && (
        <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900/40 p-8 text-center">
          <div className="inline-flex items-center gap-2 text-sm text-slate-400">
            <Loader2 className="h-5 w-5 animate-spin text-indigo-400" />
            Loading live standings...
          </div>
        </div>
      )}

      {/* Empty State */}
      {!isLoading && !isError && entries.length === 0 && (
        <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-12 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-slate-800 text-slate-400">
            <Trophy className="h-6 w-6" />
          </div>
          <h3 className="mt-4 text-base font-semibold text-slate-200">No ranked coders yet</h3>
          <p className="mt-1 text-sm text-slate-400">
            Submit an accepted solution to any problem to appear on the leaderboard!
          </p>
        </div>
      )}

      {/* Leaderboard Table */}
      {!isLoading && entries.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900/40">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-300">
              <thead className="border-b border-slate-800 bg-slate-900/80 text-xs uppercase tracking-wider text-slate-400">
                <tr>
                  <th scope="col" className="px-4 py-3.5 font-semibold text-slate-300">
                    Rank
                  </th>
                  <th scope="col" className="px-4 py-3.5 font-semibold text-slate-300">
                    Coder
                  </th>
                  <th scope="col" className="px-4 py-3.5 text-center font-semibold text-slate-300">
                    Problems Solved
                  </th>
                  <th scope="col" className="px-4 py-3.5 text-center font-semibold text-slate-300">
                    Penalty Time
                  </th>
                  <th scope="col" className="px-4 py-3.5 text-right font-semibold text-slate-300">
                    Score
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {entries.map((entry: LeaderboardEntry) => {
                  const isCurrentUser =
                    Boolean(user) &&
                    (user?.id === entry.userId || user?.username === entry.username);

                  return (
                    <tr
                      key={entry.userId}
                      className={`transition-colors hover:bg-slate-800/30 ${
                        isCurrentUser ? 'bg-indigo-500/10 font-medium' : ''
                      }`}
                    >
                      {/* Rank */}
                      <td className="whitespace-nowrap px-4 py-3">
                        <RankBadge rank={entry.rank} />
                      </td>

                      {/* Username */}
                      <td className="whitespace-nowrap px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span
                            className={`font-medium ${
                              isCurrentUser ? 'text-indigo-300' : 'text-slate-100'
                            }`}
                          >
                            {entry.username}
                          </span>
                          {isCurrentUser && (
                            <span className="rounded-full bg-indigo-500/20 px-2 py-0.5 text-xs font-semibold text-indigo-300 border border-indigo-500/30">
                              You
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Solved Count */}
                      <td className="whitespace-nowrap px-4 py-3 text-center">
                        <span className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500/10 px-2.5 py-1 text-xs font-semibold text-emerald-400 border border-emerald-500/20">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          {entry.problemsSolved}
                        </span>
                      </td>

                      {/* Penalty */}
                      <td className="whitespace-nowrap px-4 py-3 text-center text-xs text-slate-400">
                        <span className="inline-flex items-center gap-1">
                          <Clock className="h-3.5 w-3.5 text-slate-500" />
                          {formatPenalty(entry.totalPenaltySeconds)}
                        </span>
                      </td>

                      {/* Score */}
                      <td className="whitespace-nowrap px-4 py-3 text-right font-mono text-xs text-slate-400">
                        {entry.score.toLocaleString()}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination controls */}
          {totalPages > 1 && (
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-800 px-4 py-3 text-xs text-slate-400">
              <div data-testid="pagination-info">
                Page <span className="font-semibold text-slate-200">{page}</span> of{' '}
                <span className="font-semibold text-slate-200">{totalPages}</span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handlePrevPage}
                  disabled={page <= 1 || isFetching}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-200 transition hover:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-400 disabled:opacity-40"
                  aria-label="Previous page"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                  Previous
                </button>

                <button
                  type="button"
                  onClick={handleNextPage}
                  disabled={page >= totalPages || isFetching}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-200 transition hover:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-400 disabled:opacity-40"
                  aria-label="Next page"
                >
                  Next
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
