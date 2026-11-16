import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Bell,
  Check,
  CheckCheck,
  Clock,
  ExternalLink,
  Flame,
  Info,
  Trophy,
  Activity as ActivityIcon,
} from 'lucide-react';
import { Notification, NotificationActivityItem, NotificationType } from '@judge/shared';
import { notificationsApi } from '../services/notificationsApi';

export function NotificationBell() {
  const [isOpen, setIsOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [activity, setActivity] = useState<NotificationActivityItem[]>([]);
  const [activeTab, setActiveTab] = useState<'notifications' | 'activity'>('notifications');
  const [filterUnread, setFilterUnread] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isMarkingAll, setIsMarkingAll] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  // Load unread count on mount and periodic refresh
  useEffect(() => {
    let isMounted = true;

    const fetchCount = () => {
      notificationsApi
        .getUnreadCount()
        .then((count) => {
          if (isMounted) setUnreadCount(count);
        })
        .catch(() => {});
    };

    fetchCount();
    const interval = setInterval(fetchCount, 30000);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  // Subscribe to live SSE notifications when dropdown is open
  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;
    const unsubscribe = notificationsApi.connectNotificationsLive({
      onNotification: (newNotif) => {
        if (!isMounted) return;
        setNotifications((prev) => [newNotif, ...prev.filter((n) => n.id !== newNotif.id)]);
        setUnreadCount((prev) => prev + 1);
      },
      onUnreadCount: (count) => {
        if (isMounted) setUnreadCount(count);
      },
    });

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, [isOpen]);

  // Fetch data when dropdown opens
  useEffect(() => {
    if (!isOpen) return;

    setIsLoading(true);
    if (activeTab === 'notifications') {
      notificationsApi
        .getNotifications({ unreadOnly: filterUnread })
        .then((res) => {
          setNotifications(res.notifications);
          setUnreadCount(res.unreadCount);
        })
        .finally(() => setIsLoading(false));
    } else {
      notificationsApi
        .getActivity()
        .then((items) => {
          setActivity(items);
        })
        .finally(() => setIsLoading(false));
    }
  }, [isOpen, activeTab, filterUnread]);

  // Close on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  async function handleMarkAsRead(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    try {
      const updated = await notificationsApi.markAsRead(id);
      setNotifications((prev) => prev.map((n) => (n.id === id ? updated : n)));
      setUnreadCount((prev) => Math.max(0, prev - 1));
    } catch (err) {
      console.warn('Failed marking notification read:', err);
    }
  }

  async function handleMarkAllAsRead() {
    if (isMarkingAll || unreadCount === 0) return;
    setIsMarkingAll(true);
    try {
      await notificationsApi.markAllAsRead();
      setNotifications((prev) =>
        prev.map((n) => ({ ...n, isRead: true, readAt: new Date().toISOString() }))
      );
      setUnreadCount(0);
    } catch (err) {
      console.warn('Failed marking all notifications read:', err);
    } finally {
      setIsMarkingAll(false);
    }
  }

  function handleNotificationClick(n: Notification) {
    if (!n.isRead) {
      notificationsApi.markAsRead(n.id).catch(() => {});
      setNotifications((prev) =>
        prev.map((item) => (item.id === n.id ? { ...item, isRead: true } : item))
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
    }

    if (n.data?.contestId) {
      setIsOpen(false);
      navigate(`/contests/${n.data.contestId}`);
    }
  }

  function getNotificationIcon(type: NotificationType) {
    switch (type) {
      case 'CONTEST_REGISTERED':
        return <Trophy className="h-4 w-4 text-emerald-400" />;
      case 'CONTEST_APPROACHING':
        return <Clock className="h-4 w-4 text-amber-400" />;
      case 'CONTEST_STARTED':
        return <Flame className="h-4 w-4 text-rose-400" />;
      case 'CONTEST_SUBMISSION_VERDICT':
        return <Check className="h-4 w-4 text-indigo-400" />;
      case 'CONTEST_ENDING_SOON':
        return <Clock className="h-4 w-4 text-amber-400" />;
      case 'CONTEST_ENDED':
        return <Trophy className="h-4 w-4 text-purple-400" />;
      default:
        return <Info className="h-4 w-4 text-slate-400" />;
    }
  }

  return (
    <div className="relative inline-block" ref={containerRef}>
      <button
        type="button"
        aria-label="Contest Notifications"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((prev) => !prev)}
        className="relative rounded-lg p-2 text-slate-300 transition hover:bg-slate-800 hover:text-white focus:outline-none focus:ring-2 focus:ring-indigo-400"
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <span
            data-testid="unread-count-badge"
            className="absolute -right-1 -top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-rose-600 px-1 text-[10px] font-bold text-white shadow"
          >
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div
          data-testid="notifications-dropdown"
          className="absolute right-0 mt-2 w-80 sm:w-96 rounded-xl border border-slate-700 bg-slate-900 shadow-2xl ring-1 ring-black/50 z-50 overflow-hidden"
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3 bg-slate-900/90">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-sm text-slate-100">Notifications</span>
              {unreadCount > 0 && (
                <span className="rounded-full bg-indigo-500/20 px-2 py-0.5 text-xs font-medium text-indigo-400">
                  {unreadCount} new
                </span>
              )}
            </div>
            {unreadCount > 0 && activeTab === 'notifications' && (
              <button
                type="button"
                onClick={handleMarkAllAsRead}
                disabled={isMarkingAll}
                className="flex items-center gap-1 text-xs text-slate-400 hover:text-indigo-400 transition"
              >
                <CheckCheck className="h-3.5 w-3.5" />
                {isMarkingAll ? 'Marking...' : 'Mark all read'}
              </button>
            )}
          </div>

          {/* Navigation Tabs */}
          <div className="flex border-b border-slate-800 text-xs">
            <button
              type="button"
              onClick={() => setActiveTab('notifications')}
              className={`flex-1 py-2 text-center font-medium transition ${
                activeTab === 'notifications'
                  ? 'border-b-2 border-indigo-500 text-indigo-400 bg-slate-800/40'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Alerts
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('activity')}
              className={`flex-1 py-2 text-center font-medium transition ${
                activeTab === 'activity'
                  ? 'border-b-2 border-indigo-500 text-indigo-400 bg-slate-800/40'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Recent Activity
            </button>
          </div>

          {/* Filter Subheader for Notifications Tab */}
          {activeTab === 'notifications' && (
            <div className="flex items-center justify-between px-4 py-1.5 bg-slate-950/40 border-b border-slate-800/60 text-[11px]">
              <span className="text-slate-400">Filter:</span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setFilterUnread(false)}
                  className={`px-1.5 py-0.5 rounded ${
                    !filterUnread
                      ? 'bg-slate-800 text-slate-200 font-semibold'
                      : 'text-slate-500 hover:text-slate-300'
                  }`}
                >
                  All
                </button>
                <button
                  type="button"
                  onClick={() => setFilterUnread(true)}
                  className={`px-1.5 py-0.5 rounded ${
                    filterUnread
                      ? 'bg-slate-800 text-indigo-300 font-semibold'
                      : 'text-slate-500 hover:text-slate-300'
                  }`}
                >
                  Unread only
                </button>
              </div>
            </div>
          )}

          {/* Body Content */}
          <div className="max-h-80 overflow-y-auto divide-y divide-slate-800/60">
            {isLoading ? (
              <div className="py-8 text-center text-xs text-slate-400">Loading...</div>
            ) : activeTab === 'notifications' ? (
              notifications.length === 0 ? (
                <div className="py-8 text-center text-xs text-slate-400">
                  {filterUnread ? 'No unread notifications' : 'No notifications yet'}
                </div>
              ) : (
                notifications.map((n) => (
                  <div
                    key={n.id}
                    onClick={() => handleNotificationClick(n)}
                    className={`flex items-start gap-3 p-3.5 transition cursor-pointer hover:bg-slate-800/50 ${
                      !n.isRead ? 'bg-slate-800/25' : ''
                    }`}
                  >
                    <div className="mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg bg-slate-800">
                      {getNotificationIcon(n.type)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1">
                        <h4
                          className={`text-xs truncate ${
                            !n.isRead
                              ? 'font-semibold text-slate-100'
                              : 'font-medium text-slate-300'
                          }`}
                        >
                          {n.title}
                        </h4>
                        {!n.isRead && (
                          <button
                            type="button"
                            title="Mark as read"
                            onClick={(e) => handleMarkAsRead(n.id, e)}
                            className="text-slate-500 hover:text-indigo-400 p-0.5"
                          >
                            <Check className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                      <p className="mt-0.5 text-[11px] text-slate-400 line-clamp-2">{n.message}</p>
                      <div className="mt-1 flex items-center justify-between text-[10px] text-slate-500">
                        <span>
                          {new Date(n.createdAt).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                        {n.data?.contestId && (
                          <span className="flex items-center gap-0.5 text-indigo-400">
                            View Contest <ExternalLink className="h-2.5 w-2.5" />
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ))
              )
            ) : activity.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-400">No contest activity yet</div>
            ) : (
              activity.map((item) => (
                <div key={item.id} className="flex items-start gap-3 p-3.5 hover:bg-slate-800/30">
                  <div className="mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg bg-slate-800">
                    <ActivityIcon className="h-4 w-4 text-indigo-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="text-xs font-medium text-slate-200">{item.title}</h4>
                    <p className="mt-0.5 text-[11px] text-slate-400">{item.description}</p>
                    <span className="mt-1 block text-[10px] text-slate-500">
                      {new Date(item.timestamp).toLocaleString([], {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
