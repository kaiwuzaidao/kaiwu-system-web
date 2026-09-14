import { apiRequest } from '@/services/auth';

export type Notification = {
  id: string;
  projectId?: string;
  projectCode?: string;
  notificationType: string;
  title: string;
  content?: string;
  linkUrl?: string;
  readAt?: string;
  createdAt: string;
};

export type NotificationPage = {
  current: number;
  size: number;
  total: number;
  records: Notification[];
};

export type NotificationSummary = {
  unreadCount: number;
  recent: Notification[];
};

export function queryNotifications(params: {
  current?: number;
  pageSize?: number;
  unreadOnly?: boolean;
  type?: string;
}) {
  const search = new URLSearchParams({
    current: String(params.current ?? 1),
    size: String(params.pageSize ?? 10),
  });
  if (params.unreadOnly) search.set('unreadOnly', 'true');
  if (params.type) search.set('type', params.type);
  return apiRequest<NotificationPage>(`/api/current/notifications?${search.toString()}`);
}

/** 顶栏铃铛：未读数 + 最近若干条未读。 */
export function queryNotificationSummary() {
  return apiRequest<NotificationSummary>('/api/current/notifications/summary');
}

export function markNotificationRead(id: string) {
  return apiRequest<void>(`/api/current/notifications/${id}/read`, {
    method: 'PUT',
  });
}

export function markAllNotificationsRead() {
  return apiRequest<number>('/api/current/notifications/read-all', {
    method: 'PUT',
  });
}
