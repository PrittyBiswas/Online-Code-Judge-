import axios from 'axios';
import type { HealthStatusResponse } from '../types';

export const apiClient = axios.create({
  baseURL: '/',
  withCredentials: true,
  timeout: 5000,
});

type UnauthorizedCallback = () => void;
let unauthorizedHandler: UnauthorizedCallback | null = null;

export function registerUnauthorizedHandler(handler: UnauthorizedCallback | null): void {
  unauthorizedHandler = handler;
}

const AUTH_EXEMPT_PATHS = [
  '/api/auth/login',
  '/api/auth/register',
  '/api/auth/logout',
  '/api/auth/me',
];

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (axios.isAxiosError(error) && error.response?.status === 401) {
      const requestUrl = error.config?.url || '';
      const isAuthEndpoint = AUTH_EXEMPT_PATHS.some((path) => requestUrl.includes(path));
      // Only trigger global session-expired redirect for protected API calls, never auth endpoints or 403
      if (!isAuthEndpoint && unauthorizedHandler) {
        unauthorizedHandler();
      }
    }
    return Promise.reject(error);
  }
);

export function getApiErrorMessage(
  err: unknown,
  fallback = 'An unexpected error occurred.'
): string {
  if (axios.isAxiosError(err)) {
    const apiMsg = (err.response?.data as { error?: { message?: string } } | undefined)?.error
      ?.message;
    if (typeof apiMsg === 'string' && apiMsg.trim().length > 0) {
      return apiMsg;
    }
    if (!err.response) {
      return 'Unable to reach the server. Please check your connection and try again.';
    }
  }
  if (err instanceof Error && err.message) {
    return err.message;
  }
  return fallback;
}

export async function fetchApiHealth(): Promise<HealthStatusResponse> {
  const response = await apiClient.get<HealthStatusResponse>('/health/live');
  return response.data;
}
