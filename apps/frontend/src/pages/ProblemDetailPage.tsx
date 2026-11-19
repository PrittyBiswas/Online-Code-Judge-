import { useRef } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { AlertCircle, ArrowLeft, FileQuestion, Loader2 } from 'lucide-react';
import { fetchProblemById } from '../services/problemsApi';
import { getApiErrorMessage } from '../services/apiClient';
import { ProblemDescriptionPanel } from '../components/workspace/ProblemDescriptionPanel';
import { HorizontalSplitter } from '../components/workspace/PanelDividers';
import { useResizablePanels } from '../components/workspace/useResizablePanels';
import { SampleRunnerPanel } from '../components/SampleRunnerPanel';

export function ProblemDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const contestId = searchParams.get('contestId') || undefined;
  const problemKey = id ?? '';

  const containerRef = useRef<HTMLDivElement>(null);
  const {
    panelAWidth,
    panelBHeight,
    isPanelACollapsed,
    isDragging,
    startHorizontalDrag,
    startVerticalDrag,
    togglePanelACollapse,
    handleHorizontalKeyDown,
    handleVerticalKeyDown,
  } = useResizablePanels(containerRef);

  const {
    data: problem,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ['problem', problemKey, contestId],
    queryFn: ({ signal }) => fetchProblemById(problemKey, signal, contestId),
    enabled: Boolean(problemKey),
  });

  const isNotFound = axios.isAxiosError(error) && error.response?.status === 404;

  return (
    <div className="space-y-3">
      {/* Top Back Navigation Link */}
      <div>
        {contestId ? (
          <Link
            to={`/contests/${contestId}`}
            className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs sm:text-sm font-medium text-indigo-300 transition hover:bg-slate-800 hover:text-indigo-200 focus:outline-none focus:ring-2 focus:ring-indigo-400"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Contest
          </Link>
        ) : (
          <Link
            to="/problems"
            className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs sm:text-sm font-medium text-indigo-300 transition hover:bg-slate-800 hover:text-indigo-200 focus:outline-none focus:ring-2 focus:ring-indigo-400"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Problems
          </Link>
        )}
      </div>

      {isLoading ? (
        <div
          role="status"
          aria-live="polite"
          className="flex flex-col items-center justify-center rounded-2xl border border-slate-800 bg-slate-900/60 py-24 text-center"
        >
          <Loader2 className="h-8 w-8 animate-spin text-indigo-400" />
          <p className="mt-3 text-sm text-slate-300">Loading problem details...</p>
        </div>
      ) : isError && isNotFound ? (
        <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-12 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-slate-800 text-slate-300">
            <FileQuestion className="h-6 w-6" />
          </div>
          <h1 className="text-xl font-bold text-white">Problem not found</h1>
          <p className="mt-2 text-sm text-slate-400">
            The requested problem does not exist or is no longer available.
          </p>
          <Link
            to="/problems"
            className="mt-6 inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-400"
          >
            Browse all problems
          </Link>
        </div>
      ) : isError || !problem ? (
        <div
          role="alert"
          className="flex flex-col items-start justify-between gap-4 rounded-2xl border border-rose-500/30 bg-rose-500/10 p-6 sm:flex-row sm:items-center"
        >
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-rose-300" />
            <div>
              <h1 className="text-sm font-semibold text-rose-200">Unable to load problem</h1>
              <p className="mt-1 text-sm text-rose-200/80">
                {getApiErrorMessage(error, 'Failed to load problem details.')}
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
      ) : (
        <div
          ref={containerRef}
          className="flex flex-col lg:flex-row h-auto lg:h-[calc(100vh-6.5rem)] min-h-[640px] w-full overflow-hidden rounded-2xl border border-slate-800 bg-slate-950 shadow-2xl"
        >
          {/* PANEL A: PROBLEM DESCRIPTION */}
          <div
            style={{
              width: isPanelACollapsed ? undefined : `${panelAWidth}%`,
            }}
            className={`${
              isPanelACollapsed ? 'w-full lg:w-10' : 'w-full lg:min-w-[300px] lg:max-w-[70%]'
            } flex-shrink-0 h-auto lg:h-full overflow-hidden`}
          >
            <ProblemDescriptionPanel
              problem={problem}
              contestId={contestId}
              isCollapsed={isPanelACollapsed}
              onToggleCollapse={togglePanelACollapse}
            />
          </div>

          {/* HORIZONTAL SPLITTER (Between Panel A and Panels B/C) */}
          {!isPanelACollapsed && (
            <HorizontalSplitter
              onMouseDown={startHorizontalDrag}
              onTouchStart={startHorizontalDrag}
              onKeyDown={handleHorizontalKeyDown}
              isDragging={isDragging === 'horizontal'}
            />
          )}

          {/* PANELS B (EDITOR) & C (RESULTS) */}
          <div
            style={{
              width: isPanelACollapsed ? undefined : `${100 - panelAWidth}%`,
            }}
            className="flex-1 min-w-0 h-auto lg:h-full flex flex-col overflow-hidden"
          >
            <SampleRunnerPanel
              problem={problem}
              contestId={contestId}
              panelBHeight={panelBHeight}
              onVerticalDragStart={startVerticalDrag}
              onVerticalKeyDown={handleVerticalKeyDown}
              isVerticalDragging={isDragging === 'vertical'}
            />
          </div>
        </div>
      )}
    </div>
  );
}
