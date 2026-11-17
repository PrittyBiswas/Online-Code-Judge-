import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Activity,
  ArrowRight,
  BarChart2,
  Bell,
  ExternalLink,
  History,
  ShieldCheck,
  Trophy,
  User,
} from 'lucide-react';
import { Notification, NotificationActivityItem } from '@judge/shared';
import { useAuth } from '../context/AuthContext';
import { notificationsApi } from '../services/notificationsApi';

export function DashboardPage() {
  const { user } = useAuth();
  const [activity, setActivity] = useState<NotificationActivityItem[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    Promise.all([notificationsApi.getActivity(), notificationsApi.getNotifications({ limit: 10 })])
      .then(([actList, notifRes]) => {
        if (!isMounted) return;
        setActivity(actList);
        setNotifications(notifRes.notifications);
      })
      .catch((err) => {
        console.warn('Failed loading dashboard activity:', err);
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <div className="space-y-6">
      {/* Welcome Card */}
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

          <div className="flex items-center gap-3">
            <Link
              to="/submissions"
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-200 transition hover:bg-slate-700 hover:text-white"
            >
              <History className="h-3.5 w-3.5 text-indigo-400" />
              <span>Submissions</span>
            </Link>
            <Link
              to="/analytics"
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-200 transition hover:bg-slate-700 hover:text-white"
            >
              <BarChart2 className="h-3.5 w-3.5 text-emerald-400" />
              <span>Analytics</span>
            </Link>
            <span className="inline-flex items-center gap-1.5 self-start rounded-full border border-emerald-500/30 bg-emerald-500/15 px-3 py-1 text-xs font-medium text-emerald-300">
              <ShieldCheck className="h-3.5 w-3.5" />
              Role: {user?.role}
            </span>
          </div>
        </div>
      </section>

      {/* Analytics Banner */}
      <section className="flex flex-col sm:flex-row items-center justify-between gap-4 rounded-2xl border border-indigo-500/20 bg-gradient-to-r from-indigo-950/40 via-slate-900/60 to-slate-900/70 p-5">
        <div className="flex items-center gap-3.5">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-500/20 text-indigo-400">
            <BarChart2 className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-white">Performance Analytics & Insights</h2>
            <p className="text-xs text-slate-400">
              Track your acceptance rate, problem difficulty distribution, submission heatmap, and
              execution speed.
            </p>
          </div>
        </div>
        <Link
          to="/analytics"
          className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-1.5 text-xs font-medium text-white transition hover:bg-indigo-500 self-stretch sm:self-auto justify-center"
        >
          <span>View Analytics</span>
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </section>

      {/* Grid: Recent Contest Activity & Recent Notifications */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Activity Card */}
        <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Activity className="h-5 w-5 text-indigo-400" />
              <h2 className="text-base font-semibold text-white">Recent Contest Activity</h2>
            </div>
            <Link
              to="/contests"
              className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1"
            >
              Browse Contests <ExternalLink className="h-3 w-3" />
            </Link>
          </div>

          {loading ? (
            <div className="py-8 text-center text-xs text-slate-400">Loading activity...</div>
          ) : activity.length === 0 ? (
            <div className="py-8 text-center text-xs text-slate-500">
              No recent contest activity. Register for a contest to get started!
            </div>
          ) : (
            <div className="divide-y divide-slate-800/60 max-h-72 overflow-y-auto">
              {activity.map((item) => (
                <div key={item.id} className="py-3 flex items-start gap-3">
                  <div className="mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded bg-slate-800 text-indigo-400">
                    <Trophy className="h-3.5 w-3.5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <h3 className="text-xs font-medium text-slate-200 truncate">{item.title}</h3>
                      <span className="text-[10px] text-slate-500 flex-shrink-0">
                        {new Date(item.timestamp).toLocaleDateString([], {
                          month: 'short',
                          day: 'numeric',
                        })}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400 mt-0.5">{item.description}</p>
                    {item.contestId && (
                      <Link
                        to={`/contests/${item.contestId}`}
                        className="mt-1 inline-flex items-center gap-1 text-[10px] text-indigo-400 hover:text-indigo-300"
                      >
                        View Contest <ExternalLink className="h-2.5 w-2.5" />
                      </Link>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Notifications Card */}
        <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Bell className="h-5 w-5 text-indigo-400" />
              <h2 className="text-base font-semibold text-white">Recent Notifications</h2>
            </div>
          </div>

          {loading ? (
            <div className="py-8 text-center text-xs text-slate-400">Loading notifications...</div>
          ) : notifications.length === 0 ? (
            <div className="py-8 text-center text-xs text-slate-500">
              No notifications yet. You will be alerted when contest events occur.
            </div>
          ) : (
            <div className="divide-y divide-slate-800/60 max-h-72 overflow-y-auto">
              {notifications.map((n) => (
                <div
                  key={n.id}
                  className={`py-3 flex items-start gap-3 ${!n.isRead ? 'bg-indigo-950/10' : ''}`}
                >
                  <div className="mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded bg-slate-800 text-slate-400">
                    <Bell className="h-3.5 w-3.5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <h3
                        className={`text-xs truncate ${
                          !n.isRead ? 'font-semibold text-slate-100' : 'font-medium text-slate-300'
                        }`}
                      >
                        {n.title}
                      </h3>
                      <span className="text-[10px] text-slate-500 flex-shrink-0">
                        {new Date(n.createdAt).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400 mt-0.5">{n.message}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

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
