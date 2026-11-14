import { apiRequest } from '@/services/auth';

export type AgentLocalCapability = {
  code: string;
  version: string;
  description: string;
  permission: string;
  readOnly: boolean;
  available: boolean;
};

export const listLocalAgentCapabilities = () =>
  apiRequest<AgentLocalCapability[]>('/api/agent/local-capabilities');

export type AgentCardCommand = {
  label: string;
  capabilityCode: string;
  values: Record<string, string | number | boolean | string[]>;
};

/** 一张结果卡片。dataAt 是查询时刻，界面据此提示数据时间。 */
export type AgentCard = {
  type: 'metric' | 'table' | 'empty';
  capabilityCode?: string;
  title: string;
  rows: Record<string, unknown>[];
  dataAt: string;
  navigation?: {
    page?: number | null;
    previous?: AgentCardCommand | null;
    next?: AgentCardCommand | null;
    details: { rowIndex: number; command: AgentCardCommand }[];
  } | null;
  outputView?: {
    title: string;
    fields: {
      name: string;
      label: string;
      format: 'TEXT' | 'BOOLEAN_ENABLED' | 'DATETIME' | 'DICTIONARY';
      dictCode?: string | null;
    }[];
  } | null;
};

export type AgentConversationTurn = {
  question: string;
  answer?: string;
};

/**
 * 后端只返回结构化的 reason，不返回已翻译的句子——文案走 i18n，
 * key 为 `agent.degraded.<reason>`。
 */
export type AgentDegraded = {
  reason: 'PROVIDER_UNAVAILABLE' | 'RATE_LIMITED' | 'PLAN_INVALID' | 'PARTIAL_CAPABILITY_FAILURE';
  retryAfterSeconds?: number;
};

export type AgentInputForm = {
  capabilityCode: string;
  values: Record<string, string | number | boolean | string[]>;
  definition?: {
    titleKey?: string;
    title?: string;
    projectCode?: string;
    permission: string;
    fields: {
      name: string;
      labelKey?: string;
      label?: string;
      type?: 'STRING' | 'INT' | 'BOOL' | 'ENUM' | 'DATETIME' | 'STRING_LIST';
      dictCode?: string | null;
      values?: string[] | null;
      min?: number;
      max?: number;
      required: boolean;
      maxLength?: number;
      multiline: boolean;
      format: 'text' | 'slug' | 'javaPackage';
    }[];
  };
};

export type AgentAnswer = {
  answer: string;
  cards: AgentCard[];
  usedCapabilities: string[];
  correlationId: string;
  degraded?: AgentDegraded;
  inputForm?: AgentInputForm;
  pendingAction?: AgentAction;
  pendingRemoteAction?: AgentRemoteAction;
};

export async function askAgent(
  question: string,
  history: AgentConversationTurn[] = [],
  input?: AgentInputForm,
) {
  return apiRequest<AgentAnswer>('/api/agent/ask', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question, history, input }),
  });
}

export type AgentAction = {
  actionId: string;
  capabilityCode: string;
  version: string;
  status:
    | 'PENDING'
    | 'EXECUTING'
    | 'SUCCEEDED'
    | 'FAILED'
    | 'CANCELLED'
    | 'EXPIRED'
    | 'REJECTED'
    | 'UNKNOWN';
  project?: {
    projectCode: string;
    projectName: string;
    description?: string;
    packageName?: string;
  };
  permission?: string;
  previewFields?: Record<string, string>;
  /** Returned only by the first successful confirmation; never included in history/status reads. */
  oneTimeSecret?: string;
  confirmationMode?: 'REQUIRED' | 'STRONG';
  confirmationPhrase?: string;
  expiresAt: string;
  confirmationToken?: string;
  projectId?: string;
  reason?: string;
};
export const confirmAgentAction = (
  id: string,
  confirmationToken: string,
  confirmationPhrase?: string,
) =>
  apiRequest<AgentAction>(
    `/api/agent/actions/${encodeURIComponent(id)}/confirm`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ confirmationToken, confirmationPhrase }),
    },
    false,
  );
export const cancelAgentAction = (id: string) =>
  apiRequest<AgentAction>(
    `/api/agent/actions/${encodeURIComponent(id)}/cancel`,
    { method: 'POST' },
    false,
  );
export const getAgentAction = (id: string) =>
  apiRequest<AgentAction>(`/api/agent/actions/${encodeURIComponent(id)}`);

/** 子项目写操作：预览数据来自业务 Handler，浏览器只负责显示和显式确认。 */
export type AgentRemoteAction = {
  actionId: string;
  projectId: string;
  projectCode: string;
  capabilityCode: string;
  capabilityName: string;
  version: string;
  status:
    | 'PENDING'
    | 'EXECUTING'
    | 'SUCCEEDED'
    | 'FAILED'
    | 'CANCELLED'
    | 'EXPIRED'
    | 'REJECTED'
    | 'UNKNOWN';
  confirmationMode: 'REQUIRED' | 'STRONG';
  displayFields: Record<string, string>;
  displayLabels?: Record<string, string>;
  affectedCount: number;
  expiresAt: string;
  confirmationToken?: string;
  confirmationPhrase?: string;
  reasonCode?: string;
  result?: Record<string, string | number | boolean>;
};

export const confirmAgentRemoteAction = (
  id: string,
  confirmationToken: string,
  typedPhrase?: string,
) =>
  apiRequest<AgentRemoteAction>(
    `/api/agent/remote-actions/${encodeURIComponent(id)}/confirm`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ confirmationToken, ...(typedPhrase ? { typedPhrase } : {}) }),
    },
    false,
  );
export const cancelAgentRemoteAction = (id: string) =>
  apiRequest<AgentRemoteAction>(
    `/api/agent/remote-actions/${encodeURIComponent(id)}/cancel`,
    { method: 'POST' },
    false,
  );
export const getAgentRemoteAction = (id: string) =>
  apiRequest<AgentRemoteAction>(`/api/agent/remote-actions/${encodeURIComponent(id)}`);

export type AgentConversation = {
  id: string;
  title: string;
  useMemory: boolean;
  updatedAt: string;
};
export type AgentMemory = { id: string; content: string; enabled: boolean; updatedAt: string };
export type AgentMessage = {
  id: string;
  question: string;
  answer?: string;
  completed: boolean;
  createdAt: string;
};
export type AgentPage<T> = { current: number; size: number; total: number; records: T[] };
const personalRequest = <T>(path: string, method: string, data?: unknown) =>
  apiRequest<T>(
    `/api/agent/${path}`,
    {
      method,
      headers: { 'Content-Type': 'application/json' },
      ...(data === undefined ? {} : { body: JSON.stringify(data) }),
    },
    false,
  );
export const listAgentConversations = (current = 1) =>
  apiRequest<AgentPage<AgentConversation>>(`/api/agent/conversations?current=${current}`);
export const createAgentConversation = (title: string) =>
  personalRequest<AgentConversation>('conversations', 'POST', { title, useMemory: true });
export const updateAgentConversation = (
  item: Pick<AgentConversation, 'id' | 'title' | 'useMemory'>,
) =>
  personalRequest<AgentConversation>(`conversations/${encodeURIComponent(item.id)}`, 'PATCH', {
    title: item.title,
    useMemory: item.useMemory,
  });
export const deleteAgentConversation = (id: string) =>
  personalRequest<void>(`conversations/${encodeURIComponent(id)}`, 'DELETE');
export const listAgentMessages = (id: string, current = 1) =>
  apiRequest<AgentPage<AgentMessage>>(
    `/api/agent/conversations/${encodeURIComponent(id)}/messages?current=${current}`,
  );
export const sendAgentMessage = (id: string, question: string, input?: AgentInputForm) =>
  personalRequest<{ messageId: string; answer: AgentAnswer }>(
    `conversations/${encodeURIComponent(id)}/messages`,
    'POST',
    { question, input, requestId: crypto.randomUUID() },
  );
export const listAgentMemories = () => apiRequest<AgentMemory[]>('/api/agent/memories');
export const saveAgentMemory = (content: string, enabled: boolean, id?: string) =>
  personalRequest<AgentMemory>(
    id ? `memories/${encodeURIComponent(id)}` : 'memories',
    id ? 'PATCH' : 'POST',
    { content, enabled },
  );
export const deleteAgentMemory = (id: string) =>
  personalRequest<void>(`memories/${encodeURIComponent(id)}`, 'DELETE');
