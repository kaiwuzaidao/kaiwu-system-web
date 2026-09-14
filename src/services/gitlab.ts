import { apiRequest } from '@/services/auth';

export type GitlabConfig = {
  baseUrl: string;
  defaultGroupId?: string;
  tokenConfigured: boolean;
  enabled: boolean;
  lastTestStatus?: string;
  lastTestMessage?: string;
  lastTestAt?: string;
};

export type GitlabConfigSaveInput = {
  baseUrl: string;
  defaultGroupId?: string;
  token?: string;
  clearToken?: boolean;
  enabled: boolean;
};

export type GitlabConnectionTest = {
  success: boolean;
  message: string;
  testedAt: string;
};

export function queryGitlabConfig() {
  return apiRequest<GitlabConfig>('/api/gitlab/config');
}

export function saveGitlabConfig(input: GitlabConfigSaveInput) {
  return apiRequest<GitlabConfig>('/api/gitlab/config', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
}

export function testGitlabConfig() {
  return apiRequest<GitlabConnectionTest>('/api/gitlab/config/test', {
    method: 'POST',
  });
}
