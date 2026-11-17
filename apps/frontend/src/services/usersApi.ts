import { apiClient } from './apiClient';
import type { UserProfile, UpdateUserProfileInput } from '@judge/shared';

interface ProfileEnvelope {
  data: {
    profile: UserProfile;
    message?: string;
  };
}

interface AvatarEnvelope {
  data: {
    avatarUrl: string;
    message: string;
  };
}

interface MessageEnvelope {
  data: {
    message: string;
  };
}

export async function fetchMyProfile(): Promise<UserProfile> {
  const response = await apiClient.get<ProfileEnvelope>('/api/users/me');
  return response.data.data.profile;
}

export async function updateMyProfile(
  payload: UpdateUserProfileInput
): Promise<{ profile: UserProfile; message: string }> {
  const response = await apiClient.put<ProfileEnvelope>('/api/users/me', payload);
  return {
    profile: response.data.data.profile,
    message: response.data.data.message || 'Profile updated successfully',
  };
}

export async function uploadAvatar(
  dataUrl: string
): Promise<{ avatarUrl: string; message: string }> {
  const response = await apiClient.post<AvatarEnvelope>('/api/users/me/avatar', { dataUrl });
  return response.data.data;
}

export async function deleteAvatar(): Promise<{ message: string }> {
  const response = await apiClient.delete<MessageEnvelope>('/api/users/me/avatar');
  return response.data.data;
}
