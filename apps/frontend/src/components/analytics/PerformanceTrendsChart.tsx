import React from 'react';
import { Gauge, Clock, Cpu, ExternalLink } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { PerformanceTrendPoint } from '../../types';

interface PerformanceTrendsChartProps {
  trends: PerformanceTrendPoint[];
}

export const PerformanceTrendsChart: React.FC<PerformanceTrendsChartProps> = ({ trends }) => {
  const times = trends.map((t) => t.executionTimeMs).filter((t): t is number => t !== undefined);
  const memories = trends.map((t) => t.memoryUsedKb).filter((m): m is number => m !== undefined);

  const avgTime =
    times.length > 0 ? Math.round(times.reduce((a, b) => a + b, 0) / times.length) : null;
  const minTime = times.length > 0 ? Math.min(...times) : null;
  const avgMemory =
    memories.length > 0 ? Math.round(memories.reduce((a, b) => a + b, 0) / memories.length) : null;

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-5 backdrop-blur">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <span className="text-sm font-medium text-slate-400">Performance Trends</span>
          <div className="mt-1 text-xs text-slate-500">
            Runtime & memory metrics across recent accepted solutions
          </div>
        </div>
        <div className="flex h-9 w-9 self-start items-center justify-center rounded-lg border border-cyan-500/20 bg-cyan-500/15 text-cyan-400 sm:self-auto">
          <Gauge className="h-4 w-4" />
        </div>
      </div>

      {/* Summary stats */}
      <div className="mt-4 grid grid-cols-3 gap-3">
        <div className="rounded-lg border border-slate-800 bg-slate-800/40 p-3">
          <div className="flex items-center gap-1.5 text-xs text-slate-400">
            <Clock className="h-3 w-3 text-cyan-400" />
            <span>Avg Runtime</span>
          </div>
          <div className="mt-1 text-lg font-bold text-slate-200">
            {avgTime !== null ? `${avgTime} ms` : '—'}
          </div>
        </div>

        <div className="rounded-lg border border-slate-800 bg-slate-800/40 p-3">
          <div className="flex items-center gap-1.5 text-xs text-slate-400">
            <Clock className="h-3 w-3 text-emerald-400" />
            <span>Fastest</span>
          </div>
          <div className="mt-1 text-lg font-bold text-slate-200">
            {minTime !== null ? `${minTime} ms` : '—'}
          </div>
        </div>

        <div className="rounded-lg border border-slate-800 bg-slate-800/40 p-3">
          <div className="flex items-center gap-1.5 text-xs text-slate-400">
            <Cpu className="h-3 w-3 text-violet-400" />
            <span>Avg Memory</span>
          </div>
          <div className="mt-1 text-lg font-bold text-slate-200">
            {avgMemory !== null ? `${(avgMemory / 1024).toFixed(1)} MB` : '—'}
          </div>
        </div>
      </div>

      {/* Table of recent executions */}
      <div className="mt-4 overflow-x-auto">
        {trends.length === 0 ? (
          <p className="py-6 text-center text-xs text-slate-500">
            No accepted submissions recorded yet.
          </p>
        ) : (
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400">
                <th className="pb-2 font-medium">Problem</th>
                <th className="pb-2 font-medium">Language</th>
                <th className="pb-2 font-medium">Runtime</th>
                <th className="pb-2 font-medium">Memory</th>
                <th className="pb-2 font-medium">Date</th>
                <th className="pb-2 text-right font-medium">Inspect</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {trends.map((t) => (
                <tr key={t.submissionId} className="hover:bg-slate-800/30">
                  <td className="py-2.5 font-medium text-slate-200">
                    <Link
                      to={`/problems/${t.problemId}`}
                      className="hover:text-indigo-400 hover:underline"
                    >
                      {t.problemTitle || 'Problem'}
                    </Link>
                  </td>
                  <td className="py-2.5 capitalize text-slate-400">{t.language}</td>
                  <td className="py-2.5 font-mono text-emerald-400">
                    {t.executionTimeMs !== undefined ? `${t.executionTimeMs} ms` : '—'}
                  </td>
                  <td className="py-2.5 font-mono text-slate-300">
                    {t.memoryUsedKb !== undefined
                      ? `${(t.memoryUsedKb / 1024).toFixed(1)} MB`
                      : '—'}
                  </td>
                  <td className="py-2.5 text-slate-500">
                    {new Date(t.createdAt).toLocaleDateString()}
                  </td>
                  <td className="py-2.5 text-right">
                    <Link
                      to={`/submissions/${t.submissionId}`}
                      className="inline-flex items-center gap-1 text-indigo-400 hover:text-indigo-300 hover:underline"
                    >
                      <span>View</span>
                      <ExternalLink className="h-3 w-3" />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};
