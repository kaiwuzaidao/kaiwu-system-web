import { apiRequest } from '@/services/auth';

export type AiProviderConfig = {
  providerName: string;
  baseUrl: string;
  apiKeyConfigured: boolean;
  model: string;
  temperature: number;
  timeoutSeconds: number;
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

export type AiModel = AiProviderConfig & { id: string };
export type AiModelSaveInput = AiProviderSaveInput & { id?: string };
export type AiModelRoutes = { planModelId: string | null; answerModelId: string | null };

export function queryAiModels() {
  return apiRequest<AiModel[]>('/api/ai/models');
}

export function saveAiModel(input: AiModelSaveInput) {
  return apiRequest<AiModel>('/api/ai/models', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
}

export function testAiModel(id: string) {
  return apiRequest<AiConnectionTest>(`/api/ai/models/${encodeURIComponent(id)}/test`, {
    method: 'POST',
  });
}

export function queryAiModelRoutes() {
  return apiRequest<AiModelRoutes>('/api/ai/model-routes');
}

export function saveAiModelRoutes(input: AiModelRoutes) {
  return apiRequest<AiModelRoutes>('/api/ai/model-routes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
}
