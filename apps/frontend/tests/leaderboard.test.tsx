// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AxiosError, AxiosHeaders } from 'axios';
import { AppRoutes } from '../src/App';
import * as authApi from '../src/services/authApi';
import * as leaderboardApi from '../src/services/leaderboardApi';
import type { LeaderboardResponse } from '../src/types';

vi.mock('../src/hooks/useHealthCheck', () => ({
  useHealthCheck: () => ({
    status: 'online' as const,
    data: { status: 'ok', service: '@judge/api', uptime: 12, timestamp: '2026-11-13T00:00:00Z' },
  }),
}));

vi.mock('@monaco-editor/react', () => ({
  default: () => <textarea aria-label="Source code editor" />,
}));

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

function renderWithClient(initialRoute = '/leaderboard') {
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
      <MemoryRouter initialEntries={[initialRoute]}>
        <AppRoutes />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('Day 17 — Frontend Leaderboard Page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(authApi, 'fetchCurrentUser').mockRejectedValue(makeAxiosError(401, 'Unauthorized'));
  });

  afterEach(() => {
    cleanup();
  });

  it('renders Header with Leaderboard navigation link', async () => {
    vi.spyOn(leaderboardApi, 'fetchLeaderboard').mockResolvedValue({
      leaderboard: [],
      pagination: { page: 1, limit: 20, total: 0, totalPages: 1 },
    });

    renderWithClient('/problems');

    const leaderboardLink = await screen.findByRole('link', { name: 'Leaderboard' });
    expect(leaderboardLink).toBeDefined();
    expect(leaderboardLink.getAttribute('href')).toBe('/leaderboard');
  });

  it('renders loading state, then empty state when no ranked users exist', async () => {
    let resolveLeaderboard!: (val: LeaderboardResponse) => void;
    const pendingPromise = new Promise<LeaderboardResponse>((res) => {
      resolveLeaderboard = res;
    });

    vi.spyOn(leaderboardApi, 'fetchLeaderboard').mockReturnValue(pendingPromise);

    renderWithClient('/leaderboard');

    // Loading indicator is shown
    expect(screen.getByText('Loading live standings...')).toBeDefined();

    // Resolve with empty list
    resolveLeaderboard({
      leaderboard: [],
      pagination: { page: 1, limit: 20, total: 0, totalPages: 1 },
    });

    await waitFor(() => {
      expect(screen.getByText('No ranked coders yet')).toBeDefined();
    });
    expect(
      screen.getByText('Submit an accepted solution to any problem to appear on the leaderboard!')
    ).toBeDefined();
  });

  it('renders ranked coders with rank badges, solved stats, penalty time, and score', async () => {
    vi.spyOn(leaderboardApi, 'fetchLeaderboard').mockResolvedValue({
      leaderboard: [
        {
          rank: 1,
          userId: '11111111-1111-4111-8111-111111111111',
          username: 'alice_grandmaster',
          problemsSolved: 5,
          totalPenaltySeconds: 150,
          score: 59998850,
        },
        {
          rank: 2,
          userId: '22222222-2222-4222-8222-222222222222',
          username: 'bob_master',
          problemsSolved: 3,
          totalPenaltySeconds: 45,
          score: 39999955,
        },
        {
          rank: 3,
          userId: '33333333-3333-4333-8333-333333333333',
          username: 'charlie_expert',
          problemsSolved: 2,
          totalPenaltySeconds: 30,
          score: 29999970,
        },
      ],
      pagination: { page: 1, limit: 20, total: 3, totalPages: 1 },
    });

    renderWithClient('/leaderboard');

    await waitFor(() => {
      expect(screen.getByText('alice_grandmaster')).toBeDefined();
    });

    expect(screen.getByText('bob_master')).toBeDefined();
    expect(screen.getByText('charlie_expert')).toBeDefined();

    // Verify formatted penalties
    expect(screen.getByText('2m 30s')).toBeDefined(); // 150s
    expect(screen.getByText('45s')).toBeDefined();
    expect(screen.getByText('30s')).toBeDefined();

    // Verify solved counts
    expect(screen.getByText('5')).toBeDefined();
    expect(screen.getByText('3')).toBeDefined();
    expect(screen.getByText('2')).toBeDefined();

    // Verify rank badges
    expect(screen.getByText('#1')).toBeDefined();
    expect(screen.getByText('#2')).toBeDefined();
    expect(screen.getByText('#3')).toBeDefined();

    // Verify header counter
    expect(screen.getByText('3 Ranked Coders')).toBeDefined();
  });

  it('highlights current authenticated user with a "You" badge', async () => {
    vi.spyOn(authApi, 'fetchCurrentUser').mockResolvedValue({
      id: '22222222-2222-4222-8222-222222222222',
      username: 'bob_master',
      email: 'bob@example.com',
      role: 'user',
    });

    vi.spyOn(leaderboardApi, 'fetchLeaderboard').mockResolvedValue({
      leaderboard: [
        {
          rank: 1,
          userId: '11111111-1111-4111-8111-111111111111',
          username: 'alice_grandmaster',
          problemsSolved: 5,
          totalPenaltySeconds: 150,
          score: 59998850,
        },
        {
          rank: 2,
          userId: '22222222-2222-4222-8222-222222222222',
          username: 'bob_master',
          problemsSolved: 3,
          totalPenaltySeconds: 45,
          score: 39999955,
        },
      ],
      pagination: { page: 1, limit: 20, total: 2, totalPages: 1 },
    });

    renderWithClient('/leaderboard');

    await waitFor(() => {
      expect(screen.getAllByText('bob_master').length).toBeGreaterThanOrEqual(1);
    });

    // "You" badge is rendered next to the current user
    expect(screen.getByText('You')).toBeDefined();
  });

  it('supports pagination: navigates between pages and requests updated page numbers', async () => {
    const fetchSpy = vi.spyOn(leaderboardApi, 'fetchLeaderboard').mockImplementation((params) => {
      const page = params?.page ?? 1;
      return Promise.resolve({
        leaderboard: [
          {
            rank: page === 1 ? 1 : 21,
            userId: `user-${page}`,
            username: `coder_page_${page}`,
            problemsSolved: 1,
            totalPenaltySeconds: 10,
            score: 10000000,
          },
        ],
        pagination: { page, limit: 20, total: 35, totalPages: 2 },
      });
    });

    renderWithClient('/leaderboard');

    await waitFor(() => {
      expect(screen.getByText('coder_page_1')).toBeDefined();
    });

    expect(screen.getByTestId('pagination-info').textContent).toContain('Page 1 of 2');
    const prevBtn = screen.getByRole('button', { name: 'Previous page' });
    const nextBtn = screen.getByRole('button', { name: 'Next page' });

    expect((prevBtn as HTMLButtonElement).disabled).toBe(true);
    expect((nextBtn as HTMLButtonElement).disabled).toBe(false);

    // Click Next
    fireEvent.click(nextBtn);

    await waitFor(() => {
      expect(screen.getByText('coder_page_2')).toBeDefined();
    });

    expect(fetchSpy).toHaveBeenCalledWith(
      expect.objectContaining({ page: 2, limit: 20 }),
      expect.anything()
    );
    expect(screen.getByTestId('pagination-info').textContent).toContain('Page 2 of 2');
    expect((nextBtn as HTMLButtonElement).disabled).toBe(true);
  });

  it('displays error alert on API failure and provides working retry button', async () => {
    const fetchSpy = vi
      .spyOn(leaderboardApi, 'fetchLeaderboard')
      .mockRejectedValueOnce(makeAxiosError(500, 'Leaderboard service unavailable'))
      .mockResolvedValueOnce({
        leaderboard: [
          {
            rank: 1,
            userId: '11111111-1111-4111-8111-111111111111',
            username: 'recovered_coder',
            problemsSolved: 1,
            totalPenaltySeconds: 5,
            score: 10000000,
          },
        ],
        pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
      });

    renderWithClient('/leaderboard');

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeDefined();
    });
    expect(screen.getByText('Failed to load leaderboard')).toBeDefined();
    expect(screen.getByText('Leaderboard service unavailable')).toBeDefined();

    // Click retry
    const retryBtn = screen.getByRole('button', { name: 'Try again' });
    fireEvent.click(retryBtn);

    await waitFor(() => {
      expect(screen.getByText('recovered_coder')).toBeDefined();
    });
    expect(screen.queryByRole('alert')).toBeNull();
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });
});
