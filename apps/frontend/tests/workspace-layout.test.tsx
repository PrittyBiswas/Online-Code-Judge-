// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ProblemDifficulty, SubmissionStatus, Verdict, STARTER_CODE } from '@judge/shared';
import { AppRoutes } from '../src/App';
import { registerUnauthorizedHandler } from '../src/services/apiClient';
import * as authApi from '../src/services/authApi';
import * as problemsApi from '../src/services/problemsApi';
import * as submissionsApi from '../src/services/submissionsApi';
import type { Problem } from '../src/types';

vi.mock('../src/hooks/useHealthCheck', () => ({
  useHealthCheck: () => ({
    status: 'online' as const,
    data: { status: 'ok', service: '@judge/api', uptime: 12, timestamp: '2026-11-12T00:00:00Z' },
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

function makeProblem(overrides: Partial<Problem> = {}): Problem {
  return {
    id: '11111111-2222-3333-4444-555555555555',
    title: 'Two Sum Workspace',
    slug: 'two-sum-workspace-111111',
    statement: 'Given an array of integers, find two numbers such that they add up to target.',
    difficulty: ProblemDifficulty.EASY,
    tags: ['arrays', 'hash-table'],
    timeLimitMs: 1500,
    memoryLimitMb: 256,
    sampleInput: '2 7 11 15\n9',
    sampleExpectedOutput: '0 1',
    setterId: '99999999-9999-4999-8999-999999999999',
    isArchived: false,
    createdAt: '2026-11-12T00:00:00.000Z',
    updatedAt: '2026-11-12T00:00:00.000Z',
    ...overrides,
  };
}

function renderWorkspace(problem: Problem = makeProblem()) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/problems/${problem.slug}`]}>
        <AppRoutes />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('Phase 3 — Advanced Three-Panel Coding Workspace', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    registerUnauthorizedHandler(null);
    vi.spyOn(authApi, 'fetchCurrentUser').mockResolvedValue({
      id: 'test-user-1',
      username: 'coder_pro',
      email: 'coder@judge.local',
      role: 'USER',
      createdAt: '2026-11-12T00:00:00.000Z',
    });
    vi.spyOn(problemsApi, 'fetchProblemById').mockResolvedValue(makeProblem());
  });

  afterEach(() => {
    cleanup();
    localStorage.clear();
    vi.useRealTimers();
  });

  it('renders all three panels with problem description, editor toolbar, and tabbed results', async () => {
    const testProblem = makeProblem();
    renderWorkspace(testProblem);

    // Panel A: Problem Description
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: testProblem.title })).toBeTruthy();
    });
    expect(screen.getByText('Easy')).toBeTruthy();
    expect(screen.getByText(/Time limit: 1500 ms/)).toBeTruthy();
    expect(screen.getByText(/Memory limit: 256 MB/)).toBeTruthy();
    expect(screen.getByText(testProblem.statement)).toBeTruthy();
    expect(screen.getByText('arrays')).toBeTruthy();
    expect(screen.getByText('hash-table')).toBeTruthy();
    expect(screen.getByText(/2 7 11 15/)).toBeTruthy();
    expect(screen.getByText(testProblem.sampleExpectedOutput)).toBeTruthy();

    // Panel B: Code Editor & Controls
    const editor = screen.getByLabelText('Source code editor');
    expect(editor).toBeTruthy();
    expect(editor.getAttribute('data-language')).toBe('javascript');

    expect(screen.getByRole('combobox', { name: /programming language/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /reset code/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /run sample/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /run custom/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /^submit$/i })).toBeTruthy();
    expect(screen.getByText('Saved')).toBeTruthy();

    // Panel C: 4 Tabs
    expect(screen.getByRole('button', { name: /test cases/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /custom input/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /output/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /submissions/i })).toBeTruthy();
  });

  it('supports selecting all 7 programming languages and updates starter code', async () => {
    renderWorkspace();

    await waitFor(() => {
      expect(screen.getByLabelText('Source code editor')).toBeTruthy();
    });

    const langSelector = screen.getByRole('combobox', { name: /programming language/i });
    const languages: (keyof typeof STARTER_CODE)[] = [
      'python',
      'c',
      'cpp',
      'java',
      'go',
      'rust',
      'javascript',
    ];

    for (const lang of languages) {
      fireEvent.change(langSelector, { target: { value: lang } });
      const editor = screen.getByLabelText('Source code editor') as HTMLTextAreaElement;
      expect(editor.getAttribute('data-language')).toBe(lang);
      expect(editor.value).toBe(STARTER_CODE[lang]);
    }
  });

  it('autosaves code drafts to localStorage with debounce and indicates save status', async () => {
    const testProblem = makeProblem();
    renderWorkspace(testProblem);

    await waitFor(() => {
      expect(screen.getByLabelText('Source code editor')).toBeTruthy();
    });

    const editor = screen.getByLabelText('Source code editor');
    const draftKey = `judge_code_draft_${testProblem.id}_javascript`;

    // Type new code
    fireEvent.change(editor, {
      target: { value: 'console.log("autosaved solution");' },
    });

    // Check saving status
    expect(screen.getByText('Saving...')).toBeTruthy();
    expect(localStorage.getItem(draftKey)).toBeNull();

    // Wait for debounce (750ms) to flush
    await waitFor(
      () => {
        expect(screen.getByText('Saved')).toBeTruthy();
      },
      { timeout: 2000 }
    );

    // Verify localStorage item has been set
    expect(localStorage.getItem(draftKey)).toBe('console.log("autosaved solution");');
  });

  it('recovers saved draft on language switch and restores starter code on confirmed reset', async () => {
    const testProblem = makeProblem();
    const draftKeyJs = `judge_code_draft_${testProblem.id}_javascript`;
    const customJs = '// Custom JS Draft';
    localStorage.setItem(draftKeyJs, customJs);

    renderWorkspace(testProblem);

    await waitFor(() => {
      expect(screen.getByLabelText('Source code editor')).toBeTruthy();
    });

    // Verify initial recovery from localStorage
    let editor = screen.getByLabelText('Source code editor') as HTMLTextAreaElement;
    expect(editor.value).toBe(customJs);

    // Switch to Python
    const langSelector = screen.getByRole('combobox', { name: /programming language/i });
    fireEvent.change(langSelector, { target: { value: 'python' } });
    editor = screen.getByLabelText('Source code editor') as HTMLTextAreaElement;
    expect(editor.value).toBe(STARTER_CODE.python);

    // Switch back to JavaScript -> should recover custom draft
    fireEvent.change(langSelector, { target: { value: 'javascript' } });
    editor = screen.getByLabelText('Source code editor') as HTMLTextAreaElement;
    expect(editor.value).toBe(customJs);

    // Trigger Reset Code -> open dialog
    fireEvent.click(screen.getByRole('button', { name: /reset code/i }));
    expect(screen.getByRole('alertdialog', { name: /confirm code reset/i })).toBeTruthy();

    // Confirm Reset
    fireEvent.click(screen.getByRole('button', { name: /confirm reset/i }));
    editor = screen.getByLabelText('Source code editor') as HTMLTextAreaElement;
    expect(editor.value).toBe(STARTER_CODE.javascript);
    expect(localStorage.getItem(draftKeyJs)).toBeNull();
  });

  it('allows collapsing and expanding Panel A with persistence and mini-rail', async () => {
    const testProblem = makeProblem();
    renderWorkspace(testProblem);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: testProblem.title })).toBeTruthy();
    });

    // Collapse Panel A
    const collapseBtn = screen.getByRole('button', {
      name: /collapse problem description panel/i,
    });
    fireEvent.click(collapseBtn);

    // Panel A should be collapsed
    expect(localStorage.getItem('judge_workspace_panel_a_collapsed')).toBe('true');
    expect(screen.queryByRole('heading', { name: testProblem.title })).toBeNull();

    // Mini-rail expand button should be visible
    const expandBtn = screen.getByRole('button', {
      name: /expand problem description panel/i,
    });
    expect(expandBtn).toBeTruthy();

    // Expand Panel A back
    fireEvent.click(expandBtn);
    expect(localStorage.getItem('judge_workspace_panel_a_collapsed')).toBe('false');
    expect(screen.getByRole('heading', { name: testProblem.title })).toBeTruthy();
  });

  it('supports keyboard navigation on horizontal and vertical panel splitters', async () => {
    renderWorkspace();

    await waitFor(() => {
      expect(screen.getByLabelText('Source code editor')).toBeTruthy();
    });

    const splitters = screen.getAllByRole('separator');
    expect(splitters.length).toBe(2);

    const horizontalSplitter = screen.getByLabelText('Resize problem description panel');
    const verticalSplitter = screen.getByLabelText('Resize editor and results panels');

    // Arrow keys on horizontal splitter
    fireEvent.keyDown(horizontalSplitter, { key: 'ArrowRight' });
    expect(Number(localStorage.getItem('judge_workspace_panel_a_width'))).toBeGreaterThan(42);

    fireEvent.keyDown(horizontalSplitter, { key: 'ArrowLeft' });
    expect(localStorage.getItem('judge_workspace_panel_a_width')).not.toBeNull();

    // Arrow keys on vertical splitter
    fireEvent.keyDown(verticalSplitter, { key: 'ArrowUp' });
    expect(Number(localStorage.getItem('judge_workspace_panel_b_height'))).toBeLessThan(58);

    fireEvent.keyDown(verticalSplitter, { key: 'ArrowDown' });
    expect(localStorage.getItem('judge_workspace_panel_b_height')).not.toBeNull();
  });

  it('switches tabs and displays execution and submission results properly', async () => {
    const testProblem = makeProblem();
    renderWorkspace(testProblem);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /custom input/i })).toBeTruthy();
    });

    // Custom Input tab
    fireEvent.click(screen.getByRole('button', { name: /custom input/i }));
    const stdinArea = screen.getByLabelText('Custom standard input') as HTMLTextAreaElement;
    expect(stdinArea).toBeTruthy();

    fireEvent.change(stdinArea, { target: { value: '42\n100' } });
    expect(screen.getByText('6 / 65536 characters')).toBeTruthy();

    // Clear input
    fireEvent.click(screen.getByRole('button', { name: /clear input/i }));
    expect(stdinArea.value).toBe('');

    // Mock Sample Run and click Run Sample -> switches to Output tab
    vi.spyOn(submissionsApi, 'runSampleCode').mockResolvedValueOnce({
      runId: 'sample-job-1',
      status: 'QUEUED' as any,
    });
    vi.spyOn(submissionsApi, 'fetchSampleRunResult').mockResolvedValueOnce({
      id: 'sample-job-1',
      status: 'COMPLETED',
      outcome: 'SUCCESS',
      stdout: 'Test Output 42\n',
      stderr: '',
      executionTimeMs: 45,
      memoryUsedKb: 12000,
    });

    fireEvent.click(screen.getByRole('button', { name: /run sample/i }));

    await waitFor(() => {
      expect(screen.getByText('Test Output 42')).toBeTruthy();
      expect(screen.getByText('Completed')).toBeTruthy();
      expect(screen.getByText('45 ms')).toBeTruthy();
    });

    // Mock Official Submit -> switches to Submissions tab
    vi.spyOn(submissionsApi, 'submitOfficialSolution').mockResolvedValueOnce({
      id: 'official-sub-1',
      status: SubmissionStatus.QUEUED,
    });
    vi.spyOn(submissionsApi, 'fetchSubmissionById').mockResolvedValueOnce({
      id: 'official-sub-1',
      problemId: testProblem.id,
      userId: 'user-1',
      code: 'code',
      language: 'javascript',
      status: SubmissionStatus.COMPLETED,
      verdict: Verdict.ACCEPTED,
      executionTimeMs: 80,
      memoryUsedKb: 14000,
      retryCount: 0,
      testCaseResults: [
        {
          testIndex: 0,
          verdict: Verdict.ACCEPTED,
          executionTimeMs: 30,
          memoryUsedKb: 12000,
          isHidden: false,
          sampleInput: '1 2',
          sampleExpectedOutput: '3',
          actualOutput: '3',
        },
        {
          testIndex: 1,
          verdict: Verdict.ACCEPTED,
          executionTimeMs: 50,
          memoryUsedKb: 14000,
          isHidden: true,
        },
      ],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    fireEvent.click(screen.getByRole('button', { name: /^submit$/i }));

    await waitFor(() => {
      expect(screen.getByText('Official Submission Verdict')).toBeTruthy();
    });

    // Switch to Submissions tab and verify test breakdown
    fireEvent.click(screen.getByRole('button', { name: /submissions/i }));
  });
});
