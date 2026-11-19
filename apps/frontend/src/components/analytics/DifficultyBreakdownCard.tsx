import React from 'react';
import { Target } from 'lucide-react';
import type { DifficultyBreakdown } from '../../types';

interface DifficultyBreakdownCardProps {
  breakdown: DifficultyBreakdown;
}

export const DifficultyBreakdownCard: React.FC<DifficultyBreakdownCardProps> = ({ breakdown }) => {
  const tiers = [
    {
      name: 'Easy',
      data: breakdown.easy,
      textColor: 'text-emerald-400',
      bgColor: 'bg-emerald-500',
      trackColor: 'bg-emerald-500/10',
    },
    {
      name: 'Medium',
      data: breakdown.medium,
      textColor: 'text-amber-400',
      bgColor: 'bg-amber-500',
      trackColor: 'bg-amber-500/10',
    },
    {
      name: 'Hard',
      data: breakdown.hard,
      textColor: 'text-rose-400',
      bgColor: 'bg-rose-500',
      trackColor: 'bg-rose-500/10',
    },
  ];

  const totalSolved = breakdown.easy.solved + breakdown.medium.solved + breakdown.hard.solved;
  const totalAvailable = breakdown.easy.total + breakdown.medium.total + breakdown.hard.total;

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-5 backdrop-blur">
      <div className="flex items-center justify-between">
        <div>
          <span className="text-sm font-medium text-slate-400">Solved Problems</span>
          <div className="mt-1 text-2xl font-bold tracking-tight text-white">
            {totalSolved}{' '}
            <span className="text-sm font-normal text-slate-500">/ {totalAvailable}</span>
          </div>
        </div>
        <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-cyan-500/20 bg-cyan-500/15 text-cyan-400">
          <Target className="h-4 w-4" />
        </div>
      </div>

      <div className="mt-5 space-y-4">
        {tiers.map((tier) => {
          const pct =
            tier.data.total > 0 ? Math.round((tier.data.solved / tier.data.total) * 100) : 0;
          return (
            <div key={tier.name} className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className={`font-medium ${tier.textColor}`}>{tier.name}</span>
                <span className="text-slate-400">
                  <strong className="text-slate-200">{tier.data.solved}</strong> / {tier.data.total}{' '}
                  <span className="text-slate-500">({pct}%)</span>
                </span>
              </div>
              <div className={`h-2 w-full overflow-hidden rounded-full ${tier.trackColor}`}>
                <div
                  className={`h-full rounded-full ${tier.bgColor} transition-all duration-500`}
                  style={{ width: `${Math.min(100, pct)}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
