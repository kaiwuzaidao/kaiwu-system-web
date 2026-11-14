import { apiRequest } from '@/services/auth';

/** 确认页展示的待确认 CLI 授权请求（ADR 0035）。只含用户核对所需信息，不含设备码。 */
export type DeviceAuthorizationPending = {
  userCode: string;
  clientName: string;
  requestIp?: string;
  createdAt: string;
  expiresAt: string;
};

/** 按短码查看待确认请求；不存在或已过期时后端返回 404。 */
export function queryDeviceAuthorization(userCode: string) {
  return apiRequest<DeviceAuthorizationPending>(`/api/auth/device/${encodeURIComponent(userCode)}`);
}

/** 以当前登录用户身份允许该请求；会话在 CLI 兑换时才签发。 */
export function approveDeviceAuthorization(userCode: string) {
  return apiRequest<void>(`/api/auth/device/${encodeURIComponent(userCode)}/approve`, {
    method: 'POST',
  });
}

/** 拒绝该请求。 */
export function denyDeviceAuthorization(userCode: string) {
  return apiRequest<void>(`/api/auth/device/${encodeURIComponent(userCode)}/deny`, {
    method: 'POST',
  });
}
