import { Code2, Terminal } from 'lucide-react';
import { APP_INFO } from '@judge/shared';

interface HeaderProps {
  apiStatus: 'loading' | 'online' | 'offline';
}

export function Header({ apiStatus }: HeaderProps) {
  const statusStyles = {
    loading: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
    online: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
    offline: 'bg-slate-700/40 text-slate-300 border-slate-600/40',
  };

  const statusLabels = {
    loading: 'API: Checking...',
    online: 'API: Online',
    offline: 'API: Offline',
  };

  return (
    <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-500/20 text-indigo-400">
            <Code2 className="h-5 w-5" />
          </div>
          <div>
            <span className="text-lg font-bold tracking-tight text-slate-100">{APP_INFO.NAME}</span>
            <span className="ml-2 rounded bg-slate-800 px-1.5 py-0.5 text-xs text-slate-400">
              v{APP_INFO.VERSION}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <span
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium ${statusStyles[apiStatus]}`}
          >
            <Terminal className="h-3.5 w-3.5" />
            {statusLabels[apiStatus]}
          </span>
        </div>
      </div>
    </header>
  );
}
