import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { AlertCircle, ArrowLeft, Clock, Cpu, FileQuestion, Loader2, Tag } from 'lucide-react';
import { fetchProblemById } from '../services/problemsApi';
import { getApiErrorMessage } from '../services/apiClient';
import { DifficultyBadge } from '../components/DifficultyBadge';
import { SampleRunnerPanel } from '../components/SampleRunnerPanel';

export function ProblemDetailPage() {
  const { id } = useParams<{ id: string }>();
  const problemKey = id ?? '';

  const {
    data: problem,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ['problem', problemKey],
    queryFn: ({ signal }) => fetchProblemById(problemKey, signal),
    enabled: Boolean(problemKey),
  });

  const isNotFound = axios.isAxiosError(error) && error.response?.status === 404;

  return (
    <div className="space-y-6">
      <div>
        <Link
          to="/problems"
          className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-sm font-medium text-indigo-300 transition hover:bg-slate-800 hover:text-indigo-200 focus:outline-none focus:ring-2 focus:ring-indigo-400"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Problems
        </Link>
      </div>

      {isLoading ? (
        <div
          role="status"
          aria-live="polite"
          className="flex flex-col items-center justify-center rounded-xl border border-slate-800 bg-slate-900/60 py-16 text-center"
        >
          <Loader2 className="h-6 w-6 animate-spin text-indigo-400" />
          <p className="mt-3 text-sm text-slate-300">Loading problem details...</p>
        </div>
      ) : isError && isNotFound ? (
        <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-8 text-center">
          <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-slate-800 text-slate-300">
            <FileQuestion className="h-5 w-5" />
          </div>
          <h1 className="text-xl font-bold text-white">Problem not found</h1>
          <p className="mt-1.5 text-sm text-slate-400">
            The requested problem does not exist or is no longer available.
          </p>
          <Link
            to="/problems"
            className="mt-5 inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-400"
          >
            Browse all problems
          </Link>
        </div>
      ) : isError || !problem ? (
        <div
          role="alert"
          className="flex flex-col items-start justify-between gap-4 rounded-xl border border-rose-500/30 bg-rose-500/10 p-5 sm:flex-row sm:items-center"
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
        <article className="space-y-6 rounded-2xl border border-slate-800 bg-slate-900/70 p-6 sm:p-8">
          <header className="space-y-4 border-b border-slate-800 pb-6">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
                {problem.title}
              </h1>
              <DifficultyBadge difficulty={problem.difficulty} />
            </div>

            <div className="flex flex-wrap items-center gap-4 text-xs text-slate-300">
              <span className="inline-flex items-center gap-1.5 rounded-md border border-slate-700 bg-slate-950 px-2.5 py-1">
                <Clock className="h-3.5 w-3.5 text-indigo-400" />
                Time limit: {problem.timeLimitMs} ms
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-md border border-slate-700 bg-slate-950 px-2.5 py-1">
                <Cpu className="h-3.5 w-3.5 text-indigo-400" />
                Memory limit: {problem.memoryLimitMb} MB
              </span>
            </div>

            {problem.tags.length > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                <Tag className="h-3.5 w-3.5 text-slate-500" aria-hidden="true" />
                {problem.tags.map((tag) => (
                  <span
                    key={tag}
                    className="rounded-md border border-slate-700 bg-slate-800 px-2.5 py-0.5 text-xs text-slate-200"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </header>

          <section aria-labelledby="problem-statement-heading" className="space-y-2">
            <h2 id="problem-statement-heading" className="text-base font-semibold text-slate-100">
              Problem Statement
            </h2>
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-200">
              {problem.statement}
            </p>
          </section>

          <section aria-labelledby="sample-io-heading" className="space-y-3">
            <h2 id="sample-io-heading" className="text-base font-semibold text-slate-100">
              Public Example
            </h2>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-xl border border-slate-800 bg-slate-950 p-4">
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Sample Input
                </h3>
                <pre className="overflow-x-auto whitespace-pre-wrap font-mono text-xs text-slate-200">
                  <code>{problem.sampleInput || '(empty)'}</code>
                </pre>
              </div>
              <div className="rounded-xl border border-slate-800 bg-slate-950 p-4">
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Sample Expected Output
                </h3>
                <pre className="overflow-x-auto whitespace-pre-wrap font-mono text-xs text-slate-200">
                  <code>{problem.sampleExpectedOutput || '(empty)'}</code>
                </pre>
              </div>
            </div>
          </section>
        </article>
      )}

      {!isLoading && !isError && problem && <SampleRunnerPanel problem={problem} />}
    </div>
  );
}
