import { apiRequest } from '@/services/auth';

export type AppConfig = {
  id: string;
  scopeId: string;
  configKey: string;
  configValue: string;
  valueI18nKey?: string;
  valueType: 'STRING' | 'NUMBER' | 'BOOLEAN' | 'JSON';
  secret: boolean;
  status: string;
  description?: string;
  sortNo: number;
  createdAt: string;
  updatedAt: string;
};

export type DictType = {
  id: string;
  scopeId: string;
  dictCode: string;
  dictName: string;
  /** 引用的国际化资源 key；非空即启用引用式国际化（ADR 0014） */
  dictNameKey?: string;
  inheritGlobal: boolean;
  /** 显示顺序；越小越靠前，由拖拽维护 */
  sortNo: number;
  status: string;
  description?: string;
  updatedAt: string;
};

export type DictItem = {
  id: string;
  itemLabel: string;
  itemValue: string;
  sortNo: number;
  defaultItem: boolean;
  color?: string;
  extraJson?: string;
  /** 引用的国际化资源 key；多语言只走这条路（ADR 0015），为空即只有单一原文 */
  labelI18nKey?: string;
  status: string;
};

export type EffectiveDict = {
  dictCode: string;
  dictName: string;
  description?: string;
  items: DictItem[];
};

function scopeQuery(scopeId: string) {
  return `scopeId=${encodeURIComponent(scopeId)}`;
}

function jsonRequest(method: string, body: unknown): RequestInit {
  return {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}

export function queryConfigs(scopeId: string) {
  return apiRequest<AppConfig[]>(`/api/metadata/configs?${scopeQuery(scopeId)}`);
}

export function saveConfig(scopeId: string, input: Partial<AppConfig>) {
  return apiRequest<AppConfig>(
    `/api/metadata/configs?${scopeQuery(scopeId)}`,
    jsonRequest('POST', input),
  );
}

export function deleteConfig(scopeId: string, id: string) {
  return apiRequest<void>(`/api/metadata/configs/${id}?${scopeQuery(scopeId)}`, {
    method: 'DELETE',
  });
}

export function queryDictTypes(scopeId: string) {
  return apiRequest<DictType[]>(`/api/metadata/dicts?${scopeQuery(scopeId)}`);
}

export function saveDictType(scopeId: string, input: Partial<DictType>) {
  return apiRequest<DictType>(
    `/api/metadata/dicts?${scopeQuery(scopeId)}`,
    jsonRequest('POST', input),
  );
}

export function deleteDictType(scopeId: string, id: string) {
  return apiRequest<void>(`/api/metadata/dicts/${id}?${scopeQuery(scopeId)}`, { method: 'DELETE' });
}

/**
 * 按拖拽结果重排字典类型。
 *
 * <p>必须传当前范围内的**全部** ID：后端会校验集合一致，用过期列表提交会被整批拒绝，
 * 而不是把没提到的行留在旧位置造成看不见的错乱。</p>
 */
export function sortDictTypes(scopeId: string, ids: string[]) {
  return apiRequest<void>(
    `/api/metadata/dicts/sort?${scopeQuery(scopeId)}`,
    jsonRequest('POST', { ids }),
  );
}

/** 按拖拽结果重排字典项；语义同 {@link sortDictTypes}。 */
export function sortDictItems(scopeId: string, typeId: string, ids: string[]) {
  return apiRequest<void>(
    `/api/metadata/dicts/${typeId}/items/sort?${scopeQuery(scopeId)}`,
    jsonRequest('POST', { ids }),
  );
}

export function queryDictItems(scopeId: string, typeId: string) {
  return apiRequest<DictItem[]>(`/api/metadata/dicts/${typeId}/items?${scopeQuery(scopeId)}`);
}

/** 平台级只读字典，不依赖项目上下文；用于读取已启用语言目录。 */
export function queryPlatformDict(dictCode: string) {
  return apiRequest<EffectiveDict>(`/api/metadata/dicts/effective/${encodeURIComponent(dictCode)}`);
}

export function saveDictItem(scopeId: string, typeId: string, input: Partial<DictItem>) {
  return apiRequest<DictItem>(
    `/api/metadata/dicts/${typeId}/items?${scopeQuery(scopeId)}`,
    jsonRequest('POST', input),
  );
}

export function deleteDictItem(scopeId: string, typeId: string, itemId: string) {
  return apiRequest<void>(`/api/metadata/dicts/${typeId}/items/${itemId}?${scopeQuery(scopeId)}`, {
    method: 'DELETE',
  });
}
