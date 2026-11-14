import { apiRequest } from '@/services/auth';

/** 存储账号；Secret 只以 secretConfigured 表达，AccessKey ID 已掩码（ADR 0039）。 */
export type StorageAccount = {
  id: string;
  accountCode: string;
  accountName: string;
  providerType: string;
  endpoint: string;
  region: string;
  bucket: string;
  pathStyle: boolean;
  stsEndpoint: string;
  roleArn?: string;
  accessKeyIdMasked: string;
  secretConfigured: boolean;
  credentialTtlSeconds: number;
  enabled: boolean;
  bindingCount: number;
  lastTestStatus?: string;
  lastTestMessage?: string;
  lastTestAt?: string;
};

export type StorageAccountInput = {
  accountCode: string;
  accountName: string;
  providerType: string;
  endpoint: string;
  region: string;
  bucket: string;
  pathStyle: boolean;
  stsEndpoint: string;
  roleArn?: string;
  /** 编辑时留空表示沿用原 AccessKey ID。 */
  accessKeyId?: string;
  /** 编辑时留空表示沿用原 Secret。 */
  accessKeySecret?: string;
  credentialTtlSeconds: number;
  enabled: boolean;
};

export type StorageConnectionTest = {
  success: boolean;
  latencyMs: number;
  message: string;
  testedAt: string;
};

/** 项目存储绑定；id 即业务记录中的 storage_ref。 */
export type ProjectStorageBinding = {
  id: string;
  projectId: string;
  projectCode: string;
  projectName: string;
  storageName: string;
  accountId: string;
  accountName: string;
  bucket: string;
  status: string;
  maxObjectBytes: number;
  allowedContentTypes: string[];
  createdAt: string;
};

export type ProjectStorageBindInput = {
  projectId: string;
  storageName: string;
  accountId: string;
  maxObjectBytes: number;
  allowedContentTypes: string[];
};

const JSON_HEADERS = { 'Content-Type': 'application/json' };

export function queryStorageAccounts() {
  return apiRequest<StorageAccount[]>('/api/storage/accounts');
}

export function createStorageAccount(input: StorageAccountInput) {
  return apiRequest<StorageAccount>('/api/storage/accounts', {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify(input),
  });
}

export function updateStorageAccount(id: string, input: StorageAccountInput) {
  return apiRequest<StorageAccount>(`/api/storage/accounts/${id}`, {
    method: 'PUT',
    headers: JSON_HEADERS,
    body: JSON.stringify(input),
  });
}

export function testStorageAccount(id: string) {
  return apiRequest<StorageConnectionTest>(`/api/storage/accounts/${id}/test`, { method: 'POST' });
}

export function queryStorageBindings(projectId?: string) {
  const search = projectId ? `?projectId=${encodeURIComponent(projectId)}` : '';
  return apiRequest<ProjectStorageBinding[]>(`/api/storage/bindings${search}`);
}

export function bindProjectStorage(input: ProjectStorageBindInput) {
  return apiRequest<ProjectStorageBinding>('/api/storage/bindings', {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify(input),
  });
}

export function changeStorageBindingStatus(id: string, status: string) {
  return apiRequest<ProjectStorageBinding>(`/api/storage/bindings/${id}/status`, {
    method: 'PUT',
    headers: JSON_HEADERS,
    body: JSON.stringify({ status }),
  });
}
