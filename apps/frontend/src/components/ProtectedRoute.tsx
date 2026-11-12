import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { Loader2, RefreshCw } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export function ProtectedRoute() {
  const { status, bootstrapError, refreshAuth } = useAuth();
  const location = useLocation();

  if (status === 'loading') {
    return (
      <div
        role="status"
        aria-live="polite"
        className="flex min-h-[40vh] flex-col items-center justify-center gap-3 text-slate-300"
      >
        <Loader2 className="h-7 w-7 animate-spin text-indigo-400" />
        <p className="text-sm">Verifying your session...</p>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div
        role="alert"
        className="mx-auto max-w-md rounded-xl border border-amber-500/30 bg-amber-500/10 p-6 text-center"
      >
        <h2 className="text-lg font-semibold text-amber-200">Connection Check Failed</h2>
        <p className="mt-2 text-sm text-amber-100/80">
          {bootstrapError || 'Temporary network error while verifying your session.'}
        </p>
        <button
          type="button"
          onClick={() => void refreshAuth()}
          className="mt-4 inline-flex items-center gap-2 rounded-lg bg-amber-500 px-4 py-2 text-sm font-medium text-slate-950 transition hover:bg-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-300"
        >
          <RefreshCw className="h-4 w-4" />
          Retry Session Check
        </button>
      </div>
    );
  }

  if (status === 'unauthenticated') {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return <Outlet />;
}

