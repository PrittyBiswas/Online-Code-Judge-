import { apiClient } from './apiClient';
import type { AuthUserDto } from '../types';

export interface LoginRequestPayload {
  usernameOrEmail: string;
  password: string;
}

export interface RegisterRequestPayload {
  username: string;
  email: string;
  password: string;
}

interface AuthResponseEnvelope {
  data: {
    user: AuthUserDto;
  };
}

export async function loginUser(payload: LoginRequestPayload): Promise<AuthUserDto> {
  const response = await apiClient.post<AuthResponseEnvelope>('/api/auth/login', payload);
  return response.data.data.user;
}

export async function registerUser(payload: RegisterRequestPayload): Promise<AuthUserDto> {
  // Never pass role from the client; the server always enforces Role.USER.
  const response = await apiClient.post<AuthResponseEnvelope>('/api/auth/register', {
    username: payload.username,
    email: payload.email,
    password: payload.password,
  });
  return response.data.data.user;
}

export async function logoutUser(): Promise<void> {
  await apiClient.post('/api/auth/logout');
}

export async function fetchCurrentUser(): Promise<AuthUserDto> {
  const response = await apiClient.get<AuthResponseEnvelope>('/api/auth/me');
  return response.data.data.user;
}

