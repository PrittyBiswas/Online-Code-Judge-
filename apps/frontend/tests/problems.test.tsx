// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AxiosError, AxiosHeaders } from 'axios';
import { ProblemDifficulty, ProblemVisibility } from '@judge/shared';
import { AppRoutes } from '../src/App';
import * as authApi from '../src/services/authApi';
import * as problemsApi from '../src/services/problemsApi';
import type { Problem } from '../src/types';

vi.mock('../src/hooks/useHealthCheck', () => ({
  useHealthCheck: () => ({
    status: 'online' as const,
    data: { status: 'ok', service: '@judge/api', uptime: 12, timestamp: '2026-11-12T00:00:00Z' },
  }),
}));

vi.mock('@monaco-editor/react', () => ({
  default: ({ value, onChange }: { value: string; onChange?: (val: string) => void }) => (
    <textarea
      aria-label="Source code editor"
      value={value}
      onChange={(e) => onChange?.(e.target.value)}
    />
  ),
}));

function makeProblem(overrides: Partial<Problem> = {}): Problem {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    title: 'Two Sum',
    slug: 'two-sum-111111',
    statement: 'Given an array of integers, return indices of the two numbers.',
    difficulty: ProblemDifficulty.EASY,
    tags: ['arrays', 'hash-table'],
    timeLimitMs: 1000,
    memoryLimitMb: 128,
    sampleInput: '2 7 11 15\n9',
    sampleExpectedOutput: '0 1',
    visibility: ProblemVisibility.PUBLIC,
    setterId: '99999999-9999-4999-8999-999999999999',
    isArchived: false,
    createdAt: '2026-11-12T00:00:00.000Z',
    updatedAt: '2026-11-12T00:00:00.000Z',
    ...overrides,
  };
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

function renderApp(initialEntries: string[] = ['/problems']) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={initialEntries}>
        <AppRoutes />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('Day 13 — Frontend Problem List & Problem Details', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(authApi, 'fetchCurrentUser').mockRejectedValue(makeAxiosError(401, 'Unauthorized'));
  });

  afterEach(() => {
    cleanup();
  });

  it('renders loading state, then displays public problem list without login', async () => {
    let resolveList!: (value: { items: Problem[]; nextCursor: string | null }) => void;
    vi.spyOn(problemsApi, 'fetchProblems').mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveList = resolve;
        })
    );

    renderApp(['/problems']);

    expect(screen.getByText(/loading problems/i)).toBeTruthy();

    resolveList({
      items: [
        makeProblem(),
        makeProblem({
          id: '22222222-2222-4222-8222-222222222222',
          title: 'Graph Shortest Path',
          slug: 'graph-shortest-path-222222',
          difficulty: ProblemDifficulty.HARD,
          tags: ['graphs'],
          timeLimitMs: 2500,
          memoryLimitMb: 256,
        }),
      ],
      nextCursor: null,
    });

    await waitFor(() => {
      expect(screen.getByText('Two Sum')).toBeTruthy();
      expect(screen.getByText('Graph Shortest Path')).toBeTruthy();
    });
    expect(screen.getByText('1000 ms')).toBeTruthy();
    expect(screen.getByText('256 MB')).toBeTruthy();
  });

  it('displays empty state when no problems are returned and error state on API failure', async () => {
    const fetchSpy = vi
      .spyOn(problemsApi, 'fetchProblems')
      .mockResolvedValueOnce({ items: [], nextCursor: null });

    renderApp(['/problems']);

    await waitFor(() => {
      expect(screen.getByText(/no problems available yet/i)).toBeTruthy();
    });

    cleanup();
    fetchSpy.mockRejectedValueOnce(makeAxiosError(500, 'Database temporarily unavailable'));

    renderApp(['/problems']);

    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toContain('Database temporarily unavailable');
    });
  });

  it('debounces search input (~300ms), combines difficulty + tag with AND, and resets cursor', async () => {
    const fetchSpy = vi
      .spyOn(problemsApi, 'fetchProblems')
      .mockResolvedValueOnce({
        items: [makeProblem()],
        nextCursor: 'cursor-page-2',
      })
      .mockResolvedValue({
        items: [
          makeProblem({
            id: '33333333-3333-4333-8333-333333333333',
            title: 'Binary Tree DP',
            slug: 'binary-tree-dp-333333',
            difficulty: ProblemDifficulty.MEDIUM,
            tags: ['trees'],
          }),
        ],
        nextCursor: null,
      });

    renderApp(['/problems']);

    await waitFor(() => expect(screen.getByText('Two Sum')).toBeTruthy());

    // Advance to page 2 using cursor
    fireEvent.click(screen.getByRole('button', { name: /next/i }));
    await waitFor(() => {
      expect(fetchSpy).toHaveBeenLastCalledWith(
        expect.objectContaining({ cursor: 'cursor-page-2', limit: 20 }),
        expect.anything()
      );
    });

    // Apply difficulty + debounced search + debounced tag -> must reset cursor to undefined
    fireEvent.change(screen.getByLabelText(/difficulty/i), {
      target: { value: ProblemDifficulty.MEDIUM },
    });
    fireEvent.change(screen.getByLabelText(/search problems/i), {
      target: { value: 'binary' },
    });
    fireEvent.change(screen.getByLabelText(/tag \/ category/i), {
      target: { value: 'trees' },
    });

    // Immediate call for difficulty change should already have cursor=undefined (no stale cursor)
    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          difficulty: ProblemDifficulty.MEDIUM,
          cursor: undefined,
        }),
        expect.anything()
      );
    });

    // After ~300ms debounce, combined search + difficulty + tag are sent together
    await waitFor(
      () => {
        expect(fetchSpy).toHaveBeenLastCalledWith(
          expect.objectContaining({
            search: 'binary',
            difficulty: ProblemDifficulty.MEDIUM,
            tag: 'trees',
            cursor: undefined,
          }),
          expect.anything()
        );
      },
      { timeout: 1500 }
    );
  });

  it('navigates Previous/Next using cursor pagination and ignores stale search responses', async () => {
    let resolveStale!: (value: { items: Problem[]; nextCursor: string | null }) => void;

    const fetchSpy = vi
      .spyOn(problemsApi, 'fetchProblems')
      .mockResolvedValueOnce({
        items: [makeProblem({ title: 'Page 1 Item' })],
        nextCursor: 'next-abc',
      })
      .mockResolvedValueOnce({
        items: [makeProblem({ id: '2', title: 'Page 2 Item' })],
        nextCursor: null,
      })
      .mockResolvedValueOnce({
        items: [makeProblem({ title: 'Page 1 Item' })],
        nextCursor: 'next-abc',
      })
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveStale = resolve;
          })
      )
      .mockResolvedValueOnce({
        items: [makeProblem({ id: '4', title: 'Fresh Search Result' })],
        nextCursor: null,
      });

    renderApp(['/problems']);

    await waitFor(() => expect(screen.getByText('Page 1 Item')).toBeTruthy());

    // Next page
    fireEvent.click(screen.getByRole('button', { name: /next/i }));
    await waitFor(() => expect(screen.getByText('Page 2 Item')).toBeTruthy());

    // Previous page
    fireEvent.click(screen.getByRole('button', { name: /previous/i }));
    await waitFor(() => expect(screen.getByText('Page 1 Item')).toBeTruthy());

    // Trigger slow "old" search, then quickly trigger "new" search
    fireEvent.change(screen.getByLabelText(/search problems/i), {
      target: { value: 'old' },
    });
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(4), { timeout: 1500 });

    fireEvent.change(screen.getByLabelText(/search problems/i), {
      target: { value: 'new' },
    });
    await waitFor(() => expect(screen.getByText('Fresh Search Result')).toBeTruthy(), {
      timeout: 1500,
    });

    // Resolve the stale "old" request AFTER "new" has already rendered
    resolveStale({
      items: [makeProblem({ id: '99', title: 'Stale Old Result' })],
      nextCursor: null,
    });

    await waitFor(() => {
      expect(screen.getByText('Fresh Search Result')).toBeTruthy();
      expect(screen.queryByText('Stale Old Result')).toBeNull();
    });
  });

  it('fetches and renders Problem Details safely without exposing hidden test or storage fields', async () => {
    const problemWithExtraUnsafeFields = {
      ...makeProblem({
        title: 'Safe Detail Problem',
        statement: 'Line 1 <script>alert(1)</script>\nLine 2',
        sampleInput: '3 4',
        sampleExpectedOutput: '7',
      }),
      // Verify UI never renders any unexpected hidden/storage fields even if passed in memory
      inputKey: 'problems/secret/test_0_in.txt',
      expectedOutputKey: 'problems/secret/test_0_out.txt',
      hiddenInput: 'TOP_SECRET_TEST_INPUT',
    } as Problem;

    vi.spyOn(problemsApi, 'fetchProblemById').mockResolvedValueOnce(problemWithExtraUnsafeFields);

    const view = renderApp(['/problems/safe-detail-problem']);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Safe Detail Problem' })).toBeTruthy();
    });

    expect(screen.getByText(/Line 1 <script>alert\(1\)<\/script>/)).toBeTruthy();
    expect(screen.getByText('3 4')).toBeTruthy();
    expect(screen.getByText('7')).toBeTruthy();
    expect(view.container.querySelector('script')).toBeNull();
    expect(view.container.textContent).not.toContain('TOP_SECRET_TEST_INPUT');
    expect(view.container.textContent).not.toContain('problems/secret/test_0_in.txt');
    expect(screen.getByRole('link', { name: /back to problems/i }).getAttribute('href')).toBe(
      '/problems'
    );
  });

  it('displays a useful not-found state when GET /api/problems/:id returns 404', async () => {
    vi.spyOn(problemsApi, 'fetchProblemById').mockRejectedValueOnce(
      makeAxiosError(404, 'Problem not found')
    );

    renderApp(['/problems/nonexistent-slug']);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /problem not found/i })).toBeTruthy();
    });
    expect(screen.getByRole('link', { name: /browse all problems/i })).toBeTruthy();
  });
});
