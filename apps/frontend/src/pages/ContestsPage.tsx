import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  AlertCircle,
  Calendar,
  CheckCircle,
  Clock,
  HelpCircle,
  Loader2,
  Plus,
  RefreshCw,
  Trophy,
  Users,
} from 'lucide-react';
import { formatIST } from '@judge/shared';
import { getContests } from '../services/contestsApi';
import { getApiErrorMessage } from '../services/apiClient';
import { useAuth } from '../context/AuthContext';
import { CreateContestModal } from '../components/CreateContestModal';
import type { Contest } from '../types';

type ContestTab = 'all' | 'running' | 'upcoming' | 'ended';

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

export function ContestsPage() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<ContestTab>('all');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  const {
    data: contests = [],
    isLoading,
    isFetching,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ['contests'],
    queryFn: ({ signal }) => getContests(signal),
  });

  const filteredContests = useMemo(() => {
    return contests.filter((c) => {
      const status = getDerivedStatus(c);
      if (activeTab === 'running') return status === 'RUNNING';
      if (activeTab === 'upcoming') return status === 'UPCOMING';
      if (activeTab === 'ended') return status === 'ENDED';
      return true;
    });
  }, [contests, activeTab]);

  const isAdmin = (user?.role || '').toLowerCase() === 'admin';

  return (
    <div className="space-y-6">
      {/* Header section */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-500/20 text-indigo-400">
              <Trophy className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-slate-100">Contests</h1>
              <p className="text-sm text-slate-400">
                Compete in timed programming rounds and climb the contest standings
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void refetch()}
            disabled={isFetching}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-200 transition hover:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-400 disabled:opacity-60"
            title="Refresh contest list"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? 'animate-spin' : ''}`} />
            Refresh
          </button>

          {isAdmin && (
            <button
              type="button"
              onClick={() => setIsCreateModalOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-400"
            >
              <Plus className="h-4 w-4" />
              Create Contest
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-slate-800">
        <nav className="-mb-px flex space-x-6">
          <button
            type="button"
            onClick={() => setActiveTab('all')}
            className={`border-b-2 py-3 text-sm font-medium transition ${
              activeTab === 'all'
                ? 'border-indigo-500 text-indigo-400'
                : 'border-transparent text-slate-400 hover:border-slate-700 hover:text-slate-300'
            }`}
          >
            All Contests ({contests.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('running')}
            className={`flex items-center gap-2 border-b-2 py-3 text-sm font-medium transition ${
              activeTab === 'running'
                ? 'border-emerald-500 text-emerald-400'
                : 'border-transparent text-slate-400 hover:border-slate-700 hover:text-slate-300'
            }`}
          >
            <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
            Live Now
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('upcoming')}
            className={`border-b-2 py-3 text-sm font-medium transition ${
              activeTab === 'upcoming'
                ? 'border-indigo-500 text-indigo-400'
                : 'border-transparent text-slate-400 hover:border-slate-700 hover:text-slate-300'
            }`}
          >
            Upcoming
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('ended')}
            className={`border-b-2 py-3 text-sm font-medium transition ${
              activeTab === 'ended'
                ? 'border-indigo-500 text-indigo-400'
                : 'border-transparent text-slate-400 hover:border-slate-700 hover:text-slate-300'
            }`}
          >
            Past
          </button>
        </nav>
      </div>

      {/* Content Area */}
      {isLoading ? (
        <div
          role="status"
          aria-live="polite"
          className="flex flex-col items-center justify-center rounded-2xl border border-slate-800 bg-slate-900/60 py-16 text-center"
        >
          <Loader2 className="h-6 w-6 animate-spin text-indigo-400" />
          <p className="mt-3 text-sm text-slate-300">Loading contests...</p>
        </div>
      ) : isError ? (
        <div
          role="alert"
          className="flex flex-col items-start justify-between gap-4 rounded-xl border border-rose-500/30 bg-rose-500/10 p-5 sm:flex-row sm:items-center"
        >
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-rose-300" />
            <div>
              <h2 className="text-sm font-semibold text-rose-200">Unable to load contests</h2>
              <p className="mt-1 text-sm text-rose-200/80">
                {getApiErrorMessage(error, 'Failed to fetch contests.')}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void refetch()}
            className="rounded-lg border border-rose-400/40 bg-rose-500/20 px-4 py-2 text-xs font-semibold text-rose-100 transition hover:bg-rose-500/30 focus:outline-none focus:ring-2 focus:ring-rose-400"
          >
            Try again
          </button>
        </div>
      ) : filteredContests.length === 0 ? (
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-12 text-center">
          <Calendar className="mx-auto h-12 w-12 text-slate-600" />
          <h2 className="mt-4 text-base font-semibold text-slate-200">No contests found</h2>
          <p className="mt-1 text-sm text-slate-400">
            {activeTab === 'all'
              ? 'There are currently no scheduled or past contests.'
              : `There are no ${activeTab} contests matching this filter.`}
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filteredContests.map((contest) => {
            const status = getDerivedStatus(contest);
            return (
              <div
                key={contest.id}
                className="flex flex-col justify-between rounded-xl border border-slate-800 bg-slate-900/80 p-5 shadow-sm transition hover:border-slate-700"
              >
                <div>
                  <div className="flex items-center justify-between gap-2">
                    {status === 'RUNNING' && (
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 text-xs font-medium text-emerald-400">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                        Live Now
                      </span>
                    )}
                    {status === 'UPCOMING' && (
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-indigo-500/30 bg-indigo-500/10 px-2.5 py-0.5 text-xs font-medium text-indigo-400">
                        <Clock className="h-3 w-3" />
                        Upcoming
                      </span>
                    )}
                    {status === 'ENDED' && (
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-700 bg-slate-800 px-2.5 py-0.5 text-xs font-medium text-slate-400">
                        Past
                      </span>
                    )}

                    {contest.isRegistered && (
                      <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/40 bg-emerald-500/20 px-2 py-0.5 text-[10px] font-semibold text-emerald-300">
                        <CheckCircle className="h-3 w-3" />
                        Registered
                      </span>
                    )}
                  </div>

                  <h2 className="mt-3 text-lg font-bold text-white line-clamp-1">
                    {contest.title}
                  </h2>
                  <p className="mt-1 text-xs text-slate-400 line-clamp-2">
                    {contest.description || 'No description provided.'}
                  </p>

                  <div className="mt-4 space-y-2 border-t border-slate-800/80 pt-3 text-xs text-slate-300">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500">Start (IST):</span>
                      <span className="font-mono text-slate-300">
                        {formatIST(contest.startTime)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500">End (IST):</span>
                      <span className="font-mono text-slate-300">{formatIST(contest.endTime)}</span>
                    </div>

                    <div className="flex items-center justify-between pt-1">
                      <div className="flex items-center gap-3">
                        {contest.problemCount !== undefined && (
                          <span className="inline-flex items-center gap-1 text-slate-400">
                            <HelpCircle className="h-3.5 w-3.5 text-slate-500" />
                            {contest.problemCount}{' '}
                            {contest.problemCount === 1 ? 'problem' : 'problems'}
                          </span>
                        )}
                        {contest.participantCount !== undefined && (
                          <span className="inline-flex items-center gap-1 text-slate-400">
                            <Users className="h-3.5 w-3.5 text-slate-500" />
                            {contest.participantCount}
                          </span>
                        )}
                      </div>

                      {contest.freezeMinutes > 0 && (
                        <span className="text-[11px] text-amber-400/80">
                          Freeze: {contest.freezeMinutes}m
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="mt-5 pt-3 border-t border-slate-800/80">
                  <Link
                    to={`/contests/${contest.id}`}
                    className="block w-full rounded-lg bg-indigo-600/90 py-2 text-center text-xs font-semibold text-white transition hover:bg-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  >
                    View Contest
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Admin Contest Creation Modal */}
      {isAdmin && (
        <CreateContestModal
          isOpen={isCreateModalOpen}
          onClose={() => setIsCreateModalOpen(false)}
          onSuccess={() => void refetch()}
        />
      )}
    </div>
  );
}
