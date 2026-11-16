// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { NotificationBell } from '../src/components/NotificationBell';
import { notificationsApi } from '../src/services/notificationsApi';
import type { Notification, NotificationActivityItem } from '@judge/shared';

describe('NotificationBell Component Tests (Day 20)', () => {
  const mockNotifications: Notification[] = [
    {
      id: 'notif-1',
      userId: 'user-1',
      type: 'CONTEST_REGISTERED',
      title: 'Registered: Weekly Contest 1',
      message: 'You have successfully registered for Weekly Contest 1.',
      data: { contestId: 'contest-1' },
      isRead: false,
      createdAt: new Date().toISOString(),
      readAt: null,
    },
    {
      id: 'notif-2',
      userId: 'user-1',
      type: 'CONTEST_SUBMISSION_VERDICT',
      title: 'Submission Verdict: ACCEPTED',
      message: 'Your submission for Two Sum received ACCEPTED.',
      data: { contestId: 'contest-1', problemId: 'prob-1' },
      isRead: true,
      createdAt: new Date(Date.now() - 3600000).toISOString(),
      readAt: new Date().toISOString(),
    },
  ];

  const mockActivity: NotificationActivityItem[] = [
    {
      id: 'act-1',
      activityType: 'REGISTRATION',
      title: 'Registered for Contest',
      description: 'You registered for Weekly Contest 1.',
      timestamp: new Date().toISOString(),
      contestId: 'contest-1',
      contestTitle: 'Weekly Contest 1',
    },
  ];

  let liveCallback: {
    onNotification: (n: Notification) => void;
    onUnreadCount?: (c: number) => void;
  } | null = null;

  beforeEach(() => {
    vi.spyOn(notificationsApi, 'getUnreadCount').mockResolvedValue(1);
    vi.spyOn(notificationsApi, 'getNotifications').mockResolvedValue({
      notifications: mockNotifications,
      total: 2,
      unreadCount: 1,
    });
    vi.spyOn(notificationsApi, 'getActivity').mockResolvedValue(mockActivity);
    vi.spyOn(notificationsApi, 'markAsRead').mockImplementation((id: string) => {
      const found = mockNotifications.find((n) => n.id === id);
      return Promise.resolve({
        ...(found || mockNotifications[0]),
        isRead: true,
        readAt: new Date().toISOString(),
      });
    });
    vi.spyOn(notificationsApi, 'markAllAsRead').mockResolvedValue({
      success: true,
      updatedCount: 1,
    });
    vi.spyOn(notificationsApi, 'connectNotificationsLive').mockImplementation((cbs) => {
      liveCallback = cbs;
      return () => {
        liveCallback = null;
      };
    });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('renders notification bell with unread count badge', async () => {
    render(
      <MemoryRouter>
        <NotificationBell />
      </MemoryRouter>
    );

    const badge = await screen.findByTestId('unread-count-badge');
    expect(badge).toBeDefined();
    expect(badge.textContent).toBe('1');
  });

  it('opens notifications dropdown on click and displays notification list', async () => {
    render(
      <MemoryRouter>
        <NotificationBell />
      </MemoryRouter>
    );

    const bellBtn = screen.getByRole('button', { name: /contest notifications/i });
    fireEvent.click(bellBtn);

    const dropdown = await screen.findByTestId('notifications-dropdown');
    expect(dropdown).toBeDefined();
    expect(screen.getByText('Registered: Weekly Contest 1')).toBeDefined();
  });

  it('marks a notification as read and decrements unread count', async () => {
    render(
      <MemoryRouter>
        <NotificationBell />
      </MemoryRouter>
    );

    const bellBtn = screen.getByRole('button', { name: /contest notifications/i });
    fireEvent.click(bellBtn);

    await screen.findByTestId('notifications-dropdown');
    const markReadBtn = screen.getByTitle('Mark as read');
    fireEvent.click(markReadBtn);

    await waitFor(() => {
      expect(notificationsApi.markAsRead).toHaveBeenCalledWith('notif-1');
      expect(screen.queryByTestId('unread-count-badge')).toBeNull();
    });
  });

  it('switches to Recent Activity tab and displays activity entries', async () => {
    render(
      <MemoryRouter>
        <NotificationBell />
      </MemoryRouter>
    );

    const bellBtn = screen.getByRole('button', { name: /contest notifications/i });
    fireEvent.click(bellBtn);

    await screen.findByTestId('notifications-dropdown');
    const activityTab = screen.getByRole('button', { name: /recent activity/i });
    fireEvent.click(activityTab);

    await waitFor(() => {
      expect(screen.getByText('Registered for Contest')).toBeDefined();
      expect(screen.getByText('You registered for Weekly Contest 1.')).toBeDefined();
    });
  });

  it('updates in real time when live SSE notification event is received', async () => {
    render(
      <MemoryRouter>
        <NotificationBell />
      </MemoryRouter>
    );

    const bellBtn = screen.getByRole('button', { name: /contest notifications/i });
    fireEvent.click(bellBtn);

    await screen.findByTestId('unread-count-badge');

    // Simulate incoming SSE notification
    const incoming: Notification = {
      id: 'notif-3',
      userId: 'user-1',
      type: 'CONTEST_STARTED',
      title: 'Contest Started: Weekly Contest 1',
      message: 'Contest is now live!',
      data: { contestId: 'contest-1' },
      isRead: false,
      createdAt: new Date().toISOString(),
      readAt: null,
    };

    liveCallback?.onNotification(incoming);

    await waitFor(() => {
      const badge = screen.getByTestId('unread-count-badge');
      expect(badge.textContent).toBe('2');
    });
  });
});
