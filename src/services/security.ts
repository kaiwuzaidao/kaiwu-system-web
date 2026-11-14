import { apiRequest } from '@/services/auth';

export type PageData<T> = {
  current: number;
  size: number;
  total: number;
  records: T[];
};

export type FieldChange = {
  field: string;
  before: string | null;
  after: string | null;
};

export type OperationLog = {
  id: string;
  userId?: string;
  username?: string;
  module: string;
  operation: string;
  requestMethod: string;
  requestPath: string;
  responseStatus: number;
  detail?: string;
  targetType?: string;
  targetId?: string;
  changeJson?: string;
  clientIp?: string;
  traceId?: string;
  createdAt: string;
};

export function parseFieldChanges(changeJson?: string): FieldChange[] {
  if (!changeJson) return [];
  try {
    const parsed = JSON.parse(changeJson);
    return Array.isArray(parsed) ? (parsed as FieldChange[]) : [];
  } catch {
    return [];
  }
}

export type LoginLog = {
  id: string;
  userId?: string;
  username?: string;
  status: string;
  message?: string;
  clientIp?: string;
  traceId?: string;
  createdAt: string;
};

export type OnlineSession = {
  sessionId: string;
  userId: string;
  username: string;
  status: string;
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string;
  revokedAt?: string;
  /** 会话来源：WEB 网页登录 / CLI 设备授权（ADR 0035），只用于展示。 */
  sessionSource?: string;
  /** CLI 声明的客户端名称；网页登录为空。 */
  clientName?: string;
};

function pageQuery(params: Record<string, unknown>) {
  const search = new URLSearchParams({
    current: String(params.current ?? 1),
    size: String(params.pageSize ?? 10),
  });
  Object.entries(params).forEach(([key, value]) => {
    if (!['current', 'pageSize'].includes(key) && value !== undefined && value !== '') {
      search.set(key, String(value));
    }
  });
  return search.toString();
}

export function queryOperationLogs(params: Record<string, unknown>) {
  return apiRequest<PageData<OperationLog>>(`/api/logs/operations?${pageQuery(params)}`);
}

export function queryLoginLogs(params: Record<string, unknown>) {
  return apiRequest<PageData<LoginLog>>(`/api/logs/logins?${pageQuery(params)}`);
}

export function queryOnlineSessions(params: Record<string, unknown>) {
  return apiRequest<PageData<OnlineSession>>(`/api/logs/sessions?${pageQuery(params)}`);
}

export function forceOffline(sessionId: string, reason: string) {
  const search = new URLSearchParams();
  if (reason.trim()) search.set('reason', reason.trim());
  return apiRequest<void>(
    `/api/logs/sessions/${encodeURIComponent(sessionId)}/force-offline?${search.toString()}`,
    { method: 'POST' },
  );
}
