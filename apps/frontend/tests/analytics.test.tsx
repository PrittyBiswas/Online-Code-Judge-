// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AnalyticsPage } from '../src/pages/AnalyticsPage';
import { Header } from '../src/components/Header';
import { DashboardPage } from '../src/pages/DashboardPage';
import * as analyticsApi from '../src/services/analyticsApi';
import * as authContext from '../src/context/AuthContext';
import * as notificationsApiModule from '../src/services/notificationsApi';
import { Role, Verdict, type UserAnalytics } from '../src/types';

const mockAnalytics: UserAnalytics = {
  overview: {
    totalSubmissions: 42,
    totalAccepted: 28,
    acceptanceRate: 66.7,
    totalSolvedProblems: 24,
    totalAttemptedProblems: 30,
    globalRank: 5,
  },
  difficultyBreakdown: {
    easy: { solved: 15, total: 20 },
    medium: { solved: 7, total: 15 },
    hard: { solved: 2, total: 10 },
  },
  verdictDistribution: [
    { verdict: Verdict.ACCEPTED, count: 28, percentage: 66.7 },
    { verdict: Verdict.WRONG_ANSWER, count: 8, percentage: 19.0 },
    { verdict: Verdict.TIME_LIMIT_EXCEEDED, count: 4, percentage: 9.5 },
    { verdict: Verdict.MEMORY_LIMIT_EXCEEDED, count: 1, percentage: 2.4 },
    { verdict: Verdict.RUNTIME_ERROR, count: 1, percentage: 2.4 },
    { verdict: Verdict.COMPILATION_ERROR, count: 0, percentage: 0 },
  ],
  languageUsage: [
    { language: 'python', count: 20, percentage: 47.6 },
    { language: 'javascript', count: 12, percentage: 28.6 },
    { language: 'rust', count: 10, percentage: 23.8 },
  ],
  activityHeatmap: [
    { date: '2026-03-01', count: 5, acceptedCount: 4 },
    { date: '2026-03-02', count: 8, acceptedCount: 6 },
  ],
  performanceTrends: [
    {
      submissionId: 'sub-trend-1',
      problemId: 'prob-1',
      problemTitle: 'Two Sum',
      language: 'rust',
      verdict: Verdict.ACCEPTED,
      executionTimeMs: 14,
      memoryUsedKb: 4096,
      createdAt: '2026-03-02T10:00:00.000Z',
    },
    {
      submissionId: 'sub-trend-2',
      problemId: 'prob-2',
      problemTitle: 'Add Two Numbers',
      language: 'python',
      verdict: Verdict.ACCEPTED,
      executionTimeMs: 42,
      memoryUsedKb: 12288,
      createdAt: '2026-03-01T15:00:00.000Z',
    },
  ],
};

describe('Phase 5 Frontend Analytics Suite', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    vi.spyOn(authContext, 'useAuth').mockReturnValue({
      status: 'authenticated',
      user: {
        id: '11111111-1111-4111-8111-111111111111',
        username: 'testcoder',
        email: 'testcoder@example.com',
        role: Role.USER,
      },
      bootstrapError: null,
      sessionExpiredMessage: null,
      refreshAuth: vi.fn().mockResolvedValue(undefined),
      login: vi.fn(),
      register: vi.fn(),
      logout: vi.fn().mockResolvedValue({ serverConfirmed: true }),
      clearSessionMessage: vi.fn(),
    });

    vi.spyOn(notificationsApiModule.notificationsApi, 'getActivity').mockResolvedValue([]);
    vi.spyOn(notificationsApiModule.notificationsApi, 'getNotifications').mockResolvedValue({
      notifications: [],
      unreadCount: 0,
      totalCount: 0,
    });
  });

  afterEach(() => {
    cleanup();
  });

  describe('AnalyticsPage component', () => {
    it('renders overview stats cards with correct values', async () => {
      vi.spyOn(analyticsApi, 'fetchUserAnalytics').mockResolvedValueOnce(mockAnalytics);

      render(
        <MemoryRouter>
          <AnalyticsPage />
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByText('Performance Analytics')).toBeTruthy();
      });

      expect(screen.getByText('Total Submissions')).toBeTruthy();
      expect(screen.getByText('42')).toBeTruthy();
      expect(screen.getByText('Problems Solved')).toBeTruthy();
      expect(screen.getAllByText('24').length).toBeGreaterThan(0);
      expect(screen.getByText('#5')).toBeTruthy();
      expect(screen.getAllByText('66.7%').length).toBeGreaterThan(0);
    });

    it('renders difficulty breakdown progress cards', async () => {
      vi.spyOn(analyticsApi, 'fetchUserAnalytics').mockResolvedValueOnce(mockAnalytics);

      render(
        <MemoryRouter>
          <AnalyticsPage />
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByText('Solved Problems')).toBeTruthy();
      });

      expect(screen.getByText('Easy')).toBeTruthy();
      expect(screen.getByText('Medium')).toBeTruthy();
      expect(screen.getByText('Hard')).toBeTruthy();
      expect(screen.getByText('15')).toBeTruthy();
    });

    it('renders verdict distribution and language usage', async () => {
      vi.spyOn(analyticsApi, 'fetchUserAnalytics').mockResolvedValueOnce(mockAnalytics);

      render(
        <MemoryRouter>
          <AnalyticsPage />
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByText('Verdict Distribution')).toBeTruthy();
        expect(screen.getByText('Language Distribution')).toBeTruthy();
      });

      expect(screen.getByText('Wrong Answer')).toBeTruthy();
      expect(screen.getByText('Python')).toBeTruthy();
      expect(screen.getByText('JavaScript')).toBeTruthy();
      expect(screen.getByText('Rust')).toBeTruthy();
    });

    it('renders activity calendar heatmap and performance trends table', async () => {
      vi.spyOn(analyticsApi, 'fetchUserAnalytics').mockResolvedValueOnce(mockAnalytics);

      render(
        <MemoryRouter>
          <AnalyticsPage />
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByText('Activity Calendar')).toBeTruthy();
        expect(screen.getByText('Performance Trends')).toBeTruthy();
      });

      expect(screen.getByText('Two Sum')).toBeTruthy();
      expect(screen.getByText('Add Two Numbers')).toBeTruthy();
      expect(screen.getAllByText('14 ms').length).toBeGreaterThan(0);
    });

    it('handles refresh button click', async () => {
      const fetchSpy = vi
        .spyOn(analyticsApi, 'fetchUserAnalytics')
        .mockResolvedValue(mockAnalytics);

      render(
        <MemoryRouter>
          <AnalyticsPage />
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByText('Refresh Data')).toBeTruthy();
      });

      const refreshBtn = screen.getByText('Refresh Data');
      fireEvent.click(refreshBtn);

      await waitFor(() => {
        expect(fetchSpy).toHaveBeenCalledTimes(2);
      });
    });

    it('renders error state and retries on failure', async () => {
      const fetchSpy = vi
        .spyOn(analyticsApi, 'fetchUserAnalytics')
        .mockRejectedValueOnce(new Error('Network offline'))
        .mockResolvedValueOnce(mockAnalytics);

      render(
        <MemoryRouter>
          <AnalyticsPage />
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByText('Analytics Unavailable')).toBeTruthy();
        expect(screen.getByText('Network offline')).toBeTruthy();
      });

      const retryBtn = screen.getByRole('button', { name: /retry/i });
      fireEvent.click(retryBtn);

      await waitFor(() => {
        expect(screen.getByText('Performance Analytics')).toBeTruthy();
      });
      expect(fetchSpy).toHaveBeenCalledTimes(2);
    });
  });

  describe('Navigation and Integration', () => {
    it('renders Analytics navigation link in Header for authenticated users', () => {
      render(
        <MemoryRouter>
          <Header />
        </MemoryRouter>
      );

      const link = screen.getByRole('link', { name: /analytics/i });
      expect(link).toBeTruthy();
      expect(link.getAttribute('href')).toBe('/analytics');
    });

    it('renders Performance Analytics link and banner in DashboardPage', async () => {
      render(
        <MemoryRouter>
          <DashboardPage />
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByText('Performance Analytics & Insights')).toBeTruthy();
      });

      const viewBtn = screen.getByRole('link', { name: /view analytics/i });
      expect(viewBtn).toBeTruthy();
      expect(viewBtn.getAttribute('href')).toBe('/analytics');
    });
  });
});
