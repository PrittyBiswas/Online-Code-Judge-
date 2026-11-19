import { Link } from 'react-router-dom';
import { SubmissionSummary } from '../../types';
import { SubmissionVerdictBadge } from './SubmissionVerdictBadge';
import { ExternalLink, Code2 } from 'lucide-react';

interface SubmissionTableProps {
  submissions: SubmissionSummary[];
  isLoading?: boolean;
}

const LANGUAGE_LABELS: Record<string, string> = {
  javascript: 'JavaScript',
  python: 'Python',
  c: 'C',
  cpp: 'C++',
  java: 'Java',
  go: 'Go',
  rust: 'Rust',
};

function formatMemory(kb?: number | null): string {
  if (kb === undefined || kb === null || kb <= 0) return '-';
  if (kb >= 1024) {
    return `${(kb / 1024).toFixed(1)} MB`;
  }
  return `${kb} KB`;
}

function formatRuntime(ms?: number | null): string {
  if (ms === undefined || ms === null) return '-';
  return `${ms} ms`;
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
    });
  } catch {
    return iso;
  }
}

export function SubmissionTable({ submissions, isLoading = false }: SubmissionTableProps) {
  if (isLoading) {
    return (
      <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900/40">
        <div className="p-8 text-center">
          <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
          <p className="mt-3 text-sm text-slate-400">Loading submissions...</p>
        </div>
      </div>
    );
  }

  if (submissions.length === 0) {
    return (
      <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900/30 p-12 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-slate-800 text-slate-400">
          <Code2 className="h-6 w-6" />
        </div>
        <h3 className="mt-4 text-base font-semibold text-slate-200">No submissions found</h3>
        <p className="mt-1 text-sm text-slate-400">
          No submissions matched your search or filters. Try adjusting your filter parameters or
          solve a problem!
        </p>
        <div className="mt-5">
          <Link
            to="/problems"
            className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-500"
          >
            Browse Problems
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-900/40 backdrop-blur-sm">
      <table className="w-full text-left text-sm text-slate-300">
        <thead className="border-b border-slate-800 bg-slate-900/80 text-xs uppercase tracking-wider text-slate-400">
          <tr>
            <th scope="col" className="px-4 py-3.5 font-medium">
              ID
            </th>
            <th scope="col" className="px-4 py-3.5 font-medium">
              Problem
            </th>
            <th scope="col" className="px-4 py-3.5 font-medium">
              Verdict
            </th>
            <th scope="col" className="px-4 py-3.5 font-medium">
              Language
            </th>
            <th scope="col" className="px-4 py-3.5 font-medium">
              Runtime
            </th>
            <th scope="col" className="px-4 py-3.5 font-medium">
              Memory
            </th>
            <th scope="col" className="px-4 py-3.5 font-medium">
              Submitted At
            </th>
            <th scope="col" className="px-4 py-3.5 text-right font-medium">
              Action
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800/60 font-normal">
          {submissions.map((sub) => {
            const shortId = sub.id.slice(0, 8);
            const languageName = LANGUAGE_LABELS[sub.language] || sub.language;

            return (
              <tr
                key={sub.id}
                className="transition-colors hover:bg-slate-800/40"
                data-testid={`submission-row-${sub.id}`}
              >
                {/* ID */}
                <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-slate-400">
                  <span title={sub.id}>#{shortId}</span>
                </td>

                {/* Problem Title */}
                <td className="px-4 py-3 font-medium text-slate-200">
                  <Link
                    to={`/problems/${sub.problemId}`}
                    className="inline-flex items-center gap-1.5 transition hover:text-indigo-400"
                    title={sub.problemTitle || 'View problem'}
                  >
                    <span>{sub.problemTitle || `Problem (${sub.problemId.slice(0, 8)})`}</span>
                  </Link>
                </td>

                {/* Verdict */}
                <td className="whitespace-nowrap px-4 py-3">
                  <SubmissionVerdictBadge verdict={sub.verdict} status={sub.status} />
                </td>

                {/* Language */}
                <td className="whitespace-nowrap px-4 py-3 text-slate-300">
                  <span className="inline-flex items-center rounded bg-slate-800 px-2 py-0.5 text-xs font-medium text-slate-300">
                    {languageName}
                  </span>
                </td>

                {/* Runtime */}
                <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-slate-300">
                  {formatRuntime(sub.executionTimeMs)}
                </td>

                {/* Memory */}
                <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-slate-300">
                  {formatMemory(sub.memoryUsedKb)}
                </td>

                {/* Submitted At */}
                <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-400">
                  {formatDate(sub.createdAt)}
                </td>

                {/* Action Link */}
                <td className="whitespace-nowrap px-4 py-3 text-right">
                  <Link
                    to={`/submissions/${sub.id}`}
                    className="inline-flex items-center gap-1 rounded-md bg-slate-800 px-2.5 py-1 text-xs font-medium text-slate-200 transition hover:bg-indigo-600 hover:text-white"
                    aria-label={`View submission ${sub.id}`}
                  >
                    <span>Details</span>
                    <ExternalLink className="h-3 w-3" />
                  </Link>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
