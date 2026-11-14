import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import {
  AlertCircle,
  ArrowLeft,
  Award,
  CheckCircle,
  Clock,
  HelpCircle,
  Lock,
  Loader2,
  RefreshCw,
  Trophy,
  UserCheck,
  UserMinus,
  UserPlus,
  Users,
} from 'lucide-react';
import { formatIST } from '@judge/shared';
import {
  getContest,
  getContestLeaderboard,
  getContestProblems,
  registerForContest,
  unregisterFromContest,
} from '../services/contestsApi';
import { getApiErrorMessage } from '../services/apiClient';
import { useAuth } from '../context/AuthContext';
import { DifficultyBadge } from '../components/DifficultyBadge';
import type { Contest } from '../types';

export function getDerivedStatus(
  contest: Contest,
  now: Date = new Date()
): 'UPCOMING' | 'RUNNING' | 'ENDED' {
  const start = new Date(contest.startTime);
  const end = new Date(contest.endTime);
  if (now < start) return 'UPCOMING';
  if (now >= start && now < end) return 'RUNNING';
  return 'ENDED';
}

export function formatTimeRemaining(targetDate: Date, now: Date = new Date()): string {
  const diffMs = targetDate.getTime() - now.getTime();
  if (diffMs <= 0) return '0s';

  const totalSeconds = Math.floor(diffMs / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0 || days > 0) parts.push(`${hours}h`);
  if (minutes > 0 || hours > 0 || days > 0) parts.push(`${minutes}m`);
  parts.push(`${seconds}s`);

  return parts.join(' ');
}

function formatPenalty(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}m ${secs}s`;
}

function ContestRankBadge({ rank }: { rank: number }) {
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

export function ContestDetailPage() {
  const { id } = useParams<{ id: string }>();
  const contestId = id ?? '';
  const queryClient = useQueryClient();
  const { user, status: authStatus } = useAuth();

  const [currentTime, setCurrentTime] = useState<Date>(() => new Date());
  const [regActionPending, setRegActionPending] = useState(false);
  const [regActionError, setRegActionError] = useState<string | null>(null);

  // Live timer interval updated once per second
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // 1. Contest Details Query
  const {
    data: contest,
    isLoading: isContestLoading,
    isError: isContestError,
    error: contestError,
    refetch: refetchContest,
  } = useQuery({
    queryKey: ['contest', contestId],
    queryFn: ({ signal }) => getContest(contestId, signal),
    enabled: Boolean(contestId),
  });

  // 2. Contest Problems Query
  const {
    data: problems = [],
    isLoading: isProblemsLoading,
    isError: isProblemsError,
    error: problemsError,
    refetch: refetchProblems,
  } = useQuery({
    queryKey: ['contest-problems', contestId],
    queryFn: ({ signal }) => getContestProblems(contestId, signal),
    enabled: Boolean(contestId),
    retry: false, // Don't aggressively retry 403 CONTEST_NOT_STARTED
  });

  // 3. Contest Leaderboard Query
  const {
    data: leaderboard = [],
    isLoading: isLeaderboardLoading,
    isFetching: isLeaderboardFetching,
    isError: isLeaderboardError,
    error: leaderboardError,
    refetch: refetchLeaderboard,
  } = useQuery({
    queryKey: ['contest-leaderboard', contestId],
    queryFn: ({ signal }) => getContestLeaderboard(contestId, signal),
    enabled: Boolean(contestId),
  });

  const isContestNotFound =
    axios.isAxiosError(contestError) && contestError.response?.status === 404;

  const derivedStatus = contest ? getDerivedStatus(contest, currentTime) : 'UPCOMING';
  const startTime = contest ? new Date(contest.startTime) : new Date();
  const endTime = contest ? new Date(contest.endTime) : new Date();

  // Registration handlers
  async function handleRegister() {
    if (regActionPending || !contestId) return;
    setRegActionPending(true);
    setRegActionError(null);
    try {
      await registerForContest(contestId);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['contest', contestId] }),
        queryClient.invalidateQueries({ queryKey: ['contests'] }),
      ]);
    } catch (err) {
      setRegActionError(getApiErrorMessage(err, 'Failed to register for contest.'));
    } finally {
      setRegActionPending(false);
    }
  }

  async function handleUnregister() {
    if (regActionPending || !contestId) return;
    setRegActionPending(true);
    setRegActionError(null);
    try {
      await unregisterFromContest(contestId);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['contest', contestId] }),
        queryClient.invalidateQueries({ queryKey: ['contests'] }),
      ]);
    } catch (err) {
      setRegActionError(getApiErrorMessage(err, 'Failed to unregister from contest.'));
    } finally {
      setRegActionPending(false);
    }
  }

  if (isContestLoading) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="flex flex-col items-center justify-center rounded-2xl border border-slate-800 bg-slate-900/60 py-20 text-center"
      >
        <Loader2 className="h-7 w-7 animate-spin text-indigo-400" />
        <p className="mt-3 text-sm text-slate-300">Loading contest details...</p>
      </div>
    );
  }

  if (isContestError || !contest) {
    if (isContestNotFound) {
      return (
        <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-8 text-center">
          <h1 className="text-xl font-bold text-white">Contest not found</h1>
          <p className="mt-2 text-sm text-slate-400">
            The requested contest does not exist or may have been removed.
          </p>
          <Link
            to="/contests"
            className="mt-5 inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-400"
          >
            Back to Contests
          </Link>
        </div>
      );
    }

    return (
      <div
        role="alert"
        className="flex flex-col items-start justify-between gap-4 rounded-xl border border-rose-500/30 bg-rose-500/10 p-5 sm:flex-row sm:items-center"
      >
        <div className="flex items-start gap-3">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-rose-300" />
          <div>
            <h1 className="text-sm font-semibold text-rose-200">Unable to load contest</h1>
            <p className="mt-1 text-sm text-rose-200/80">
              {getApiErrorMessage(contestError, 'Failed to fetch contest details.')}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void refetchContest()}
          className="rounded-lg border border-rose-400/40 bg-rose-500/20 px-4 py-2 text-xs font-semibold text-rose-100 transition hover:bg-rose-500/30 focus:outline-none focus:ring-2 focus:ring-rose-400"
        >
          Try again
        </button>
      </div>
    );
  }

  const isProblemsLocked =
    axios.isAxiosError(problemsError) && problemsError.response?.status === 403;

  return (
    <div className="space-y-8">
      {/* Back button */}
      <div>
        <Link
          to="/contests"
          className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-sm font-medium text-indigo-300 transition hover:bg-slate-800 hover:text-indigo-200 focus:outline-none focus:ring-2 focus:ring-indigo-400"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Contests
        </Link>
      </div>

      {/* Main Contest Header Banner */}
      <section
        aria-labelledby="contest-title"
        className="rounded-2xl border border-slate-800 bg-slate-900/80 p-6 sm:p-8"
      >
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              {derivedStatus === 'RUNNING' && (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-400">
                  <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                  Live Now
                </span>
              )}
              {derivedStatus === 'UPCOMING' && (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-indigo-500/30 bg-indigo-500/10 px-3 py-1 text-xs font-semibold text-indigo-400">
                  <Clock className="h-3.5 w-3.5" />
                  Upcoming
                </span>
              )}
              {derivedStatus === 'ENDED' && (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-700 bg-slate-800 px-3 py-1 text-xs font-semibold text-slate-400">
                  Contest Ended
                </span>
              )}

              {contest.isRegistered ? (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/40 bg-emerald-500/20 px-3 py-1 text-xs font-semibold text-emerald-300">
                  <CheckCircle className="h-3.5 w-3.5" />
                  Registered
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-700 bg-slate-800 px-3 py-1 text-xs font-medium text-slate-400">
                  Not Registered
                </span>
              )}
            </div>

            <h1
              id="contest-title"
              className="text-2xl font-bold tracking-tight text-white sm:text-3xl"
            >
              {contest.title}
            </h1>
            <p className="text-sm leading-relaxed text-slate-300">
              {contest.description || 'No description provided for this contest.'}
            </p>

            <div className="flex flex-wrap items-center gap-4 pt-2 text-xs text-slate-400">
              <span className="inline-flex items-center gap-1.5">
                <Clock className="h-4 w-4 text-slate-500" />
                <span>
                  Start:{' '}
                  <strong className="font-mono text-slate-200">
                    {formatIST(contest.startTime)}
                  </strong>
                </span>
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Clock className="h-4 w-4 text-slate-500" />
                <span>
                  End:{' '}
                  <strong className="font-mono text-slate-200">{formatIST(contest.endTime)}</strong>
                </span>
              </span>
              {contest.participantCount !== undefined && (
                <span className="inline-flex items-center gap-1.5">
                  <Users className="h-4 w-4 text-slate-500" />
                  <span>
                    Participants:{' '}
                    <strong className="text-slate-200">{contest.participantCount}</strong>
                  </span>
                </span>
              )}
              {contest.problemCount !== undefined && (
                <span className="inline-flex items-center gap-1.5">
                  <HelpCircle className="h-4 w-4 text-slate-500" />
                  <span>
                    Problems: <strong className="text-slate-200">{contest.problemCount}</strong>
                  </span>
                </span>
              )}
            </div>
          </div>

          {/* Countdown & Registration Box */}
          <div className="flex flex-col items-center justify-between rounded-xl border border-slate-800 bg-slate-950 p-5 text-center min-w-[240px]">
            <div className="mb-4">
              {derivedStatus === 'UPCOMING' && (
                <div>
                  <span className="text-xs font-semibold uppercase tracking-wider text-indigo-400">
                    Starts In
                  </span>
                  <div className="mt-1 font-mono text-xl font-bold text-white">
                    {formatTimeRemaining(startTime, currentTime)}
                  </div>
                </div>
              )}
              {derivedStatus === 'RUNNING' && (
                <div>
                  <span className="text-xs font-semibold uppercase tracking-wider text-emerald-400">
                    Remaining Time
                  </span>
                  <div className="mt-1 font-mono text-xl font-bold text-white">
                    {formatTimeRemaining(endTime, currentTime)}
                  </div>
                </div>
              )}
              {derivedStatus === 'ENDED' && (
                <div>
                  <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                    Final Standing
                  </span>
                  <div className="mt-1 text-sm font-semibold text-slate-300">Contest Closed</div>
                </div>
              )}
            </div>

            {/* Registration Controls */}
            {authStatus === 'authenticated' ? (
              <div className="w-full space-y-2">
                {regActionError && (
                  <p role="alert" className="text-xs text-rose-400">
                    {regActionError}
                  </p>
                )}

                {!contest.isRegistered && derivedStatus !== 'ENDED' && (
                  <button
                    type="button"
                    onClick={handleRegister}
                    disabled={regActionPending}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white transition hover:bg-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-400 disabled:opacity-60"
                  >
                    {regActionPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <UserPlus className="h-4 w-4" />
                    )}
                    Register for Contest
                  </button>
                )}

                {contest.isRegistered && derivedStatus === 'UPCOMING' && (
                  <button
                    type="button"
                    onClick={handleUnregister}
                    disabled={regActionPending}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-slate-700 bg-slate-800 px-4 py-2 text-xs font-medium text-slate-300 transition hover:bg-slate-700 hover:text-white focus:outline-none focus:ring-2 focus:ring-indigo-400 disabled:opacity-60"
                  >
                    {regActionPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <UserMinus className="h-4 w-4" />
                    )}
                    Unregister
                  </button>
                )}

                {contest.isRegistered && derivedStatus !== 'UPCOMING' && (
                  <div className="inline-flex items-center gap-1.5 text-xs text-emerald-400">
                    <UserCheck className="h-4 w-4" />
                    <span>Registered Participant</span>
                  </div>
                )}
              </div>
            ) : (
              <Link
                to="/login"
                className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-4 py-2 text-xs font-medium text-slate-200 transition hover:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-400"
              >
                Sign in to participate
              </Link>
            )}
          </div>
        </div>
      </section>

      {/* Freeze Warning Banner */}
      {contest.isFrozen && (
        <div
          role="status"
          className="flex items-center gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-amber-200"
        >
          <Clock className="h-5 w-5 shrink-0 text-amber-400" />
          <p className="text-xs sm:text-sm">
            <strong>Leaderboard Frozen:</strong> Standings are currently frozen for public
            participants to preserve end-game suspense. Final results will be revealed once the
            contest concludes.
          </p>
        </div>
      )}

      {/* Contest Problems Section */}
      <section aria-labelledby="contest-problems-heading" className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 id="contest-problems-heading" className="text-xl font-bold tracking-tight text-white">
            Contest Problems
          </h2>
          <button
            type="button"
            onClick={() => void refetchProblems()}
            disabled={isProblemsLoading}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-3 py-1 text-xs font-medium text-slate-300 transition hover:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-400 disabled:opacity-60"
          >
            <RefreshCw className={`h-3 w-3 ${isProblemsLoading ? 'animate-spin' : ''}`} />
            Refresh Problems
          </button>
        </div>

        {isProblemsLoading ? (
          <div
            role="status"
            aria-live="polite"
            className="flex flex-col items-center justify-center rounded-xl border border-slate-800 bg-slate-900/60 py-12 text-center"
          >
            <Loader2 className="h-5 w-5 animate-spin text-indigo-400" />
            <p className="mt-2 text-xs text-slate-400">Loading contest problems...</p>
          </div>
        ) : isProblemsLocked ? (
          <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-8 text-center">
            <Lock className="mx-auto h-8 w-8 text-indigo-400" />
            <h3 className="mt-3 text-sm font-semibold text-slate-200">Problems are Locked</h3>
            <p className="mt-1 text-xs text-slate-400 max-w-md mx-auto">
              Problems for this contest will become accessible when the contest starts on{' '}
              <strong className="text-slate-300">{formatIST(contest.startTime)}</strong>.
            </p>
          </div>
        ) : isProblemsError ? (
          <div
            role="alert"
            className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-xs text-rose-300"
          >
            {getApiErrorMessage(problemsError, 'Failed to load contest problems.')}
          </div>
        ) : problems.length === 0 ? (
          <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-8 text-center text-xs text-slate-400">
            No problems have been added to this contest yet.
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900/80 shadow">
            <table className="min-w-full divide-y divide-slate-800 text-left text-sm">
              <thead className="bg-slate-950 text-xs font-semibold uppercase tracking-wider text-slate-400">
                <tr>
                  <th scope="col" className="px-4 py-3.5">
                    #
                  </th>
                  <th scope="col" className="px-4 py-3.5">
                    Title
                  </th>
                  <th scope="col" className="px-4 py-3.5">
                    Difficulty
                  </th>
                  <th scope="col" className="px-4 py-3.5">
                    Tags
                  </th>
                  <th scope="col" className="px-4 py-3.5 text-right">
                    Action
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {problems.map((p) => (
                  <tr key={p.id} className="transition hover:bg-slate-850/50">
                    <td className="px-4 py-3 font-mono text-xs font-semibold text-slate-400">
                      {p.problemOrder}
                    </td>
                    <td className="px-4 py-3 font-medium text-white">
                      <Link
                        to={`/problems/${p.id}?contestId=${contestId}`}
                        className="transition hover:text-indigo-400 focus:outline-none focus:underline"
                      >
                        {p.title}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <DifficultyBadge difficulty={p.difficulty} />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {p.tags && p.tags.length > 0 ? (
                          p.tags.slice(0, 3).map((tag) => (
                            <span
                              key={tag}
                              className="rounded bg-slate-800 px-2 py-0.5 text-[10px] text-slate-400"
                            >
                              {tag}
                            </span>
                          ))
                        ) : (
                          <span className="text-xs text-slate-600">—</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        to={`/problems/${p.id}?contestId=${contestId}`}
                        className="inline-flex items-center gap-1 rounded-md bg-indigo-600/80 px-3 py-1 text-xs font-semibold text-white transition hover:bg-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-400"
                      >
                        Solve
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Contest Leaderboard Section */}
      <section aria-labelledby="contest-leaderboard-heading" className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Trophy className="h-5 w-5 text-amber-400" />
            <h2
              id="contest-leaderboard-heading"
              className="text-xl font-bold tracking-tight text-white"
            >
              Contest Leaderboard
            </h2>
          </div>

          <button
            type="button"
            onClick={() => void refetchLeaderboard()}
            disabled={isLeaderboardFetching}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-3 py-1 text-xs font-medium text-slate-300 transition hover:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-400 disabled:opacity-60"
          >
            <RefreshCw className={`h-3 w-3 ${isLeaderboardFetching ? 'animate-spin' : ''}`} />
            Refresh Standings
          </button>
        </div>

        {isLeaderboardLoading ? (
          <div
            role="status"
            aria-live="polite"
            className="flex flex-col items-center justify-center rounded-xl border border-slate-800 bg-slate-900/60 py-12 text-center"
          >
            <Loader2 className="h-5 w-5 animate-spin text-amber-400" />
            <p className="mt-2 text-xs text-slate-400">Loading standings...</p>
          </div>
        ) : isLeaderboardError ? (
          <div
            role="alert"
            className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-xs text-rose-300"
          >
            {getApiErrorMessage(leaderboardError, 'Failed to load contest standings.')}
          </div>
        ) : leaderboard.length === 0 ? (
          <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-8 text-center text-xs text-slate-400">
            No accepted submissions recorded for this contest yet. Be the first to solve!
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900/80 shadow">
            <table className="min-w-full divide-y divide-slate-800 text-left text-sm">
              <thead className="bg-slate-950 text-xs font-semibold uppercase tracking-wider text-slate-400">
                <tr>
                  <th scope="col" className="px-4 py-3.5">
                    Rank
                  </th>
                  <th scope="col" className="px-4 py-3.5">
                    User
                  </th>
                  <th scope="col" className="px-4 py-3.5 text-center">
                    Problems Solved
                  </th>
                  <th scope="col" className="px-4 py-3.5 text-right">
                    Penalty
                  </th>
                  <th scope="col" className="px-4 py-3.5 text-right">
                    Score
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {leaderboard.map((entry) => {
                  const isCurrentUser = user?.id === entry.userId;
                  return (
                    <tr
                      key={entry.userId}
                      className={`transition ${
                        isCurrentUser
                          ? 'bg-indigo-950/40 font-semibold text-white'
                          : 'hover:bg-slate-850/50 text-slate-300'
                      }`}
                    >
                      <td className="px-4 py-3">
                        <ContestRankBadge rank={entry.rank} />
                      </td>
                      <td className="px-4 py-3 font-medium">
                        <div className="flex items-center gap-2">
                          <span className="text-white">{entry.username}</span>
                          {isCurrentUser && (
                            <span className="rounded bg-indigo-500/20 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-indigo-300">
                              You
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center font-mono font-semibold text-white">
                        {entry.problemsSolved}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-xs text-slate-400">
                        {formatPenalty(entry.totalPenaltySeconds)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-semibold text-amber-400">
                        {entry.score}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
