import React from 'react';
import { CheckCircle2, TrendingUp } from 'lucide-react';

interface AcceptanceRateCardProps {
  acceptanceRate: number;
  totalSubmissions: number;
  totalAccepted: number;
}

export const AcceptanceRateCard: React.FC<AcceptanceRateCardProps> = ({
  acceptanceRate,
  totalSubmissions,
  totalAccepted,
}) => {
  const radius = 38;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset =
    circumference - (Math.min(100, Math.max(0, acceptanceRate)) / 100) * circumference;

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-5 backdrop-blur">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-slate-400">Acceptance Rate</span>
        <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-emerald-500/20 bg-emerald-500/15 text-emerald-400">
          <TrendingUp className="h-4 w-4" />
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between">
        <div className="space-y-1">
          <div className="text-3xl font-bold tracking-tight text-white">{acceptanceRate}%</div>
          <div className="text-xs text-slate-400">
            {totalAccepted} of {totalSubmissions} submissions accepted
          </div>
          <div className="mt-3 flex items-center gap-1.5 text-xs text-emerald-400">
            <CheckCircle2 className="h-3.5 w-3.5" />
            <span>{totalAccepted} total AC</span>
          </div>
        </div>

        <div className="relative flex items-center justify-center">
          <svg className="h-24 w-24 -rotate-90 transform" viewBox="0 0 96 96">
            <circle
              cx="48"
              cy="48"
              r={radius}
              className="text-slate-800"
              strokeWidth="8"
              stroke="currentColor"
              fill="transparent"
            />
            <circle
              cx="48"
              cy="48"
              r={radius}
              className="text-emerald-500 transition-all duration-700 ease-out"
              strokeWidth="8"
              strokeDasharray={circumference}
              strokeDashoffset={strokeDashoffset}
              strokeLinecap="round"
              stroke="currentColor"
              fill="transparent"
            />
          </svg>
          <span className="absolute text-sm font-semibold text-slate-200">{acceptanceRate}%</span>
        </div>
      </div>
    </div>
  );
};
