// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AxiosError, AxiosHeaders } from 'axios';
import { AppRoutes } from '../src/App';
import { apiClient } from '../src/services/apiClient';
import * as authApi from '../src/services/authApi';

vi.mock('../src/hooks/useHealthCheck', () => ({
  useHealthCheck: () => ({
    status: 'online' as const,
    data: { status: 'ok', service: '@judge/api', uptime: 12, timestamp: '2026-11-12T00:00:00Z' },
  }),
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

function makeNetworkError(): AxiosError {
  const err = new AxiosError('Network Error', 'ERR_NETWORK');
  err.response = undefined;
  return err;
}

function renderApp(initialEntries: string[] = ['/'], customQueryClient?: QueryClient) {
  const queryClient =
    customQueryClient ??
    new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

  const view = render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={initialEntries}>
        <AppRoutes />
      </MemoryRouter>
    </QueryClientProvider>
  );

  return { ...view, queryClient };
}

describe('Day 11 — Frontend Auth API, Forms, State, Protected Routes & Logout', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  afterEach(() => {
    cleanup();
  });

  it('configures apiClient with withCredentials: true for HTTP-only cookies', () => {
    expect(apiClient.defaults.withCredentials).toBe(true);
    expect(apiClient.defaults.baseURL).toBe('/');
  });

  it('renders Login form with accessible inputs and validates required fields', async () => {
    vi.spyOn(authApi, 'fetchCurrentUser').mockRejectedValue(makeAxiosError(401));
    renderApp(['/login']);

    const idInput = await screen.findByLabelText(/email or username/i);
    const pwdInput = screen.getByLabelText(/^password$/i) as HTMLInputElement;
    expect(pwdInput.type).toBe('password');
    expect(screen.getByRole('link', { name: /create an account/i })).toBeTruthy();

    fireEvent.change(idInput, { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));

    expect(
      await screen.findByText(/please enter your email or username and password/i)
    ).toBeTruthy();
  });

  it('handles successful login and failed login cleanly without storing tokens in browser storage', async () => {
    vi.spyOn(authApi, 'fetchCurrentUser').mockRejectedValue(makeAxiosError(401));
    const loginSpy = vi
      .spyOn(authApi, 'loginUser')
      .mockRejectedValueOnce(makeAxiosError(401, 'Invalid email or password'))
      .mockResolvedValueOnce({
        id: 'u-1',
        username: 'alice_dev',
        email: 'alice@example.com',
        role: 'user',
      });

    renderApp(['/login']);

    const idInput = await screen.findByLabelText(/email or username/i);
    const pwdInput = screen.getByLabelText(/^password$/i);
    const submitBtn = screen.getByRole('button', { name: /sign in/i });

    // Failed login
    fireEvent.change(idInput, { target: { value: 'alice@example.com' } });
    fireEvent.change(pwdInput, { target: { value: 'WrongPass!' } });
    fireEvent.click(submitBtn);
    expect(await screen.findByText(/invalid email or password/i)).toBeTruthy();

    // Successful login redirects to /dashboard
    fireEvent.change(pwdInput, { target: { value: 'CorrectPass123!' } });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByText(/welcome, alice_dev/i)).toBeTruthy();
    });
    expect(loginSpy).toHaveBeenCalledTimes(2);
    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);
  });

  it('renders Registration form, validates required/email/password-match, and registers without sending role', async () => {
    vi.spyOn(authApi, 'fetchCurrentUser').mockRejectedValue(makeAxiosError(401));
    const registerSpy = vi.spyOn(authApi, 'registerUser').mockResolvedValue({
      id: 'u-2',
      username: 'bob_dev',
      email: 'bob@example.com',
      role: 'user',
    });

    renderApp(['/register']);

    const userInput = await screen.findByLabelText(/^username$/i);
    const emailInput = screen.getByLabelText(/^email$/i);
    const pwdInput = screen.getByLabelText(/^password$/i);
    const confirmInput = screen.getByLabelText(/confirm password/i);
    const submitBtn = screen.getByRole('button', { name: /create account/i });

    // Required validation
    fireEvent.click(submitBtn);
    expect(await screen.findByText(/all fields are required/i)).toBeTruthy();

    // Password mismatch validation
    fireEvent.change(userInput, { target: { value: 'bob_dev' } });
    fireEvent.change(emailInput, { target: { value: 'bob@example.com' } });
    fireEvent.change(pwdInput, { target: { value: 'Password123!' } });
    fireEvent.change(confirmInput, { target: { value: 'Mismatch123!' } });
    fireEvent.click(submitBtn);
    expect(await screen.findByText(/passwords do not match/i)).toBeTruthy();

    // Invalid email validation
    fireEvent.change(emailInput, { target: { value: 'invalid-email' } });
    fireEvent.change(confirmInput, { target: { value: 'Password123!' } });
    fireEvent.click(submitBtn);
    expect(await screen.findByText(/invalid email address/i)).toBeTruthy();

    // Valid submission
    fireEvent.change(emailInput, { target: { value: 'bob@example.com' } });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByText(/welcome, bob_dev/i)).toBeTruthy();
    });
    expect(registerSpy).toHaveBeenCalledWith({
      username: 'bob_dev',
      email: 'bob@example.com',
      password: 'Password123!',
    });
    expect((registerSpy.mock.calls[0][0] as any).role).toBeUndefined();
  });

  it('bootstraps auth via /api/auth/me: allows authenticated user, redirects 401, and shows retry on network error', async () => {
    // 1. Authenticated user accesses /dashboard
    vi.spyOn(authApi, 'fetchCurrentUser').mockResolvedValueOnce({
      id: 'u-3',
      username: 'charlie',
      email: 'charlie@example.com',
      role: 'user',
    });
    renderApp(['/dashboard']);
    expect(await screen.findByText(/welcome, charlie/i)).toBeTruthy();
    cleanup();

    // 2. 401 during bootstrap redirects /dashboard to /login
    vi.spyOn(authApi, 'fetchCurrentUser').mockRejectedValueOnce(makeAxiosError(401));
    renderApp(['/dashboard']);
    expect(await screen.findByRole('heading', { name: /sign in to your account/i })).toBeTruthy();
    cleanup();

    // 3. Temporary network failure does NOT treat user as logged out; offers Retry
    vi.spyOn(authApi, 'fetchCurrentUser')
      .mockRejectedValueOnce(makeNetworkError())
      .mockResolvedValueOnce({
        id: 'u-3',
        username: 'charlie',
        email: 'charlie@example.com',
        role: 'user',
      });
    renderApp(['/dashboard']);
    expect(await screen.findByText(/connection check failed/i)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /retry session check/i }));
    expect(await screen.findByText(/welcome, charlie/i)).toBeTruthy();
  });

  it('logs out cleanly: calls POST /api/auth/logout, clears user state and user cache while keeping public problems cache', async () => {
    vi.spyOn(authApi, 'fetchCurrentUser').mockResolvedValue({
      id: 'u-4',
      username: 'dana',
      email: 'dana@example.com',
      role: 'user',
    });
    const logoutSpy = vi.spyOn(authApi, 'logoutUser').mockResolvedValue();

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    queryClient.setQueryData(['submissions', 'mine'], [{ id: 'sub-1' }]);
    queryClient.setQueryData(['user', 'profile'], { id: 'u-4' });
    queryClient.setQueryData(['problems', 'list'], [{ id: 'prob-1' }]);

    renderApp(['/dashboard'], queryClient);
    expect(await screen.findByText(/welcome, dana/i)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /sign out/i }));

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /sign in to your account/i })).toBeTruthy();
    });
    expect(logoutSpy).toHaveBeenCalledTimes(1);
    expect(queryClient.getQueryData(['submissions', 'mine'])).toBeUndefined();
    expect(queryClient.getQueryData(['user', 'profile'])).toBeUndefined();
    expect(queryClient.getQueryData(['problems', 'list'])).toEqual([{ id: 'prob-1' }]);
  });
});
