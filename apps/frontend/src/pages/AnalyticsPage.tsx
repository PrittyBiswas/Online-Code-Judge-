import { useEffect, useState, useCallback } from 'react';
import {
  BarChart3,
  RefreshCw,
  Trophy,
  CheckCircle,
  FileCode,
  Flame,
  AlertCircle,
} from 'lucide-react';
import { fetchUserAnalytics } from '../services/analyticsApi';
import type { UserAnalytics } from '../types';
import { StatCard } from '../components/analytics/StatCard';
import { AcceptanceRateCard } from '../components/analytics/AcceptanceRateCard';
import { DifficultyBreakdownCard } from '../components/analytics/DifficultyBreakdownCard';
import { VerdictDistributionChart } from '../components/analytics/VerdictDistributionChart';
import { LanguageUsageChart } from '../components/analytics/LanguageUsageChart';
import { ActivityHeatmap } from '../components/analytics/ActivityHeatmap';
import { PerformanceTrendsChart } from '../components/analytics/PerformanceTrendsChart';

export function AnalyticsPage() {
  const [analytics, setAnalytics] = useState<UserAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const loadData = useCallback(async (isRefresh = false) => {
    if (isRefresh) {
      setIsRefreshing(true);
    } else {
      setLoading(true);
    }
    setError(null);

    try {
      const data = await fetchUserAnalytics();
      setAnalytics(data);
    } catch (err: any) {
      setError(err?.message || 'Failed to load user analytics. Please try again.');
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadData(false);
  }, [loadData]);

  if (loading) {
    return (
      <div className="flex min-h-[400px] flex-col items-center justify-center gap-3">
        <RefreshCw className="h-8 w-8 animate-spin text-indigo-500" />
        <p className="text-sm text-slate-400">Loading performance and analytics...</p>
      </div>
    );
  }

  if (error || !analytics) {
    return (
      <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-6 text-center">
        <AlertCircle className="mx-auto h-10 w-10 text-rose-400" />
        <h3 className="mt-3 text-base font-semibold text-white">Analytics Unavailable</h3>
        <p className="mt-1 text-sm text-rose-300">{error || 'An unexpected error occurred.'}</p>
        <button
          type="button"
          onClick={() => void loadData(false)}
          className="mt-4 inline-flex items-center gap-2 rounded-lg bg-rose-600 px-4 py-2 text-xs font-medium text-white transition hover:bg-rose-500"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          <span>Retry</span>
        </button>
      </div>
    );
  }

  const {
    overview,
    difficultyBreakdown,
    verdictDistribution,
    languageUsage,
    activityHeatmap,
    performanceTrends,
  } = analytics;

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-500/20 text-indigo-400">
              <BarChart3 className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-white">
                Performance Analytics
              </h1>
              <p className="text-sm text-slate-400">
                Detailed metrics, submission accuracy, activity heatmaps, and runtime statistics
              </p>
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={() => void loadData(true)}
          disabled={isRefreshing}
          className="inline-flex items-center gap-2 self-start rounded-lg border border-slate-700 bg-slate-800 px-3.5 py-2 text-xs font-medium text-slate-200 transition hover:bg-slate-700 hover:text-white disabled:opacity-60 sm:self-auto"
        >
          <RefreshCw
            className={`h-3.5 w-3.5 ${isRefreshing ? 'animate-spin text-indigo-400' : ''}`}
          />
          <span>{isRefreshing ? 'Refreshing...' : 'Refresh Data'}</span>
        </button>
      </div>

      {/* Overview Stat Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Total Submissions"
          value={overview.totalSubmissions}
          subtitle={`${overview.totalAccepted} successful evaluations`}
          icon={<FileCode className="h-4 w-4" />}
          accentColor="indigo"
        />
        <StatCard
          title="Problems Solved"
          value={overview.totalSolvedProblems}
          subtitle={`Attempted ${overview.totalAttemptedProblems} unique problems`}
          icon={<CheckCircle className="h-4 w-4" />}
          accentColor="emerald"
        />
        <StatCard
          title="Global Ranking"
          value={overview.globalRank ? `#${overview.globalRank}` : 'Unranked'}
          subtitle="Live position on leaderboard"
          icon={<Trophy className="h-4 w-4" />}
          accentColor="amber"
        />
        <StatCard
          title="Accuracy Rate"
          value={`${overview.acceptanceRate}%`}
          subtitle="Overall submission pass rate"
          icon={<Flame className="h-4 w-4" />}
          accentColor="cyan"
        />
      </div>

      {/* Acceptance Rate & Difficulty Breakdown */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <AcceptanceRateCard
          acceptanceRate={overview.acceptanceRate}
          totalSubmissions={overview.totalSubmissions}
          totalAccepted={overview.totalAccepted}
        />
        <DifficultyBreakdownCard breakdown={difficultyBreakdown} />
      </div>

      {/* Verdict & Language Distributions */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <VerdictDistributionChart verdicts={verdictDistribution} />
        <LanguageUsageChart languages={languageUsage} />
      </div>

      {/* Activity Calendar Heatmap */}
      <ActivityHeatmap activity={activityHeatmap} />

      {/* Performance Trends & Execution History */}
      <PerformanceTrendsChart trends={performanceTrends} />
    </div>
  );
}
