// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AxiosError, AxiosHeaders } from 'axios';
import { ProblemDifficulty, ProblemVisibility, Role } from '@judge/shared';
import { AppRoutes } from '../src/App';
import * as authApi from '../src/services/authApi';
import * as contestsApi from '../src/services/contestsApi';
import * as problemsApi from '../src/services/problemsApi';
import * as submissionsApi from '../src/services/submissionsApi';
import type { Contest, ContestProblemSummary, LeaderboardEntry, Problem } from '../src/types';

vi.mock('../src/hooks/useHealthCheck', () => ({
  useHealthCheck: () => ({
    status: 'online' as const,
    data: { status: 'ok', service: '@judge/api', uptime: 12, timestamp: '2026-11-14T00:00:00Z' },
  }),
}));

vi.mock('@monaco-editor/react', () => ({
  default: ({
    value,
    onChange,
    language,
    options,
  }: {
    value: string;
    onChange?: (val: string) => void;
    language: string;
    options?: { readOnly?: boolean };
  }) => (
    <textarea
      aria-label="Source code editor"
      data-language={language}
      value={value}
      readOnly={options?.readOnly}
      onChange={(e) => onChange?.(e.target.value)}
    />
  ),
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

function makeProblem(overrides: Partial<Problem> = {}): Problem {
  return {
    id: 'p1111111-1111-4111-8111-111111111111',
    title: 'Array Maximizer',
    slug: 'array-maximizer-111111',
    statement: 'Find the maximum contiguous sum.',
    difficulty: ProblemDifficulty.MEDIUM,
    tags: ['arrays', 'dynamic-programming'],
    timeLimitMs: 1500,
    memoryLimitMb: 256,
    sampleInput: '5\n1 -2 3 4 -1',
    sampleExpectedOutput: '7',
    visibility: ProblemVisibility.CONTEST_ONLY,
    setterId: 'setter-1',
    isArchived: false,
    createdAt: '2026-11-14T00:00:00.000Z',
    updatedAt: '2026-11-14T00:00:00.000Z',
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

describe('Day 18 — Contest Management Frontend Implementation', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(authApi, 'fetchCurrentUser').mockRejectedValue(makeAxiosError(401, 'Unauthorized'));
  });

  afterEach(() => {
    cleanup();
  });

  it('1. Contest list loads and displays contests correctly', async () => {
    const mockContests = [
      makeContest({ id: 'c1', title: 'Speed Run #1' }),
      makeContest({ id: 'c2', title: 'Algorithm Championship' }),
    ];
    vi.spyOn(contestsApi, 'getContests').mockResolvedValue(mockContests);

    renderApp(['/contests']);

    expect(screen.getByText(/loading contests/i)).toBeTruthy();

    await waitFor(() => {
      expect(screen.getByText('Speed Run #1')).toBeTruthy();
      expect(screen.getByText('Algorithm Championship')).toBeTruthy();
    });
  });

  it('2. Empty contest list displays an appropriate message', async () => {
    vi.spyOn(contestsApi, 'getContests').mockResolvedValue([]);

    renderApp(['/contests']);

    await waitFor(() => {
      expect(screen.getByText(/no contests found/i)).toBeTruthy();
    });
  });

  it('3. API failure displays an error state and allows retry', async () => {
    const errorSpy = vi
      .spyOn(contestsApi, 'getContests')
      .mockRejectedValueOnce(makeAxiosError(500, 'Database failure'))
      .mockResolvedValueOnce([makeContest({ title: 'Recovered Contest' })]);

    renderApp(['/contests']);

    await waitFor(() => {
      expect(screen.getByText(/unable to load contests/i)).toBeTruthy();
      expect(screen.getByText(/database failure/i)).toBeTruthy();
    });

    const retryBtn = screen.getByRole('button', { name: /try again/i });
    fireEvent.click(retryBtn);

    await waitFor(() => {
      expect(screen.getByText('Recovered Contest')).toBeTruthy();
    });
    expect(errorSpy).toHaveBeenCalledTimes(2);
  });

  it('4. Upcoming contest displays countdown to start', async () => {
    const now = Date.now();
    const upcoming = makeContest({
      id: 'c-up',
      title: 'Upcoming Hackathon',
      startTime: new Date(now + 86400000).toISOString(), // Starts in 1 day
      endTime: new Date(now + 172800000).toISOString(),
      status: 'UPCOMING',
    });
    vi.spyOn(contestsApi, 'getContest').mockResolvedValue(upcoming);
    vi.spyOn(contestsApi, 'getContestProblems').mockResolvedValue([]);
    vi.spyOn(contestsApi, 'getContestLeaderboard').mockResolvedValue([]);

    renderApp(['/contests/c-up']);

    await waitFor(() => {
      expect(screen.getByText('Upcoming Hackathon')).toBeTruthy();
      expect(screen.getByText(/starts in/i)).toBeTruthy();
      expect(screen.getAllByText(/upcoming/i).length).toBeGreaterThanOrEqual(1);
    });
  });

  it('5. Running contest displays active status and remaining time', async () => {
    const now = Date.now();
    const running = makeContest({
      id: 'c-run',
      title: 'Active Battle',
      startTime: new Date(now - 1800000).toISOString(), // 30m ago
      endTime: new Date(now + 3600000).toISOString(), // 1h remaining
      status: 'RUNNING',
    });
    vi.spyOn(contestsApi, 'getContest').mockResolvedValue(running);
    vi.spyOn(contestsApi, 'getContestProblems').mockResolvedValue([]);
    vi.spyOn(contestsApi, 'getContestLeaderboard').mockResolvedValue([]);

    renderApp(['/contests/c-run']);

    await waitFor(() => {
      expect(screen.getByText('Active Battle')).toBeTruthy();
      expect(screen.getByText(/remaining time/i)).toBeTruthy();
      expect(screen.getByText(/live now/i)).toBeTruthy();
    });
  });

  it('6. Past contest displays completed status', async () => {
    const now = Date.now();
    const past = makeContest({
      id: 'c-past',
      title: 'Past Contest',
      startTime: new Date(now - 7200000).toISOString(),
      endTime: new Date(now - 3600000).toISOString(), // Ended 1h ago
      status: 'ENDED',
      isEnded: true,
    });
    vi.spyOn(contestsApi, 'getContest').mockResolvedValue(past);
    vi.spyOn(contestsApi, 'getContestProblems').mockResolvedValue([]);
    vi.spyOn(contestsApi, 'getContestLeaderboard').mockResolvedValue([]);

    renderApp(['/contests/c-past']);

    await waitFor(() => {
      expect(screen.getByText('Past Contest')).toBeTruthy();
      expect(screen.getByText(/contest closed/i)).toBeTruthy();
    });
  });

  it('7. User can register for an eligible contest', async () => {
    vi.spyOn(authApi, 'fetchCurrentUser').mockResolvedValue({
      id: 'user-1',
      username: 'alice',
      email: 'alice@judge.local',
      role: Role.USER,
    });

    const contest = makeContest({ id: 'c-reg', isRegistered: false });
    vi.spyOn(contestsApi, 'getContest').mockResolvedValue(contest);
    vi.spyOn(contestsApi, 'getContestProblems').mockResolvedValue([]);
    vi.spyOn(contestsApi, 'getContestLeaderboard').mockResolvedValue([]);
    const regSpy = vi.spyOn(contestsApi, 'registerForContest').mockResolvedValue({
      registered: true,
      registeredAt: new Date().toISOString(),
    });

    renderApp(['/contests/c-reg']);

    const regBtn = await screen.findByRole('button', { name: /register for contest/i });
    fireEvent.click(regBtn);

    await waitFor(() => {
      expect(regSpy).toHaveBeenCalledWith('c-reg');
    });
  });

  it('8. User can unregister when permitted before contest start', async () => {
    vi.spyOn(authApi, 'fetchCurrentUser').mockResolvedValue({
      id: 'user-1',
      username: 'alice',
      email: 'alice@judge.local',
      role: Role.USER,
    });

    const now = Date.now();
    const upcoming = makeContest({
      id: 'c-unreg',
      isRegistered: true,
      startTime: new Date(now + 86400000).toISOString(), // Upcoming
      endTime: new Date(now + 172800000).toISOString(),
      status: 'UPCOMING',
    });
    vi.spyOn(contestsApi, 'getContest').mockResolvedValue(upcoming);
    vi.spyOn(contestsApi, 'getContestProblems').mockResolvedValue([]);
    vi.spyOn(contestsApi, 'getContestLeaderboard').mockResolvedValue([]);
    const unregSpy = vi.spyOn(contestsApi, 'unregisterFromContest').mockResolvedValue({
      unregistered: true,
    });

    renderApp(['/contests/c-unreg']);

    const unregBtn = await screen.findByRole('button', { name: /unregister/i });
    fireEvent.click(unregBtn);

    await waitFor(() => {
      expect(unregSpy).toHaveBeenCalledWith('c-unreg');
    });
  });

  it('9. Contest problem list loads when authorized', async () => {
    const contest = makeContest({ id: 'c-probs' });
    const problems: ContestProblemSummary[] = [
      {
        id: 'p1',
        title: 'Binary Tree Paths',
        slug: 'binary-tree-paths',
        difficulty: ProblemDifficulty.EASY,
        problemOrder: 1,
        tags: ['trees'],
      },
      {
        id: 'p2',
        title: 'Knapsack Variant',
        slug: 'knapsack-variant',
        difficulty: ProblemDifficulty.HARD,
        problemOrder: 2,
        tags: ['dp'],
      },
    ];
    vi.spyOn(contestsApi, 'getContest').mockResolvedValue(contest);
    vi.spyOn(contestsApi, 'getContestProblems').mockResolvedValue(problems);
    vi.spyOn(contestsApi, 'getContestLeaderboard').mockResolvedValue([]);

    renderApp(['/contests/c-probs']);

    await waitFor(() => {
      expect(screen.getByText('Binary Tree Paths')).toBeTruthy();
      expect(screen.getByText('Knapsack Variant')).toBeTruthy();
    });
  });

  it('10. Contest problem navigation preserves contestId', async () => {
    const contest = makeContest({ id: 'c-ctx' });
    const problems: ContestProblemSummary[] = [
      {
        id: 'p-ctx-1',
        title: 'Contextual Problem',
        slug: 'contextual-problem',
        difficulty: ProblemDifficulty.MEDIUM,
        problemOrder: 1,
      },
    ];
    vi.spyOn(contestsApi, 'getContest').mockResolvedValue(contest);
    vi.spyOn(contestsApi, 'getContestProblems').mockResolvedValue(problems);
    vi.spyOn(contestsApi, 'getContestLeaderboard').mockResolvedValue([]);

    renderApp(['/contests/c-ctx']);

    await waitFor(() => {
      expect(screen.getByText('Contextual Problem')).toBeTruthy();
    });

    const solveLink = screen.getByRole('link', { name: /solve/i });
    expect(solveLink.getAttribute('href')).toBe('/problems/p-ctx-1?contestId=c-ctx');
  });

  it('11. Contest submission includes contestId in request payload', async () => {
    vi.spyOn(authApi, 'fetchCurrentUser').mockResolvedValue({
      id: 'user-1',
      username: 'coder',
      email: 'coder@judge.local',
      role: Role.USER,
    });

    const prob = makeProblem({ id: 'prob-contest-1', title: 'Contest Challenge' });
    const probSpy = vi.spyOn(problemsApi, 'fetchProblemById').mockResolvedValue(prob);
    const submitSpy = vi.spyOn(submissionsApi, 'submitOfficialSolution').mockResolvedValue({
      id: 'sub-123',
      status: 'QUEUED' as any,
    });
    vi.spyOn(submissionsApi, 'fetchSubmissionById').mockResolvedValue({
      id: 'sub-123',
      problemId: 'prob-contest-1',
      userId: 'user-1',
      code: 'console.log("hello");',
      language: 'javascript',
      status: 'COMPLETED' as any,
      retryCount: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    renderApp(['/problems/prob-contest-1?contestId=target-contest-uuid']);

    await waitFor(() => {
      expect(probSpy).toHaveBeenCalledWith(
        'prob-contest-1',
        expect.anything(),
        'target-contest-uuid'
      );
    });

    // Check that "Back to Contest" link is rendered
    expect(screen.getByText(/back to contest/i).getAttribute('href')).toBe(
      '/contests/target-contest-uuid'
    );

    // Click submit
    const submitBtn = await screen.findByRole('button', { name: /^submit$/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(submitSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          problemId: 'prob-contest-1',
          contestId: 'target-contest-uuid',
        }),
        expect.anything()
      );
    });
  });

  it('12. Contest sample run includes contestId in request payload', async () => {
    vi.spyOn(authApi, 'fetchCurrentUser').mockResolvedValue({
      id: 'user-1',
      username: 'coder',
      email: 'coder@judge.local',
      role: Role.USER,
    });

    const prob = makeProblem({ id: 'prob-sample-1', title: 'Sample Challenge' });
    vi.spyOn(problemsApi, 'fetchProblemById').mockResolvedValue(prob);
    const sampleSpy = vi.spyOn(submissionsApi, 'runSampleCode').mockResolvedValue({
      runId: 'run-123',
      status: 'QUEUED',
    });
    vi.spyOn(submissionsApi, 'fetchSampleRunResult').mockResolvedValue({
      runId: 'run-123',
      problemId: 'prob-sample-1',
      language: 'javascript',
      status: 'COMPLETED',
      outcome: 'SUCCESS',
      actualOutput: 'hello',
      expectedOutput: 'hello',
      executionTimeMs: 12,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    renderApp(['/problems/prob-sample-1?contestId=sample-contest-uuid']);

    await waitFor(() => {
      expect(screen.getByText('Sample Challenge')).toBeTruthy();
    });

    const runBtn = screen.getByRole('button', { name: /run sample/i });
    fireEvent.click(runBtn);

    await waitFor(() => {
      expect(sampleSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          problemId: 'prob-sample-1',
          contestId: 'sample-contest-uuid',
        }),
        expect.anything()
      );
    });
  });

  it('13. Public problem submission outside a contest does not require contestId', async () => {
    vi.spyOn(authApi, 'fetchCurrentUser').mockResolvedValue({
      id: 'user-1',
      username: 'coder',
      email: 'coder@judge.local',
      role: Role.USER,
    });

    const prob = makeProblem({ id: 'prob-public-1', title: 'Public Problem' });
    vi.spyOn(problemsApi, 'fetchProblemById').mockResolvedValue(prob);
    const submitSpy = vi.spyOn(submissionsApi, 'submitOfficialSolution').mockResolvedValue({
      id: 'sub-pub-123',
      status: 'QUEUED' as any,
    });
    vi.spyOn(submissionsApi, 'fetchSubmissionById').mockResolvedValue({
      id: 'sub-pub-123',
      problemId: 'prob-public-1',
      userId: 'user-1',
      code: 'console.log("public");',
      language: 'javascript',
      status: 'COMPLETED' as any,
      retryCount: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    // Notice no contestId in URL query string!
    renderApp(['/problems/prob-public-1']);

    await waitFor(() => {
      expect(screen.getByText('Public Problem')).toBeTruthy();
    });

    // Check that "Back to Problems" link is rendered
    expect(screen.getByText(/back to problems/i).getAttribute('href')).toBe('/problems');

    const submitBtn = await screen.findByRole('button', { name: /^submit$/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(submitSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          problemId: 'prob-public-1',
          contestId: undefined,
        }),
        expect.anything()
      );
    });
  });

  it('14. Contest leaderboard renders API response and displays frozen notice when active', async () => {
    const contest = makeContest({ id: 'c-lb', isFrozen: true });
    const entries: LeaderboardEntry[] = [
      {
        rank: 1,
        userId: 'u1',
        username: 'champion',
        problemsSolved: 3,
        totalPenaltySeconds: 120,
        score: 30000000,
      },
      {
        rank: 2,
        userId: 'u2',
        username: 'runner_up',
        problemsSolved: 2,
        totalPenaltySeconds: 300,
        score: 20000000,
      },
    ];
    vi.spyOn(contestsApi, 'getContest').mockResolvedValue(contest);
    vi.spyOn(contestsApi, 'getContestProblems').mockResolvedValue([]);
    vi.spyOn(contestsApi, 'getContestLeaderboard').mockResolvedValue(entries);

    renderApp(['/contests/c-lb']);

    await waitFor(() => {
      expect(screen.getByText('champion')).toBeTruthy();
      expect(screen.getByText('runner_up')).toBeTruthy();
      expect(screen.getByText('#1')).toBeTruthy();
      expect(screen.getByText('#2')).toBeTruthy();
      // Verifies frozen banner
      expect(screen.getByText(/leaderboard frozen/i)).toBeTruthy();
    });
  });

  it('15. ADMIN-only creation UI is hidden from ordinary users and available for ADMIN', async () => {
    // 1. As regular USER:
    vi.spyOn(authApi, 'fetchCurrentUser').mockResolvedValue({
      id: 'user-reg',
      username: 'bob',
      email: 'bob@judge.local',
      role: Role.USER,
    });
    vi.spyOn(contestsApi, 'getContests').mockResolvedValue([]);

    const { unmount } = renderApp(['/contests']);

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /create contest/i })).toBeNull();
    });

    unmount();

    // 2. As ADMIN:
    vi.spyOn(authApi, 'fetchCurrentUser').mockResolvedValue({
      id: 'admin-1',
      username: 'superadmin',
      email: 'admin@judge.local',
      role: Role.ADMIN,
    });

    renderApp(['/contests']);

    const createBtn = await screen.findByRole('button', { name: /create contest/i });
    expect(createBtn).toBeTruthy();

    fireEvent.click(createBtn);

    // Dialog appears
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(screen.getByText(/create new contest/i)).toBeTruthy();
  });

  it('16. Public sample run outside a contest does not require contestId', async () => {
    vi.spyOn(authApi, 'fetchCurrentUser').mockResolvedValue({
      id: 'user-1',
      username: 'coder',
      email: 'coder@judge.local',
      role: Role.USER,
    });

    const prob = makeProblem({ id: 'prob-sample-pub-1', title: 'Public Sample Challenge' });
    vi.spyOn(problemsApi, 'fetchProblemById').mockResolvedValue(prob);
    const sampleSpy = vi.spyOn(submissionsApi, 'runSampleCode').mockResolvedValue({
      runId: 'run-pub-123',
      status: 'QUEUED',
    });
    vi.spyOn(submissionsApi, 'fetchSampleRunResult').mockResolvedValue({
      runId: 'run-pub-123',
      problemId: 'prob-sample-pub-1',
      language: 'javascript',
      status: 'COMPLETED',
      outcome: 'SUCCESS',
      actualOutput: 'hello',
      expectedOutput: 'hello',
      executionTimeMs: 12,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    // Notice no contestId in URL query string
    renderApp(['/problems/prob-sample-pub-1']);

    await waitFor(() => {
      expect(screen.getByText('Public Sample Challenge')).toBeTruthy();
    });

    const runBtn = screen.getByRole('button', { name: /run sample/i });
    fireEvent.click(runBtn);

    await waitFor(() => {
      expect(sampleSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          problemId: 'prob-sample-pub-1',
          contestId: undefined,
        }),
        expect.anything()
      );
    });
  });
});
