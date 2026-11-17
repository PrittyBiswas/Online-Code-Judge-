import React from 'react';
import { Terminal } from 'lucide-react';
import type { LanguageStat } from '../../types';

interface LanguageUsageChartProps {
  languages: LanguageStat[];
}

export const LanguageUsageChart: React.FC<LanguageUsageChartProps> = ({ languages }) => {
  const languageLabels: Record<string, string> = {
    javascript: 'JavaScript',
    python: 'Python',
    c: 'C',
    cpp: 'C++',
    java: 'Java',
    go: 'Go',
    rust: 'Rust',
  };

  const total = languages.reduce((sum, l) => sum + l.count, 0);

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-5 backdrop-blur">
      <div className="flex items-center justify-between">
        <div>
          <span className="text-sm font-medium text-slate-400">Language Distribution</span>
          <div className="mt-1 text-xs text-slate-500">{languages.length} languages used</div>
        </div>
        <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-amber-500/20 bg-amber-500/15 text-amber-400">
          <Terminal className="h-4 w-4" />
        </div>
      </div>

      <div className="mt-5 space-y-3">
        {languages.length === 0 ? (
          <p className="py-4 text-center text-xs text-slate-500">
            No submission language data available
          </p>
        ) : (
          languages.map((l) => {
            const label = languageLabels[l.language] || l.language;
            const pct = total > 0 ? Math.round((l.count / total) * 100) : 0;
            return (
              <div key={l.language} className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-slate-300">{label}</span>
                  <span className="text-slate-400">
                    <strong className="text-slate-200">{l.count}</strong> subs ({pct}%)
                  </span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-slate-800">
                  <div
                    className="h-full rounded-full bg-indigo-500 transition-all duration-500"
                    style={{ width: `${Math.min(100, pct)}%` }}
                  />
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
