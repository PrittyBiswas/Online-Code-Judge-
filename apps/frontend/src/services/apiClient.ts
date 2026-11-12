import axios, { type AxiosRequestConfig } from 'axios';
import type { HealthStatusResponse } from '../types';

export const apiClient = axios.create({
  baseURL: '/',
  withCredentials: true,
  timeout: 5000,
});

type UnauthorizedCallback = () => void;
let unauthorizedHandler: UnauthorizedCallback | null = null;
let unauthorizedNotified = false;

export function registerUnauthorizedHandler(handler: UnauthorizedCallback | null): void {
  unauthorizedHandler = handler;
  unauthorizedNotified = false;
}

export function resetUnauthorizedNotification(): void {
  unauthorizedNotified = false;
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
      // Only trigger global session-expired redirect once per session expiry for protected calls.
      // Never treat 403 Forbidden or network errors as 401.
      if (!isAuthEndpoint && unauthorizedHandler && !unauthorizedNotified) {
        unauthorizedNotified = true;
        unauthorizedHandler();
      }
    }
    return Promise.reject(error);
  }
);

export type ApiErrorCategory =
  | 'validation'
  | 'unauthorized'
  | 'forbidden'
  | 'not_found'
  | 'rate_limit'
  | 'server'
  | 'timeout'
  | 'cancelled'
  | 'network'
  | 'unknown';

export interface ClassifiedApiError {
  category: ApiErrorCategory;
  status?: number;
  message: string;
}

export function classifyApiError(
  err: unknown,
  fallback = 'An unexpected error occurred.'
): ClassifiedApiError {
  if (axios.isCancel(err) || (axios.isAxiosError(err) && err.code === 'ERR_CANCELED')) {
    return { category: 'cancelled', message: 'Request was cancelled.' };
  }

  if (axios.isAxiosError(err)) {
    const status = err.response?.status;
    const apiMsg = (err.response?.data as { error?: { message?: string } } | undefined)?.error
      ?.message;
    const safeMsg =
      typeof apiMsg === 'string' && apiMsg.trim().length > 0 ? apiMsg.trim() : undefined;

    if (err.code === 'ECONNABORTED') {
      return {
        category: 'timeout',
        status,
        message: safeMsg || 'The request timed out. Please try again.',
      };
    }

    if (!err.response) {
      return {
        category: 'network',
        message: 'Unable to reach the server. Please check your connection and try again.',
      };
    }

    if (status === 400) {
      return {
        category: 'validation',
        status,
        message: safeMsg || 'Please check your input and try again.',
      };
    }
    if (status === 401) {
      return {
        category: 'unauthorized',
        status,
        message: safeMsg || 'Your session has expired. Please sign in again.',
      };
    }
    if (status === 403) {
      return {
        category: 'forbidden',
        status,
        message: safeMsg || 'You do not have permission to perform this action.',
      };
    }
    if (status === 404) {
      return {
        category: 'not_found',
        status,
        message: safeMsg || 'The requested resource was not found.',
      };
    }
    if (status === 429) {
      return {
        category: 'rate_limit',
        status,
        message: safeMsg || 'Too many requests. Please wait a moment and try again.',
      };
    }
    if (status && status >= 500) {
      return {
        category: 'server',
        status,
        message: safeMsg || 'A server error occurred. Please try again shortly.',
      };
    }
    if (safeMsg) {
      return { category: 'unknown', status, message: safeMsg };
    }
  }

  if (err instanceof Error && err.message) {
    return { category: 'unknown', message: err.message };
  }

  return { category: 'unknown', message: fallback };
}

export function getApiErrorMessage(
  err: unknown,
  fallback = 'An unexpected error occurred.'
): string {
  return classifyApiError(err, fallback).message;
}

/**
 * Retries only safe, idempotent GET requests on transient network, timeout, or 5xx errors.
 * Respects AbortSignal cancellation and never retries 4xx client errors.
 */
export async function getWithRetry<T>(
  url: string,
  config?: AxiosRequestConfig,
  maxRetries = 1
): Promise<T> {
  let attempt = 0;
  for (;;) {
    try {
      const response = await apiClient.get<T>(url, config);
      return response.data;
    } catch (err) {
      const classified = classifyApiError(err);
      const isCancelled = config?.signal?.aborted || classified.category === 'cancelled';
      const isRetryable =
        classified.category === 'network' ||
        classified.category === 'timeout' ||
        classified.category === 'server';

      if (isCancelled || !isRetryable || attempt >= maxRetries) {
        throw err;
      }
      attempt += 1;
    }
  }
}

export async function fetchApiHealth(): Promise<HealthStatusResponse> {
  const response = await apiClient.get<HealthStatusResponse>('/health/live');
  return response.data;
}
