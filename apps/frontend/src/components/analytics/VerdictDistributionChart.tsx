import React from 'react';
import { PieChart } from 'lucide-react';
import { Verdict } from '../../types';
import type { VerdictStat } from '../../types';

interface VerdictDistributionChartProps {
  verdicts: VerdictStat[];
}

export const VerdictDistributionChart: React.FC<VerdictDistributionChartProps> = ({ verdicts }) => {
  const verdictConfig: Record<
    string,
    { label: string; bg: string; text: string; barColor: string }
  > = {
    [Verdict.ACCEPTED]: {
      label: 'Accepted',
      bg: 'bg-emerald-500/10 border-emerald-500/20',
      text: 'text-emerald-400',
      barColor: 'bg-emerald-500',
    },
    [Verdict.WRONG_ANSWER]: {
      label: 'Wrong Answer',
      bg: 'bg-rose-500/10 border-rose-500/20',
      text: 'text-rose-400',
      barColor: 'bg-rose-500',
    },
    [Verdict.TIME_LIMIT_EXCEEDED]: {
      label: 'Time Limit Exceeded',
      bg: 'bg-amber-500/10 border-amber-500/20',
      text: 'text-amber-400',
      barColor: 'bg-amber-500',
    },
    [Verdict.MEMORY_LIMIT_EXCEEDED]: {
      label: 'Memory Limit Exceeded',
      bg: 'bg-purple-500/10 border-purple-500/20',
      text: 'text-purple-400',
      barColor: 'bg-purple-500',
    },
    [Verdict.RUNTIME_ERROR]: {
      label: 'Runtime Error',
      bg: 'bg-orange-500/10 border-orange-500/20',
      text: 'text-orange-400',
      barColor: 'bg-orange-500',
    },
    [Verdict.COMPILATION_ERROR]: {
      label: 'Compilation Error',
      bg: 'bg-yellow-500/10 border-yellow-500/20',
      text: 'text-yellow-400',
      barColor: 'bg-yellow-500',
    },
  };

  const total = verdicts.reduce((sum, v) => sum + v.count, 0);

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-5 backdrop-blur">
      <div className="flex items-center justify-between">
        <div>
          <span className="text-sm font-medium text-slate-400">Verdict Distribution</span>
          <div className="mt-1 text-xs text-slate-500">{total} total verdicts evaluated</div>
        </div>
        <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-violet-500/20 bg-violet-500/15 text-violet-400">
          <PieChart className="h-4 w-4" />
        </div>
      </div>

      {/* Segmented bar */}
      <div className="mt-4 flex h-3 w-full overflow-hidden rounded-full bg-slate-800">
        {total === 0 ? (
          <div className="h-full w-full bg-slate-800" />
        ) : (
          verdicts
            .filter((v) => v.count > 0)
            .map((v) => {
              const cfg = verdictConfig[v.verdict] || {
                label: v.verdict,
                barColor: 'bg-slate-500',
              };
              const pct = (v.count / total) * 100;
              return (
                <div
                  key={v.verdict}
                  className={`h-full ${cfg.barColor} transition-all duration-300`}
                  style={{ width: `${pct}%` }}
                  title={`${cfg.label || v.verdict}: ${v.count} (${v.percentage}%)`}
                />
              );
            })
        )}
      </div>

      {/* Grid of verdict stats */}
      <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-3">
        {verdicts.map((v) => {
          const cfg = verdictConfig[v.verdict] || {
            label: v.verdict,
            bg: 'bg-slate-800 border-slate-700',
            text: 'text-slate-300',
            barColor: 'bg-slate-500',
          };
          return (
            <div
              key={v.verdict}
              className={`flex flex-col justify-between rounded-lg border p-2.5 ${cfg.bg}`}
            >
              <span className="truncate text-xs text-slate-400">{cfg.label}</span>
              <div className="mt-1 flex items-baseline justify-between">
                <span className={`text-base font-bold ${cfg.text}`}>{v.count}</span>
                <span className="text-xs text-slate-500">{v.percentage}%</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
