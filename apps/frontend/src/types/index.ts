export type { HealthStatusResponse, RootApiInfo } from '@judge/shared';

export interface PlatformFeature {
  title: string;
  description: string;
  status: 'ready' | 'upcoming';
}
