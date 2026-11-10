import axios from 'axios';
import type { HealthStatusResponse } from '../types';

export const apiClient = axios.create({
  baseURL: '/',
  withCredentials: true,
  timeout: 5000,
});

export async function fetchApiHealth(): Promise<HealthStatusResponse> {
  const response = await apiClient.get<HealthStatusResponse>('/health/live');
  return response.data;
}
