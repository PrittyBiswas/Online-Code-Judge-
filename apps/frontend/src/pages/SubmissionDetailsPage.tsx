import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { fetchSubmissionById } from '../services/submissionsApi';
import { Submission, ProblemDifficulty, Verdict } from '../types';
import { SubmissionVerdictBadge } from '../components/submissions/SubmissionVerdictBadge';
import { SubmissionSourceViewer } from '../components/submissions/SubmissionSourceViewer';
import {
  ArrowLeft,
  Calendar,
  Clock,
  Cpu,
  FileCode2,
  Lock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  HelpCircle,
  Terminal,
} from 'lucide-react';

const DIFFICULTY_STYLES: Record<ProblemDifficulty, string> = {
  [ProblemDifficulty.EASY]: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  [ProblemDifficulty.MEDIUM]: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  [ProblemDifficulty.HARD]: 'bg-rose-500/10 text-rose-400 border-rose-500/20',
};

function formatMemory(kb?: number | null): string {
  if (kb === undefined || kb === null || kb <= 0) return '-';
  if (kb >= 1024) {
    return `${(kb / 1024).toFixed(1)} MB`;
  }
  return `${kb} KB`;
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return iso;
  }
}

export function SubmissionDetailsPage() {
  const { id } = useParams<{ id: string }>();
  const [submission, setSubmission] = useState<Submission | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<{ status?: number; message: string } | null>(null);

  useEffect(() => {
    if (!id) return;
    const controller = new AbortController();

    async function loadData() {
      setIsLoading(true);
      setError(null);
      try {
        const data = await fetchSubmissionById(id!, controller.signal);
        setSubmission(data);
      } catch (err: any) {
        if (err?.name === 'CanceledError' || err?.name === 'AbortError') return;
        const status = err?.response?.status;
        let message = 'Failed to load submission details';
        if (status === 403) {
          message = 'Access Denied: You do not have permission to inspect this submission.';
        } else if (status === 404) {
          message = 'Submission Not Found: The requested submission does not exist.';
        } else if (err?.response?.data?.message) {
          message = err.response.data.message;
        }
        setError({ status, message });
      } finally {
        setIsLoading(false);
      }
    }

    loadData();
    return () => controller.abort();
  }, [id]);

  if (isLoading) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-12 text-center sm:px-6">
        <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
        <p className="mt-3 text-sm text-slate-400">Loading submission details...</p>
      </div>
    );
  }

  if (error || !submission) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 text-center sm:px-6">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-rose-500/10 text-rose-400">
          <AlertCircle className="h-8 w-8" />
        </div>
        <h2 className="mt-4 text-xl font-bold text-white">
          {error?.status === 403 ? 'Access Denied' : 'Submission Error'}
        </h2>
        <p className="mt-2 text-sm text-slate-400">{error?.message || 'Submission not found'}</p>
        <div className="mt-6">
          <Link
            to="/submissions"
            className="inline-flex items-center gap-2 rounded-lg bg-slate-800 px-4 py-2 text-sm font-medium text-slate-200 transition hover:bg-slate-700 hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>Back to Submissions</span>
          </Link>
        </div>
      </div>
    );
  }

  const testCases = submission.testCaseResults || [];
  const passedCount = testCases.filter((tc) => tc.verdict === Verdict.ACCEPTED).length;
  const totalCases = testCases.length;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Top Breadcrumb & Navigation */}
      <div className="mb-6 flex items-center justify-between">
        <Link
          to="/submissions"
          className="inline-flex items-center gap-2 text-sm font-medium text-slate-400 transition hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>Back to Submissions</span>
        </Link>

        <span className="font-mono text-xs text-slate-500">ID: {submission.id}</span>
      </div>

      {/* Main Header / Overview Banner */}
      <div className="mb-8 rounded-2xl border border-slate-800 bg-slate-900/60 p-6 backdrop-blur-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <SubmissionVerdictBadge
                verdict={submission.verdict}
                status={submission.status}
                size="lg"
              />
              {submission.problemDifficulty && (
                <span
                  className={`rounded-md border px-2.5 py-0.5 text-xs font-semibold ${
                    DIFFICULTY_STYLES[submission.problemDifficulty]
                  }`}
                >
                  {submission.problemDifficulty}
                </span>
              )}
            </div>

            <h1 className="mt-3 text-2xl font-bold text-white">
              <Link
                to={`/problems/${submission.problemId}`}
                className="transition hover:text-indigo-400"
              >
                {submission.problemTitle || `Problem (${submission.problemId.slice(0, 8)})`}
              </Link>
            </h1>

            {submission.contestTitle && (
              <p className="mt-1 text-xs text-indigo-400">Contest: {submission.contestTitle}</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
              <div className="flex items-center gap-1.5 text-xs text-slate-400">
                <Clock className="h-3.5 w-3.5 text-slate-500" />
                <span>Runtime</span>
              </div>
              <p className="mt-1 font-mono text-sm font-semibold text-slate-200">
                {submission.executionTimeMs !== undefined
                  ? `${submission.executionTimeMs} ms`
                  : '-'}
              </p>
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
              <div className="flex items-center gap-1.5 text-xs text-slate-400">
                <Cpu className="h-3.5 w-3.5 text-slate-500" />
                <span>Memory</span>
              </div>
              <p className="mt-1 font-mono text-sm font-semibold text-slate-200">
                {formatMemory(submission.memoryUsedKb)}
              </p>
            </div>

            <div className="col-span-2 rounded-xl border border-slate-800 bg-slate-950/60 p-3 sm:col-span-1">
              <div className="flex items-center gap-1.5 text-xs text-slate-400">
                <Calendar className="h-3.5 w-3.5 text-slate-500" />
                <span>Submitted</span>
              </div>
              <p className="mt-1 text-xs font-medium text-slate-300">
                {formatDate(submission.createdAt)}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Test Case Breakdown (Phase 2 Integration) */}
      {totalCases > 0 && (
        <div className="mb-8 rounded-2xl border border-slate-800 bg-slate-900/40 p-6 backdrop-blur-sm">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-white">Test Case Execution Breakdown</h2>
              <p className="text-xs text-slate-400">
                Passed {passedCount} of {totalCases} test cases
              </p>
            </div>
            <div className="text-right">
              <span className="font-mono text-sm font-bold text-slate-200">
                {Math.round((passedCount / totalCases) * 100)}%
              </span>
            </div>
          </div>

          <div className="space-y-3">
            {testCases.map((tc) => {
              const isAc = tc.verdict === Verdict.ACCEPTED;
              return (
                <div
                  key={tc.index}
                  className="rounded-xl border border-slate-800 bg-slate-950/80 p-4 transition"
                  data-testid={`testcase-row-${tc.index}`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      {isAc ? (
                        <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                      ) : tc.verdict === 'NOT_EXECUTED' ? (
                        <HelpCircle className="h-4 w-4 text-slate-500" />
                      ) : (
                        <XCircle className="h-4 w-4 text-rose-400" />
                      )}
                      <span className="font-mono text-xs font-semibold text-slate-200">
                        Test Case #{tc.index}
                      </span>
                      {tc.isHidden && (
                        <span className="inline-flex items-center gap-1 rounded bg-slate-800 px-2 py-0.5 text-xs font-medium text-slate-400">
                          <Lock className="h-3 w-3" />
                          <span>Hidden Test Case</span>
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-3">
                      <SubmissionVerdictBadge verdict={tc.verdict} size="sm" />
                      {tc.executionTimeMs !== undefined && (
                        <span className="font-mono text-xs text-slate-400">
                          {tc.executionTimeMs} ms
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Public Sample Test Case Details */}
                  {!tc.isHidden &&
                    (tc.sampleInput || tc.sampleExpectedOutput || tc.actualOutput) && (
                      <div className="mt-3 grid grid-cols-1 gap-2 border-t border-slate-800/80 pt-3 text-xs md:grid-cols-3">
                        {tc.sampleInput !== undefined && (
                          <div>
                            <span className="font-medium text-slate-400">Input:</span>
                            <pre className="mt-1 rounded border border-slate-800 bg-slate-900 p-2 font-mono text-slate-300 overflow-x-auto">
                              {tc.sampleInput || '<empty>'}
                            </pre>
                          </div>
                        )}
                        {tc.sampleExpectedOutput !== undefined && (
                          <div>
                            <span className="font-medium text-slate-400">Expected Output:</span>
                            <pre className="mt-1 rounded border border-slate-800 bg-slate-900 p-2 font-mono text-slate-300 overflow-x-auto">
                              {tc.sampleExpectedOutput || '<empty>'}
                            </pre>
                          </div>
                        )}
                        {tc.actualOutput !== undefined && (
                          <div>
                            <span className="font-medium text-slate-400">Actual Output:</span>
                            <pre className="mt-1 rounded border border-slate-800 bg-slate-900 p-2 font-mono text-slate-300 overflow-x-auto">
                              {tc.actualOutput || '<empty>'}
                            </pre>
                          </div>
                        )}
                      </div>
                    )}

                  {/* Diagnostics for errors */}
                  {tc.diagnostic && (
                    <div className="mt-3 rounded border border-rose-500/20 bg-rose-500/5 p-3 text-xs text-rose-300">
                      <div className="flex items-center gap-1.5 font-semibold">
                        <Terminal className="h-3.5 w-3.5" />
                        <span>Execution Diagnostic:</span>
                      </div>
                      <pre className="mt-1 overflow-x-auto font-mono text-xs">{tc.diagnostic}</pre>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Submitted Source Code Inspector */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-6 backdrop-blur-sm">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileCode2 className="h-5 w-5 text-indigo-400" />
            <h2 className="text-lg font-bold text-white">Submitted Source Code</h2>
          </div>
        </div>

        <SubmissionSourceViewer
          code={submission.code || '// No source code available'}
          language={submission.language}
          height="500px"
        />
      </div>
    </div>
  );
}
