import React from 'react';

interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: React.ReactNode;
  accentColor?: 'indigo' | 'emerald' | 'amber' | 'rose' | 'cyan' | 'violet';
}

export const StatCard: React.FC<StatCardProps> = ({
  title,
  value,
  subtitle,
  icon,
  accentColor = 'indigo',
}) => {
  const colorMap = {
    indigo: 'bg-indigo-500/15 text-indigo-400 border-indigo-500/20',
    emerald: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20',
    amber: 'bg-amber-500/15 text-amber-400 border-amber-500/20',
    rose: 'bg-rose-500/15 text-rose-400 border-rose-500/20',
    cyan: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/20',
    violet: 'bg-violet-500/15 text-violet-400 border-violet-500/20',
  };

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-5 backdrop-blur transition hover:border-slate-700">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-slate-400">{title}</span>
        <div
          className={`flex h-9 w-9 items-center justify-center rounded-lg border ${colorMap[accentColor]}`}
        >
          {icon}
        </div>
      </div>
      <div className="mt-3">
        <div className="text-2xl font-bold tracking-tight text-white">{value}</div>
        {subtitle && <p className="mt-1 text-xs text-slate-400">{subtitle}</p>}
      </div>
    </div>
  );
};
