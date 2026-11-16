import { apiClient } from './apiClient';
import type { Notification, NotificationActivityItem, ApiResponse } from '@judge/shared';

export interface NotificationsListResponse {
  notifications: Notification[];
  total: number;
  unreadCount: number;
}

export const notificationsApi = {
  /**
   * Retrieves paginated notifications for the authenticated user.
   */
  async getNotifications(params?: {
    limit?: number;
    offset?: number;
    unreadOnly?: boolean;
  }): Promise<NotificationsListResponse> {
    const response = await apiClient.get<ApiResponse<NotificationsListResponse>>(
      '/api/notifications',
      {
        params: {
          limit: params?.limit,
          offset: params?.offset,
          unreadOnly: params?.unreadOnly ? 'true' : undefined,
        },
      }
    );
    return response.data.data || { notifications: [], total: 0, unreadCount: 0 };
  },

  /**
   * Retrieves the unread notification count.
   */
  async getUnreadCount(): Promise<number> {
    const response = await apiClient.get<ApiResponse<{ unreadCount: number }>>(
      '/api/notifications/unread-count'
    );
    return response.data.data?.unreadCount ?? 0;
  },

  /**
   * Marks a specific notification as read.
   */
  async markAsRead(notificationId: string): Promise<Notification> {
    const response = await apiClient.patch<ApiResponse<Notification>>(
      `/api/notifications/${notificationId}/read`
    );
    return response.data.data!;
  },

  /**
   * Marks all notifications as read.
   */
  async markAllAsRead(): Promise<{ success: boolean; updatedCount: number }> {
    const response = await apiClient.patch<ApiResponse<{ success: boolean; updatedCount: number }>>(
      '/api/notifications/read-all'
    );
    return response.data.data || { success: true, updatedCount: 0 };
  },

  /**
   * Retrieves recent contest-related activity for the user.
   */
  async getActivity(params?: {
    limit?: number;
    offset?: number;
  }): Promise<NotificationActivityItem[]> {
    const response = await apiClient.get<ApiResponse<{ activity: NotificationActivityItem[] }>>(
      '/api/notifications/activity',
      {
        params: {
          limit: params?.limit,
          offset: params?.offset,
        },
      }
    );
    return response.data.data?.activity || [];
  },

  /**
   * Connects to the real-time notification SSE stream.
   */
  connectNotificationsLive(callbacks: {
    onNotification: (notification: Notification) => void;
    onUnreadCount?: (unreadCount: number) => void;
    onError?: (err: any) => void;
  }): () => void {
    if (typeof EventSource === 'undefined') {
      return () => {};
    }

    const eventSource = new EventSource('/api/notifications/live', {
      withCredentials: true,
    });

    if (typeof eventSource.addEventListener !== 'function') {
      return () => {
        if (typeof eventSource.close === 'function') {
          eventSource.close();
        }
      };
    }

    eventSource.addEventListener('notification', (e) => {
      try {
        const parsed = JSON.parse(e.data) as Notification;
        callbacks.onNotification(parsed);
      } catch (err) {
        console.warn('Failed parsing SSE notification event:', err);
      }
    });

    eventSource.addEventListener('unread_count', (e) => {
      try {
        const parsed = JSON.parse(e.data) as { unreadCount: number };
        if (typeof parsed.unreadCount === 'number' && callbacks.onUnreadCount) {
          callbacks.onUnreadCount(parsed.unreadCount);
        }
      } catch (err) {
        console.warn('Failed parsing SSE unread_count event:', err);
      }
    });

    eventSource.onerror = (e) => {
      if (callbacks.onError) {
        callbacks.onError(e);
      }
    };

    return () => {
      eventSource.close();
    };
  },
};
