import { apiRequest } from '@/services/auth';

export type AiProviderConfig = {
  providerName: string;
  baseUrl: string;
  apiKeyConfigured: boolean;
  model: string;
  temperature: number;
  timeoutSeconds: number;
  enabled: boolean;
  lastTestStatus?: string;
  lastTestMessage?: string;
  lastTestAt?: string;
};

export type AiProviderSaveInput = {
  providerName: string;
  baseUrl: string;
  apiKey?: string;
  clearApiKey?: boolean;
  model: string;
  temperature: number;
  timeoutSeconds: number;
  enabled: boolean;
};

export type AiConnectionTest = {
  success: boolean;
  model?: string;
  latencyMs: number;
  message: string;
  testedAt: string;
};

export function queryAiProvider() {
  return apiRequest<AiProviderConfig>('/api/ai/provider');
}

export function saveAiProvider(input: AiProviderSaveInput) {
  return apiRequest<AiProviderConfig>('/api/ai/provider', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
}

export function testAiProvider() {
  return apiRequest<AiConnectionTest>('/api/ai/provider/test', {
    method: 'POST',
  });
}
