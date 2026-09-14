import { apiRequest, downloadApiFile } from '@/services/auth';
import { currentLocale } from '@/utils/locale';

export type PlatformUser = {
  id: string;
  username: string;
  displayName: string;
  email?: string;
  status: string;
  createdAt: string;
  updatedAt: string;
};

export type UserPage = {
  current: number;
  size: number;
  total: number;
  records: PlatformUser[];
};

export type UserCreateInput = {
  username: string;
  displayName: string;
  email?: string;
  password: string;
};

export type UserUpdateInput = {
  displayName: string;
  email?: string;
};

export function queryUsers(params: { current?: number; pageSize?: number; keyword?: string }) {
  const search = new URLSearchParams({
    current: String(params.current ?? 1),
    size: String(params.pageSize ?? 10),
  });
  if (params.keyword) {
    search.set('keyword', params.keyword);
  }
  return apiRequest<UserPage>(`/api/users?${search.toString()}`);
}

export function createUser(input: UserCreateInput) {
  return apiRequest<PlatformUser>('/api/users', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
}

export function updateUser(id: string, input: UserUpdateInput) {
  return apiRequest<PlatformUser>(`/api/users/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
}

export function updateUserStatus(id: string, status: 'ENABLED' | 'DISABLED') {
  return apiRequest<PlatformUser>(`/api/users/${id}/status`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status }),
  });
}

export function resetUserPassword(id: string, newPassword: string) {
  return apiRequest<void>(`/api/users/${id}/reset-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ newPassword }),
  });
}

export type UserImportResult = {
  total: number;
  succeeded: number;
  failed: number;
  errors: Array<{
    rowNumber: number;
    username: string;
    message: string;
    messageKey?: string;
    messageArgs?: Record<string, unknown>;
  }>;
};

export function downloadUserImportTemplate() {
  return downloadApiFile(
    '/api/users/import-template',
    currentLocale() === 'en-US' ? 'user-import-template.xlsx' : '用户导入模板.xlsx',
  );
}

/**
 * 导出当前筛选结果。后端对导出行数有上限，超限会返回 400，
 * 调用方需捕获并提示用户先缩小筛选范围。
 */
export function exportUsers(keyword?: string) {
  const search = new URLSearchParams();
  if (keyword?.trim()) {
    search.set('keyword', keyword.trim());
  }
  const query = search.toString();
  return downloadApiFile(
    `/api/users/export${query ? `?${query}` : ''}`,
    currentLocale() === 'en-US' ? 'platform-users.xlsx' : '平台用户.xlsx',
  );
}

export function importUsers(file: File) {
  const form = new FormData();
  form.append('file', file);
  return apiRequest<UserImportResult>('/api/users/import', {
    method: 'POST',
    body: form,
  });
}

export function batchUpdateUserStatus(userIds: string[], status: 'ENABLED' | 'DISABLED') {
  return apiRequest<void>('/api/users/batch-status', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userIds, status }),
  });
}
