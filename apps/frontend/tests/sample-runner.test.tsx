// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AxiosError, AxiosHeaders } from 'axios';
import { ProblemDifficulty } from '@judge/shared';
import { AppRoutes } from '../src/App';
import { apiClient, getWithRetry, registerUnauthorizedHandler } from '../src/services/apiClient';
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

function makeProblem(): Problem {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    title: 'Echo Sample',
    slug: 'echo-sample-111111',
    statement: 'Print the input.',
    difficulty: ProblemDifficulty.EASY,
    tags: ['io'],
    timeLimitMs: 1000,
    memoryLimitMb: 128,
    sampleInput: 'hello',
    sampleExpectedOutput: 'hello',
    setterId: '99999999-9999-4999-8999-999999999999',
    isArchived: false,
    createdAt: '2026-11-12T00:00:00.000Z',
    updatedAt: '2026-11-12T00:00:00.000Z',
  };
}

function makeAxiosError(
  status: number,
  message?: string,
  url = '/api/submissions/run-sample'
): AxiosError {
  const headers = new AxiosHeaders();
  const err = new AxiosError(message || `Request failed with status ${status}`, 'ERR_BAD_REQUEST');
  err.config = { headers, url };
  err.response = {
    status,
    statusText: 'Error',
    headers,
    config: { headers, url },
    data: message ? { error: { message } } : {},
  };
  return err;
}

function renderDetail() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/problems/echo-sample-111111']}>
        <AppRoutes />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('Day 14 — API Client Reliability, Code Editor & Run Sample UI', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    registerUnauthorizedHandler(null);
    vi.spyOn(authApi, 'fetchCurrentUser').mockResolvedValue({
      id: 'user-1',
      username: 'alice',
      email: 'alice@example.com',
      role: 'user',
    });
    vi.spyOn(problemsApi, 'fetchProblemById').mockResolvedValue(makeProblem());
  });

  afterEach(() => {
    cleanup();
    registerUnauthorizedHandler(null);
  });

  it('preserves withCredentials, deduplicates 401 session expiration, ignores 403, and respects AbortSignal on GET retry', async () => {
    expect(apiClient.defaults.withCredentials).toBe(true);

    const onUnauth = vi.fn();
    registerUnauthorizedHandler(onUnauth);

    const responseHandlers = (
      apiClient.interceptors.response as unknown as {
        handlers: Array<{ rejected: (err: unknown) => Promise<never> }>;
      }
    ).handlers;
    const rejectInterceptor = responseHandlers[0].rejected;

    // 403 must never trigger 401 handler
    await expect(rejectInterceptor(makeAxiosError(403, 'Forbidden'))).rejects.toThrow();
    expect(onUnauth).not.toHaveBeenCalled();

    // Simultaneous 401s trigger unauthorizedHandler only once (no repeated redirect storm)
    await expect(rejectInterceptor(makeAxiosError(401, 'Expired 1'))).rejects.toThrow();
    await expect(rejectInterceptor(makeAxiosError(401, 'Expired 2'))).rejects.toThrow();
    expect(onUnauth).toHaveBeenCalledTimes(1);

    // getWithRetry retries transient 503 once, does not retry 400, and aborts cleanly
    const getSpy = vi
      .spyOn(apiClient, 'get')
      .mockRejectedValueOnce(makeAxiosError(503, 'Unavailable', '/api/problems'))
      .mockResolvedValueOnce({ data: { ok: true } });

    const recovered = await getWithRetry<{ ok: boolean }>('/api/problems');
    expect(recovered).toEqual({ ok: true });
    expect(getSpy).toHaveBeenCalledTimes(2);

    getSpy.mockClear();
    const controller = new AbortController();
    controller.abort();
    const cancelErr = new AxiosError('Aborted', 'ERR_CANCELED');
    getSpy.mockRejectedValueOnce(cancelErr);
    await expect(getWithRetry('/api/problems', { signal: controller.signal })).rejects.toThrow();
    expect(getSpy).toHaveBeenCalledTimes(1);
  });

  it('renders editor, preserves code across language switches, and confirms before resetting dirty code', async () => {
    renderDetail();

    const editor = (await screen.findByLabelText('Source code editor')) as HTMLTextAreaElement;
    expect(editor.dataset.language).toBe('javascript');

    fireEvent.change(editor, { target: { value: 'console.log("custom js");' } });

    const langSelect = screen.getByLabelText('Programming language') as HTMLSelectElement;
    fireEvent.change(langSelect, { target: { value: 'python' } });
    expect(
      (screen.getByLabelText('Source code editor') as HTMLTextAreaElement).dataset.language
    ).toBe('python');

    fireEvent.change(screen.getByLabelText('Source code editor'), {
      target: { value: 'print("custom py")' },
    });

    // Switching back to JavaScript preserves the JS draft
    fireEvent.change(langSelect, { target: { value: 'javascript' } });
    expect((screen.getByLabelText('Source code editor') as HTMLTextAreaElement).value).toBe(
      'console.log("custom js");'
    );

    // Clicking Reset Code on dirty code asks for confirmation first
    fireEvent.click(screen.getByRole('button', { name: /reset code/i }));
    expect(screen.getByRole('alertdialog')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /confirm reset/i }));
    expect((screen.getByLabelText('Source code editor') as HTMLTextAreaElement).value).toContain(
      'fs.readFileSync'
    );
  });

  it('submits Run Sample, prevents duplicate clicks while pending, and renders stdout/stderr as safe text', async () => {
    let resolveEnqueue!: (val: { runId: string; status: 'QUEUED' }) => void;
    const enqueueSpy = vi.spyOn(submissionsApi, 'runSampleCode').mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveEnqueue = resolve;
        })
    );

    const pollSpy = vi
      .spyOn(submissionsApi, 'fetchSampleRunResult')
      .mockResolvedValueOnce({
        runId: 'run-1',
        problemId: '11111111-1111-4111-8111-111111111111',
        language: 'javascript',
        status: 'RUNNING',
        createdAt: '2026-11-12T00:00:00.000Z',
        updatedAt: '2026-11-12T00:00:01.000Z',
      })
      .mockResolvedValueOnce({
        runId: 'run-1',
        problemId: '11111111-1111-4111-8111-111111111111',
        language: 'javascript',
        status: 'COMPLETED',
        outcome: 'SUCCESS',
        stdout: '<b>hello</b>',
        stderr: '',
        executionTimeMs: 42,
        memoryUsedKb: 12000,
        createdAt: '2026-11-12T00:00:00.000Z',
        updatedAt: '2026-11-12T00:00:02.000Z',
      });

    const view = renderDetail();
    await screen.findByLabelText('Source code editor');

    const runBtn = screen.getByRole('button', { name: /run sample/i }) as HTMLButtonElement;
    fireEvent.click(runBtn);
    fireEvent.click(runBtn); // Duplicate click while pending

    expect(enqueueSpy).toHaveBeenCalledTimes(1);
    expect(runBtn.disabled).toBe(true);

    resolveEnqueue({ runId: 'run-1', status: 'QUEUED' });

    await waitFor(
      () => {
        expect(screen.getByText('Completed')).toBeTruthy();
        expect(screen.getByText('<b>hello</b>')).toBeTruthy();
      },
      { timeout: 3000 }
    );

    expect(pollSpy).toHaveBeenCalledTimes(2);
    expect(view.container.querySelector('b')).toBeNull();
    expect(screen.getByText('42 ms')).toBeTruthy();
  });

  it('displays Time Limit Exceeded and Runtime Error states cleanly', async () => {
    vi.spyOn(submissionsApi, 'runSampleCode')
      .mockResolvedValueOnce({ runId: 'run-tle', status: 'QUEUED' })
      .mockResolvedValueOnce({ runId: 'run-re', status: 'QUEUED' });

    vi.spyOn(submissionsApi, 'fetchSampleRunResult')
      .mockResolvedValueOnce({
        runId: 'run-tle',
        problemId: '11111111-1111-4111-8111-111111111111',
        language: 'javascript',
        status: 'COMPLETED',
        outcome: 'TIME_LIMIT_EXCEEDED',
        stdout: '',
        stderr: 'Execution exceeded 1000ms limit',
        executionTimeMs: 1005,
        createdAt: '2026-11-12T00:00:00.000Z',
        updatedAt: '2026-11-12T00:00:01.000Z',
      })
      .mockResolvedValueOnce({
        runId: 'run-re',
        problemId: '11111111-1111-4111-8111-111111111111',
        language: 'javascript',
        status: 'COMPLETED',
        outcome: 'RUNTIME_ERROR',
        stdout: '',
        stderr: 'ReferenceError: x is not defined',
        executionTimeMs: 25,
        createdAt: '2026-11-12T00:00:00.000Z',
        updatedAt: '2026-11-12T00:00:02.000Z',
      });

    renderDetail();
    await screen.findByLabelText('Source code editor');

    fireEvent.click(screen.getByRole('button', { name: /run sample/i }));
    await waitFor(() => expect(screen.getByText('Time Limit Exceeded')).toBeTruthy(), {
      timeout: 2500,
    });

    fireEvent.click(screen.getByRole('button', { name: /run sample/i }));
    await waitFor(
      () => {
        expect(screen.getByText('Runtime Error')).toBeTruthy();
        expect(screen.getByText(/ReferenceError: x is not defined/)).toBeTruthy();
      },
      { timeout: 2500 }
    );
  });
});
