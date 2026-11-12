export type { HealthStatusResponse, RootApiInfo, Role } from '@judge/shared';

export interface AuthUserDto {
  id: string;
  username: string;
  email: string;
  role: string;
}

export interface PlatformFeature {
  title: string;
  description: string;
  status: 'ready' | 'upcoming';
}
