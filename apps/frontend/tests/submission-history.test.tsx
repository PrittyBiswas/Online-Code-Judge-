// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SubmissionStatus, Verdict, ProblemDifficulty } from '@judge/shared';
import { SubmissionVerdictBadge } from '../src/components/submissions/SubmissionVerdictBadge';
import { SubmissionFilters } from '../src/components/submissions/SubmissionFilters';
import { SubmissionTable } from '../src/components/submissions/SubmissionTable';
import { SubmissionSourceViewer } from '../src/components/submissions/SubmissionSourceViewer';
import { SubmissionHistoryPage } from '../src/pages/SubmissionHistoryPage';
import { SubmissionDetailsPage } from '../src/pages/SubmissionDetailsPage';
import * as submissionsApi from '../src/services/submissionsApi';
import type { Submission, SubmissionSummary } from '../src/types';

vi.mock('@monaco-editor/react', () => ({
  default: ({
    value,
    language,
    options,
  }: {
    value: string;
    language: string;
    options?: { readOnly?: boolean };
  }) => (
    <textarea
      aria-label="Submitted source code"
      data-language={language}
      value={value}
      readOnly={options?.readOnly}
      onChange={() => {}}
    />
  ),
}));

describe('Phase 4 — Frontend Submission History and Source Inspector Suite', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false, gcTime: 0 },
      },
    });
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  describe('SubmissionVerdictBadge', () => {
    it('renders Accepted badge with correct label and testid', () => {
      render(<SubmissionVerdictBadge verdict={Verdict.ACCEPTED} />);
      const badge = screen.getByTestId('verdict-badge-accepted');
      expect(badge).toBeTruthy();
      expect(badge.textContent).toContain('Accepted');
    });

    it('renders Wrong Answer badge', () => {
      render(<SubmissionVerdictBadge verdict={Verdict.WRONG_ANSWER} />);
      const badge = screen.getByTestId('verdict-badge-wrong-answer');
      expect(badge).toBeTruthy();
      expect(badge.textContent).toContain('Wrong Answer');
    });

    it('renders Time Limit Exceeded badge', () => {
      render(<SubmissionVerdictBadge verdict={Verdict.TIME_LIMIT_EXCEEDED} />);
      const badge = screen.getByTestId('verdict-badge-time-limit');
      expect(badge).toBeTruthy();
      expect(badge.textContent).toContain('Time Limit Exceeded');
    });

    it('renders Queued and Running statuses before verdict is assigned', () => {
      const { rerender } = render(<SubmissionVerdictBadge status={SubmissionStatus.QUEUED} />);
      expect(screen.getByTestId('verdict-badge-queued').textContent).toContain('In Queue');

      rerender(<SubmissionVerdictBadge status={SubmissionStatus.RUNNING} />);
      expect(screen.getByTestId('verdict-badge-running').textContent).toContain('Judging...');
    });
  });

  describe('SubmissionFilters', () => {
    it('renders all filter controls and fires onFilterChange', () => {
      const onFilterChange = vi.fn();
      const onReset = vi.fn();

      render(
        <SubmissionFilters
          filters={{ search: '', verdict: '', language: '', startDate: '', endDate: '' }}
          onFilterChange={onFilterChange}
          onReset={onReset}
          isFiltered={false}
        />
      );

      const searchInput = screen.getByLabelText('Search submissions');
      fireEvent.change(searchInput, { target: { value: 'Two Sum' } });
      expect(onFilterChange).toHaveBeenCalledWith('search', 'Two Sum');

      const verdictSelect = screen.getByLabelText('Filter by verdict');
      fireEvent.change(verdictSelect, { target: { value: 'AC' } });
      expect(onFilterChange).toHaveBeenCalledWith('verdict', 'AC');

      const languageSelect = screen.getByLabelText('Filter by language');
      fireEvent.change(languageSelect, { target: { value: 'python' } });
      expect(onFilterChange).toHaveBeenCalledWith('language', 'python');
    });

    it('renders Clear Filters button when filters are active and calls onReset', () => {
      const onReset = vi.fn();
      render(
        <SubmissionFilters
          filters={{ search: 'test', verdict: 'AC', language: '', startDate: '', endDate: '' }}
          onFilterChange={vi.fn()}
          onReset={onReset}
          isFiltered={true}
        />
      );

      const clearBtn = screen.getByRole('button', { name: /clear all filters/i });
      expect(clearBtn).toBeTruthy();
      fireEvent.click(clearBtn);
      expect(onReset).toHaveBeenCalledTimes(1);
    });
  });

  describe('SubmissionTable', () => {
    it('renders empty state when no submissions exist', () => {
      render(
        <MemoryRouter>
          <SubmissionTable submissions={[]} isLoading={false} />
        </MemoryRouter>
      );

      expect(screen.getByText('No submissions found')).toBeTruthy();
      expect(screen.getByRole('link', { name: /browse problems/i })).toBeTruthy();
    });

    it('renders table rows with submission details and links', () => {
      const mockItems: SubmissionSummary[] = [
        {
          id: '11111111-2222-3333-4444-555555555555',
          problemId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
          userId: 'user-1',
          problemTitle: 'Two Sum',
          language: 'python',
          status: SubmissionStatus.COMPLETED,
          verdict: Verdict.ACCEPTED,
          executionTimeMs: 42,
          memoryUsedKb: 14200,
          retryCount: 0,
          createdAt: '2026-11-17T12:00:00Z',
          updatedAt: '2026-11-17T12:00:00Z',
        },
      ];

      render(
        <MemoryRouter>
          <SubmissionTable submissions={mockItems} isLoading={false} />
        </MemoryRouter>
      );

      expect(screen.getByText('#11111111')).toBeTruthy();
      expect(screen.getByText('Two Sum')).toBeTruthy();
      expect(screen.getByText('Python')).toBeTruthy();
      expect(screen.getByText('42 ms')).toBeTruthy();
      expect(screen.getByText('13.9 MB')).toBeTruthy();

      const detailsLink = screen.getByLabelText(
        'View submission 11111111-2222-3333-4444-555555555555'
      );
      expect(detailsLink).toBeTruthy();
      expect(detailsLink.getAttribute('href')).toBe(
        '/submissions/11111111-2222-3333-4444-555555555555'
      );
    });
  });

  describe('SubmissionSourceViewer', () => {
    it('renders read-only code and copies code to clipboard', async () => {
      const mockCode = 'def solution():\n    return 42\n';
      const writeTextMock = vi.fn().mockResolvedValue(undefined);
      Object.defineProperty(navigator, 'clipboard', {
        value: { writeText: writeTextMock },
        writable: true,
        configurable: true,
      });

      render(<SubmissionSourceViewer code={mockCode} language="python" />);

      expect(screen.getByText('Python (3.11)')).toBeTruthy();
      expect(screen.getByText(/2\s+lines/)).toBeTruthy();

      const textarea = screen.getByLabelText('Submitted source code') as HTMLTextAreaElement;
      expect(textarea.value).toBe(mockCode);
      expect(textarea.readOnly).toBe(true);

      const copyBtn = screen.getByRole('button', { name: /copy source code/i });
      fireEvent.click(copyBtn);

      expect(writeTextMock).toHaveBeenCalledWith(mockCode);
      await waitFor(() => {
        expect(screen.getByText('Copied!')).toBeTruthy();
      });
    });
  });

  describe('SubmissionHistoryPage', () => {
    it('fetches and renders submission list with pagination', async () => {
      const mockItems: SubmissionSummary[] = [
        {
          id: 'sub-1',
          problemId: 'prob-1',
          userId: 'user-1',
          problemTitle: 'Dynamic Programming Task',
          language: 'cpp',
          status: SubmissionStatus.COMPLETED,
          verdict: Verdict.ACCEPTED,
          executionTimeMs: 15,
          memoryUsedKb: 2048,
          retryCount: 0,
          createdAt: '2026-11-17T12:00:00Z',
          updatedAt: '2026-11-17T12:00:00Z',
        },
      ];

      vi.spyOn(submissionsApi, 'fetchSubmissions').mockResolvedValue({
        items: mockItems,
        pagination: {
          page: 1,
          limit: 20,
          total: 25,
          totalPages: 2,
          hasNextPage: true,
          hasPreviousPage: false,
        },
        nextCursor: 'sub-1',
      });

      render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={['/submissions']}>
            <SubmissionHistoryPage />
          </MemoryRouter>
        </QueryClientProvider>
      );

      await waitFor(() => {
        expect(screen.getByText('Dynamic Programming Task')).toBeTruthy();
      });

      expect(screen.getByText('25')).toBeTruthy();
      expect(screen.getByText('total submissions')).toBeTruthy();

      // Pagination controls
      const nextBtn = screen.getByRole('button', { name: /next page/i });
      expect(nextBtn).toBeTruthy();
      expect((nextBtn as HTMLButtonElement).disabled).toBe(false);

      const prevBtn = screen.getByRole('button', { name: /previous page/i });
      expect(prevBtn).toBeTruthy();
      expect((prevBtn as HTMLButtonElement).disabled).toBe(true);
    });

    it('renders error state with retry button on network failure', async () => {
      vi.spyOn(submissionsApi, 'fetchSubmissions').mockRejectedValue(
        new Error('Network error loading submissions')
      );

      render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={['/submissions']}>
            <SubmissionHistoryPage />
          </MemoryRouter>
        </QueryClientProvider>
      );

      await waitFor(() => {
        expect(screen.getByText('Network error loading submissions')).toBeTruthy();
      });

      const retryBtn = screen.getByRole('button', { name: /retry/i });
      expect(retryBtn).toBeTruthy();
    });
  });

  describe('SubmissionDetailsPage', () => {
    it('renders submission metadata, testcases breakdown, and source viewer', async () => {
      const mockSubmission: Submission = {
        id: '12345678-1234-1234-1234-123456789012',
        problemId: 'prob-100',
        problemTitle: 'Longest Palindrome',
        problemDifficulty: ProblemDifficulty.MEDIUM,
        userId: 'user-1',
        code: 'def longestPalindrome(s): return s',
        language: 'python',
        status: SubmissionStatus.COMPLETED,
        verdict: Verdict.ACCEPTED,
        executionTimeMs: 28,
        memoryUsedKb: 8192,
        failedTestIndex: undefined,
        retryCount: 0,
        createdAt: '2026-11-17T12:00:00Z',
        updatedAt: '2026-11-17T12:00:00Z',
        testCaseResults: [
          {
            index: 1,
            verdict: Verdict.ACCEPTED,
            executionTimeMs: 12,
            memoryUsedKb: 4000,
            isHidden: false,
            sampleInput: 'babad',
            sampleExpectedOutput: 'bab',
            actualOutput: 'bab',
          },
          {
            index: 2,
            verdict: Verdict.ACCEPTED,
            executionTimeMs: 16,
            memoryUsedKb: 4192,
            isHidden: true,
          },
        ],
      };

      vi.spyOn(submissionsApi, 'fetchSubmissionById').mockResolvedValue(mockSubmission);

      render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={['/submissions/12345678-1234-1234-1234-123456789012']}>
            <Routes>
              <Route path="/submissions/:id" element={<SubmissionDetailsPage />} />
            </Routes>
          </MemoryRouter>
        </QueryClientProvider>
      );

      await waitFor(() => {
        expect(screen.getByText('Longest Palindrome')).toBeTruthy();
      });

      expect(screen.getByText('28 ms')).toBeTruthy();
      expect(screen.getByText('8.0 MB')).toBeTruthy();

      // Test case execution breakdown
      expect(screen.getByText('Test Case Execution Breakdown')).toBeTruthy();
      expect(screen.getByText('Passed 2 of 2 test cases')).toBeTruthy();
      expect(screen.getByText('Hidden Test Case')).toBeTruthy();
      expect(screen.getByText('babad')).toBeTruthy();

      // Submitted source code
      expect(screen.getByText('Submitted Source Code')).toBeTruthy();
      const textarea = screen.getByLabelText('Submitted source code') as HTMLTextAreaElement;
      expect(textarea.value).toBe('def longestPalindrome(s): return s');
    });

    it('renders 403 Access Denied when user is not authorized to inspect submission', async () => {
      const forbiddenError = {
        name: 'AxiosError',
        response: { status: 403, data: { message: 'Forbidden' } },
      };
      vi.spyOn(submissionsApi, 'fetchSubmissionById').mockRejectedValue(forbiddenError);

      render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={['/submissions/forbidden-sub-id']}>
            <Routes>
              <Route path="/submissions/:id" element={<SubmissionDetailsPage />} />
            </Routes>
          </MemoryRouter>
        </QueryClientProvider>
      );

      await waitFor(() => {
        expect(screen.getByText('Access Denied')).toBeTruthy();
      });
      expect(
        screen.getByText('Access Denied: You do not have permission to inspect this submission.')
      ).toBeTruthy();
    });
  });
});
