// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AxiosError, AxiosHeaders } from 'axios';
import { AppRoutes } from '../src/App';
import * as authApi from '../src/services/authApi';
import * as contestsApi from '../src/services/contestsApi';
import type { Contest, LeaderboardEntry } from '../src/types';

vi.mock('../src/hooks/useHealthCheck', () => ({
  useHealthCheck: () => ({
    status: 'online' as const,
    data: { status: 'ok', service: '@judge/api', uptime: 12, timestamp: '2026-11-14T00:00:00Z' },
  }),
}));

vi.mock('@monaco-editor/react', () => ({
  default: () => <textarea data-testid="mock-monaco" />,
}));

class MockEventSource {
  static instances: MockEventSource[] = [];
  url: string;
  options?: any;
  onopen: ((ev: any) => any) | null = null;
  onmessage: ((ev: any) => any) | null = null;
  onerror: ((ev: any) => any) | null = null;
  listeners: Record<string, ((ev: any) => any)[]> = {};
  readyState: number = 0; // CONNECTING

  constructor(url: string, options?: any) {
    this.url = url;
    this.options = options;
    MockEventSource.instances.push(this);
  }

  addEventListener(type: string, cb: (ev: any) => any) {
    if (!this.listeners[type]) this.listeners[type] = [];
    this.listeners[type].push(cb);
  }

  removeEventListener(type: string, cb: (ev: any) => any) {
    if (this.listeners[type]) {
      this.listeners[type] = this.listeners[type].filter((fn) => fn !== cb);
    }
  }

  simulateOpen() {
    this.readyState = 1; // OPEN
    act(() => {
      this.onopen?.({} as any);
    });
  }

  simulateMessage(type: string, data: any) {
    const event = { data: typeof data === 'string' ? data : JSON.stringify(data) };
    act(() => {
      if (type === 'message') {
        this.onmessage?.(event);
      }
      const handlers = this.listeners[type] || [];
      for (const h of handlers) {
        h(event);
      }
    });
  }

  simulateError(err?: any, readyState: number = 0) {
    this.readyState = readyState;
    act(() => {
      this.onerror?.(err || {});
    });
  }

  close = vi.fn(() => {
    this.readyState = 2; // CLOSED
  });
}

function makeAxiosError(status: number, message?: string): AxiosError {
  const headers = new AxiosHeaders();
  const err = new AxiosError(message || `Request failed with status ${status}`, 'ERR_BAD_REQUEST');
  err.response = {
    status,
    statusText: 'Error',
    headers,
    config: { headers },
    data: message ? { error: { message } } : {},
  };
  return err;
}

function makeContest(overrides: Partial<Contest> = {}): Contest {
  const now = Date.now();
  return {
    id: 'c1111111-1111-4111-8111-111111111111',
    title: 'Autumn Contest 2026',
    description: 'A 2-hour algorithmic contest.',
    startTime: new Date(now - 1800000).toISOString(), // Started 30m ago (Running)
    endTime: new Date(now + 5400000).toISOString(), // Ends in 90m
    freezeMinutes: 30,
    createdBy: 'admin-1',
    isOpen: true,
    isFrozen: false,
    isEnded: false,
    status: 'RUNNING',
    problemCount: 3,
    participantCount: 42,
    isRegistered: false,
    createdAt: new Date(now - 86400000).toISOString(),
    ...overrides,
  };
}

function renderApp(initialEntries: string[] = ['/contests']) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
      },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={initialEntries}>
        <AppRoutes />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('Day 19 — Real-Time Contest Updates & Live Leaderboard Frontend', () => {
  const originalEventSource = window.EventSource;

  beforeEach(() => {
    vi.restoreAllMocks();
    MockEventSource.instances = [];
    (window as any).EventSource = MockEventSource;
    vi.spyOn(authApi, 'fetchCurrentUser').mockRejectedValue(makeAxiosError(401, 'Unauthorized'));
  });

  afterEach(() => {
    cleanup();
    (window as any).EventSource = originalEventSource;
  });

  it('1. Initial leaderboard loads and displays correctly', async () => {
    const contest = makeContest({ id: 'contest-live-1' });
    const initialStandings: LeaderboardEntry[] = [
      {
        rank: 1,
        userId: 'u1',
        username: 'alice',
        problemsSolved: 2,
        totalPenaltySeconds: 240,
        score: 200,
      },
    ];

    vi.spyOn(contestsApi, 'getContest').mockResolvedValue(contest);
    vi.spyOn(contestsApi, 'getContestProblems').mockResolvedValue([]);
    vi.spyOn(contestsApi, 'getContestLeaderboard').mockResolvedValue(initialStandings);

    renderApp(['/contests/contest-live-1']);

    await waitFor(() => {
      expect(screen.getByText('alice')).toBeTruthy();
      expect(screen.getByText('#1')).toBeTruthy();
      expect(screen.getByText('200')).toBeTruthy();
    });
  });

  it('2. Starts EventSource connection with credentials when leaderboard renders', async () => {
    const contest = makeContest({ id: 'contest-live-1' });
    vi.spyOn(contestsApi, 'getContest').mockResolvedValue(contest);
    vi.spyOn(contestsApi, 'getContestProblems').mockResolvedValue([]);
    vi.spyOn(contestsApi, 'getContestLeaderboard').mockResolvedValue([]);

    renderApp(['/contests/contest-live-1']);

    await waitFor(() => {
      expect(MockEventSource.instances.length).toBe(1);
    });

    const instance = MockEventSource.instances[0];
    expect(instance.url).toContain('/api/contests/contest-live-1/leaderboard/live');
    expect(instance.options).toEqual({ withCredentials: true });
  });

  it('3. Displays connection badge: transitions from Connecting to Live upon connection open', async () => {
    const contest = makeContest({ id: 'contest-live-1' });
    vi.spyOn(contestsApi, 'getContest').mockResolvedValue(contest);
    vi.spyOn(contestsApi, 'getContestProblems').mockResolvedValue([]);
    vi.spyOn(contestsApi, 'getContestLeaderboard').mockResolvedValue([]);

    renderApp(['/contests/contest-live-1']);

    await waitFor(() => {
      expect(MockEventSource.instances.length).toBe(1);
    });

    const badge = screen.getByTestId('live-status-badge');
    expect(badge.textContent).toMatch(/connecting/i);

    // Simulate SSE connection established
    MockEventSource.instances[0].simulateOpen();

    await waitFor(() => {
      expect(screen.getByTestId('live-status-badge').textContent).toMatch(/live/i);
    });
  });

  it('4. Updates standings in real-time when valid leaderboard event is received', async () => {
    const contest = makeContest({ id: 'contest-live-1' });
    const initialStandings: LeaderboardEntry[] = [
      {
        rank: 1,
        userId: 'u1',
        username: 'alice',
        problemsSolved: 1,
        totalPenaltySeconds: 100,
        score: 100,
      },
    ];

    vi.spyOn(contestsApi, 'getContest').mockResolvedValue(contest);
    vi.spyOn(contestsApi, 'getContestProblems').mockResolvedValue([]);
    vi.spyOn(contestsApi, 'getContestLeaderboard').mockResolvedValue(initialStandings);

    renderApp(['/contests/contest-live-1']);

    await waitFor(() => {
      expect(screen.getByText('alice')).toBeTruthy();
      expect(screen.getByText('100')).toBeTruthy();
    });

    // Simulate push update from backend
    const updatedStandings: LeaderboardEntry[] = [
      {
        rank: 1,
        userId: 'u2',
        username: 'bob',
        problemsSolved: 2,
        totalPenaltySeconds: 150,
        score: 200,
      },
      {
        rank: 2,
        userId: 'u1',
        username: 'alice',
        problemsSolved: 1,
        totalPenaltySeconds: 100,
        score: 100,
      },
    ];

    MockEventSource.instances[0].simulateMessage('leaderboard', {
      leaderboard: updatedStandings,
    });

    await waitFor(() => {
      expect(screen.getByText('bob')).toBeTruthy();
      expect(screen.getByText('200')).toBeTruthy();
      expect(screen.getByText('alice')).toBeTruthy();
      expect(screen.getByText('#2')).toBeTruthy();
    });
  });

  it('5. Safely ignores malformed or invalid SSE event data without overwriting standings', async () => {
    const contest = makeContest({ id: 'contest-live-1' });
    const initialStandings: LeaderboardEntry[] = [
      {
        rank: 1,
        userId: 'u1',
        username: 'alice',
        problemsSolved: 1,
        totalPenaltySeconds: 100,
        score: 100,
      },
    ];

    vi.spyOn(contestsApi, 'getContest').mockResolvedValue(contest);
    vi.spyOn(contestsApi, 'getContestProblems').mockResolvedValue([]);
    vi.spyOn(contestsApi, 'getContestLeaderboard').mockResolvedValue(initialStandings);

    renderApp(['/contests/contest-live-1']);

    await waitFor(() => {
      expect(screen.getByText('alice')).toBeTruthy();
    });

    // Simulate corrupted event
    MockEventSource.instances[0].simulateMessage('leaderboard', 'NOT_JSON{bad');
    MockEventSource.instances[0].simulateMessage('leaderboard', { leaderboard: 'not_an_array' });

    // Existing standings remain visible
    expect(screen.getByText('alice')).toBeTruthy();
  });

  it('6. Transitions badge to Reconnecting on EventSource error', async () => {
    const contest = makeContest({ id: 'contest-live-1' });
    vi.spyOn(contestsApi, 'getContest').mockResolvedValue(contest);
    vi.spyOn(contestsApi, 'getContestProblems').mockResolvedValue([]);
    vi.spyOn(contestsApi, 'getContestLeaderboard').mockResolvedValue([]);

    renderApp(['/contests/contest-live-1']);

    await waitFor(() => {
      expect(MockEventSource.instances.length).toBe(1);
    });

    MockEventSource.instances[0].simulateOpen();
    await waitFor(() => {
      expect(screen.getByTestId('live-status-badge').textContent).toMatch(/live/i);
    });

    // Simulate network error
    MockEventSource.instances[0].simulateError();

    await waitFor(() => {
      expect(screen.getByTestId('live-status-badge').textContent).toMatch(/reconnecting/i);
    });
  });

  it('7. Closes EventSource on component unmount', async () => {
    const contest = makeContest({ id: 'contest-live-1' });
    vi.spyOn(contestsApi, 'getContest').mockResolvedValue(contest);
    vi.spyOn(contestsApi, 'getContestProblems').mockResolvedValue([]);
    vi.spyOn(contestsApi, 'getContestLeaderboard').mockResolvedValue([]);

    const { unmount } = renderApp(['/contests/contest-live-1']);

    await waitFor(() => {
      expect(MockEventSource.instances.length).toBe(1);
    });

    const es = MockEventSource.instances[0];
    expect(es.close).not.toHaveBeenCalled();

    unmount();

    expect(es.close).toHaveBeenCalledTimes(1);
  });

  it('8. Schedules automatic leaderboard refetch when freeze start timer fires', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });

    const now = Date.now();
    // Contest ends in 60 minutes, freeze duration is 30 minutes.
    // Freeze starts in 30 minutes (1,800,000 ms).
    const contest = makeContest({
      id: 'contest-freeze-timer',
      startTime: new Date(now - 30 * 60 * 1000).toISOString(),
      endTime: new Date(now + 60 * 60 * 1000).toISOString(),
      freezeMinutes: 30,
    });

    vi.spyOn(contestsApi, 'getContest').mockResolvedValue(contest);
    vi.spyOn(contestsApi, 'getContestProblems').mockResolvedValue([]);
    const refetchSpy = vi.spyOn(contestsApi, 'getContestLeaderboard').mockResolvedValue([]);

    renderApp(['/contests/contest-freeze-timer']);

    await waitFor(() => {
      expect(refetchSpy).toHaveBeenCalledTimes(1); // Initial load
    });

    // Advance time by 30 minutes + 1 second to trigger freeze timer
    act(() => {
      vi.advanceTimersByTime(30 * 60 * 1000 + 1000);
    });

    await waitFor(() => {
      expect(refetchSpy).toHaveBeenCalledTimes(2);
    });

    vi.useRealTimers();
  });

  it('9. Manual "Refresh Standings" button refetches leaderboard', async () => {
    const contest = makeContest({ id: 'contest-live-1' });
    vi.spyOn(contestsApi, 'getContest').mockResolvedValue(contest);
    vi.spyOn(contestsApi, 'getContestProblems').mockResolvedValue([]);
    const refetchSpy = vi.spyOn(contestsApi, 'getContestLeaderboard').mockResolvedValue([]);

    renderApp(['/contests/contest-live-1']);

    await waitFor(() => {
      expect(refetchSpy).toHaveBeenCalledTimes(1);
    });

    const refreshBtn = screen.getByRole('button', { name: /refresh standings/i });
    fireEvent.click(refreshBtn);

    await waitFor(() => {
      expect(refetchSpy).toHaveBeenCalledTimes(2);
    });
  });

  it('10. Contest switching: closes old EventSource, subscribes only to new contest, and old contest events cannot overwrite new contest standings', async () => {
    const contestA = makeContest({ id: 'contest-switch-a', title: 'Contest A' });
    const contestB = makeContest({ id: 'contest-switch-b', title: 'Contest B' });

    const standingsA: LeaderboardEntry[] = [
      {
        rank: 1,
        userId: 'u-a',
        username: 'alice_a',
        problemsSolved: 1,
        totalPenaltySeconds: 50,
        score: 100,
      },
    ];
    const standingsB: LeaderboardEntry[] = [
      {
        rank: 1,
        userId: 'u-b',
        username: 'bob_b',
        problemsSolved: 1,
        totalPenaltySeconds: 60,
        score: 100,
      },
    ];

    vi.spyOn(contestsApi, 'getContest').mockImplementation(async (id: string) => {
      if (id === 'contest-switch-a') return contestA;
      if (id === 'contest-switch-b') return contestB;
      throw makeAxiosError(404);
    });
    vi.spyOn(contestsApi, 'getContestProblems').mockResolvedValue([]);
    vi.spyOn(contestsApi, 'getContestLeaderboard').mockImplementation(async (id: string) => {
      if (id === 'contest-switch-a') return standingsA;
      if (id === 'contest-switch-b') return standingsB;
      return [];
    });

    const { unmount } = renderApp(['/contests/contest-switch-a']);

    await waitFor(() => {
      expect(screen.getByText('alice_a')).toBeTruthy();
      expect(MockEventSource.instances.length).toBe(1);
    });

    const esA = MockEventSource.instances[0];
    expect(esA.url).toContain('/api/contests/contest-switch-a/leaderboard/live');

    unmount();
    expect(esA.close).toHaveBeenCalled();

    // Render Contest B
    renderApp(['/contests/contest-switch-b']);

    await waitFor(() => {
      expect(screen.getByText('bob_b')).toBeTruthy();
      expect(MockEventSource.instances.length).toBe(2);
    });

    const esB = MockEventSource.instances[1];
    expect(esB.url).toContain('/api/contests/contest-switch-b/leaderboard/live');

    // If late event from Contest A arrives, it must NOT overwrite Contest B's standings
    esA.simulateMessage('leaderboard', {
      leaderboard: [
        {
          rank: 1,
          userId: 'u-hacker',
          username: 'hacker_a',
          problemsSolved: 9,
          totalPenaltySeconds: 1,
          score: 999,
        },
      ],
    });

    // Verify Bob is still displayed and Hacker A is not present
    expect(screen.getByText('bob_b')).toBeTruthy();
    expect(screen.queryByText('hacker_a')).toBeNull();
  });

  it('11. Contest-end boundary timer triggers leaderboard refetch at contest end', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });

    const now = Date.now();
    // Contest ends in 15 minutes, freezeMinutes: 0 (no freeze)
    const contest = makeContest({
      id: 'contest-end-timer',
      startTime: new Date(now - 45 * 60 * 1000).toISOString(),
      endTime: new Date(now + 15 * 60 * 1000).toISOString(),
      freezeMinutes: 0,
    });

    vi.spyOn(contestsApi, 'getContest').mockResolvedValue(contest);
    vi.spyOn(contestsApi, 'getContestProblems').mockResolvedValue([]);
    const refetchSpy = vi.spyOn(contestsApi, 'getContestLeaderboard').mockResolvedValue([]);

    renderApp(['/contests/contest-end-timer']);

    await waitFor(() => {
      expect(refetchSpy).toHaveBeenCalledTimes(1); // Initial load
    });

    // Advance time by 15 minutes + 1 second to cross contest end
    act(() => {
      vi.advanceTimersByTime(15 * 60 * 1000 + 1000);
    });

    await waitFor(() => {
      expect(refetchSpy).toHaveBeenCalledTimes(2);
    });

    vi.useRealTimers();
  });

  it('12. Timers are cancelled on component unmount and do not trigger refetch after unmount', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });

    const now = Date.now();
    const contest = makeContest({
      id: 'contest-timer-cancel',
      startTime: new Date(now - 30 * 60 * 1000).toISOString(),
      endTime: new Date(now + 30 * 60 * 1000).toISOString(),
      freezeMinutes: 15,
    });

    vi.spyOn(contestsApi, 'getContest').mockResolvedValue(contest);
    vi.spyOn(contestsApi, 'getContestProblems').mockResolvedValue([]);
    const refetchSpy = vi.spyOn(contestsApi, 'getContestLeaderboard').mockResolvedValue([]);

    const { unmount } = renderApp(['/contests/contest-timer-cancel']);

    await waitFor(() => {
      expect(refetchSpy).toHaveBeenCalledTimes(1);
    });

    // Unmount before timers expire
    unmount();

    // Advance past freeze and contest end
    act(() => {
      vi.advanceTimersByTime(60 * 60 * 1000);
    });

    // refetch must NOT have been called again after unmount
    expect(refetchSpy).toHaveBeenCalledTimes(1);

    vi.useRealTimers();
  });

  it('13. Disconnected state: transitions to disconnected when EventSource is permanently closed (readyState 2)', async () => {
    const contest = makeContest({ id: 'contest-live-1' });
    vi.spyOn(contestsApi, 'getContest').mockResolvedValue(contest);
    vi.spyOn(contestsApi, 'getContestProblems').mockResolvedValue([]);
    vi.spyOn(contestsApi, 'getContestLeaderboard').mockResolvedValue([]);

    renderApp(['/contests/contest-live-1']);

    await waitFor(() => {
      expect(MockEventSource.instances.length).toBe(1);
    });

    MockEventSource.instances[0].simulateOpen();
    await waitFor(() => {
      expect(screen.getByTestId('live-status-badge').textContent).toMatch(/live/i);
    });

    // Simulate permanent closure (readyState = 2 CLOSED)
    MockEventSource.instances[0].simulateError(new Error('Fatal disconnect'), 2);

    await waitFor(() => {
      expect(screen.getByTestId('live-status-badge').textContent).toMatch(/disconnected/i);
    });
  });
});
