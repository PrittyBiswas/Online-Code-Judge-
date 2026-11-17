import { getWithRetry } from './apiClient';
import type { UserAnalytics } from '../types';

export interface AnalyticsEnvelope {
  data: UserAnalytics;
}

export async function fetchUserAnalytics(signal?: AbortSignal): Promise<UserAnalytics> {
  const envelope = await getWithRetry<AnalyticsEnvelope>('/api/analytics/me', { signal }, 1);
  return envelope.data;
}
