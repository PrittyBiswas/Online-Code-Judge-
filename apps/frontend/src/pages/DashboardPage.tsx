import { ShieldCheck, User } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export function DashboardPage() {
  const { user } = useAuth();

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-500/20 text-indigo-400">
              <User className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white">Welcome, {user?.username}</h1>
              <p className="text-sm text-slate-400">{user?.email}</p>
            </div>
          </div>

          <span className="inline-flex items-center gap-1.5 self-start rounded-full border border-emerald-500/30 bg-emerald-500/15 px-3 py-1 text-xs font-medium text-emerald-300">
            <ShieldCheck className="h-3.5 w-3.5" />
            Role: {user?.role}
          </span>
        </div>
      </section>

      <section className="rounded-xl border border-slate-800 bg-slate-900/50 p-5 text-sm text-slate-300">
        <p>
          You are viewing a protected route authenticated by your HTTP-only session cookie. When
          your session expires, protected API requests will sign you out and prompt you to sign in
          again.
        </p>
      </section>
    </div>
  );
}
