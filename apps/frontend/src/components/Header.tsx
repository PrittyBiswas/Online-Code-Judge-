import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Code2, LogOut, Terminal } from 'lucide-react';
import { APP_INFO } from '@judge/shared';
import { useAuth } from '../context/AuthContext';

interface HeaderProps {
  apiStatus: 'loading' | 'online' | 'offline';
}

export function Header({ apiStatus }: HeaderProps) {
  const { status, user, logout } = useAuth();
  const navigate = useNavigate();
  const [logoutWarning, setLogoutWarning] = useState<string | null>(null);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

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

  async function handleLogout() {
    if (isLoggingOut) return;
    setIsLoggingOut(true);
    setLogoutWarning(null);
    const result = await logout();
    setIsLoggingOut(false);
    if (!result.serverConfirmed && result.errorMessage) {
      setLogoutWarning(`Local session cleared, but server logout failed: ${result.errorMessage}`);
    }
    navigate('/login', { replace: true });
  }

  return (
    <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-6">
        <Link
          to="/"
          className="flex items-center gap-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400"
        >
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-500/20 text-indigo-400">
            <Code2 className="h-5 w-5" />
          </div>
          <div>
            <span className="text-lg font-bold tracking-tight text-slate-100">{APP_INFO.NAME}</span>
            <span className="ml-2 rounded bg-slate-800 px-1.5 py-0.5 text-xs text-slate-400">
              v{APP_INFO.VERSION}
            </span>
          </div>
        </Link>

        <nav aria-label="Primary navigation" className="flex flex-wrap items-center gap-3">
          <span
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium ${statusStyles[apiStatus]}`}
          >
            <Terminal className="h-3.5 w-3.5" />
            {statusLabels[apiStatus]}
          </span>

          {status === 'authenticated' && user ? (
            <>
              <Link
                to="/dashboard"
                className="rounded-lg px-3 py-1.5 text-sm font-medium text-slate-200 transition hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-400"
              >
                Dashboard
              </Link>
              <span className="text-xs text-slate-400">
                Signed in as <strong className="text-slate-200">{user.username}</strong>
              </span>
              <button
                type="button"
                onClick={() => void handleLogout()}
                disabled={isLoggingOut}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-100 transition hover:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-400 disabled:opacity-60"
              >
                <LogOut className="h-3.5 w-3.5" />
                {isLoggingOut ? 'Signing out...' : 'Sign out'}
              </button>
            </>
          ) : (
            <>
              <Link
                to="/login"
                className="rounded-lg px-3 py-1.5 text-sm font-medium text-slate-200 transition hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-400"
              >
                Sign in
              </Link>
              <Link
                to="/register"
                className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-400"
              >
                Register
              </Link>
            </>
          )}
        </nav>
      </div>

      {logoutWarning && (
        <div
          role="alert"
          className="border-t border-amber-500/30 bg-amber-500/10 px-4 py-2 text-center text-xs text-amber-200"
        >
          {logoutWarning}
        </div>
      )}
    </header>
  );
}
