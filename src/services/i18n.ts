import { apiRequest, downloadApiFile } from '@/services/auth';

export type I18nCatalog = {
  locale: string;
  revision: number;
  messages: Record<string, string>;
};

export type I18nLocale = {
  locale: string;
  label: string;
  selectableConfigured: boolean;
  selectable: boolean;
  missingRequiredResources: number;
  missingMenus: number;
  missingDictionaryItems: number;
};

export type I18nResource = {
  id: string;
  messageKey: string;
  defaultText: string;
  translationsJson?: string;
  moduleCode: string;
  publicVisible: boolean;
  requiredResource: boolean;
  status: 'ENABLED' | 'DISABLED';
  description?: string;
  version: number;
  updatedAt: string;
};

export function queryI18nCatalog(locale: string) {
  return apiRequest<I18nCatalog>(`/api/i18n/catalog?locale=${encodeURIComponent(locale)}`);
}

export async function queryPublicI18nCatalog(locale: string) {
  const response = await fetch(`/api/public/i18n/catalog?locale=${encodeURIComponent(locale)}`, {
    headers: { 'Accept-Language': locale },
  });
  const result = (await response.json()) as {
    code: number;
    data?: I18nCatalog;
  };
  if (!response.ok || result.code !== 0 || !result.data) {
    throw new Error(`public catalog failed: ${response.status}`);
  }
  return result.data;
}

export function queryI18nLocales(locale = 'zh-CN') {
  return apiRequest<I18nLocale[]>(`/api/i18n/locales?locale=${encodeURIComponent(locale)}`);
}

/**
 * 资源接口的路径前缀：不传项目为平台资源（system:i18n:* 权限），
 * 传项目 ID 为该项目的资源（ADR 0037，仅项目管理员，由服务端判定）。
 */
function resourceBase(projectId?: string) {
  return projectId ? `/api/projects/${encodeURIComponent(projectId)}/i18n` : '/api/i18n';
}

export function queryI18nResources(projectId?: string) {
  return apiRequest<I18nResource[]>(`${resourceBase(projectId)}/resources`);
}

/** 表单选择器用的只读目录，登录即可读；管理页仍用 queryI18nResources（需 system:i18n:list）。 */
export function queryI18nResourceOptions() {
  return apiRequest<I18nResource[]>('/api/i18n/resources/options');
}

export function saveI18nResource(input: Partial<I18nResource>, projectId?: string) {
  return apiRequest<I18nResource>(`${resourceBase(projectId)}/resources`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
}

export function deleteI18nResource(id: string, version: number, projectId?: string) {
  return apiRequest<void>(
    `${resourceBase(projectId)}/resources/${encodeURIComponent(id)}?version=${version}`,
    {
      method: 'DELETE',
    },
  );
}

/**
 * 导出待翻译内容（资源 / 菜单 / 字典三个 Sheet）。
 *
 * 开放一门新语言要求译文全覆盖，平台侧近千条无法逐条手填，
 * 导出后离线翻译再整表导回是唯一可行路径。
 */
export function exportI18nTranslations(locale: string, projectId?: string) {
  return downloadApiFile(
    `${resourceBase(projectId)}/translations/export?locale=${encodeURIComponent(locale)}`,
    projectId ? `kaiwu-i18n-project-${locale}.xlsx` : `kaiwu-i18n-${locale}.xlsx`,
  );
}

export type I18nImportResult = {
  applied: number;
  /** 失败行（最多回报前若干条），文本已含 sheet 名与行号便于定位 */
  failures: string[];
};

/** 导入译文；只写目标语言那一列，其余字段仍由界面维护。 */
export function importI18nTranslations(locale: string, file: File, projectId?: string) {
  const form = new FormData();
  form.append('file', file);
  return apiRequest<I18nImportResult>(
    `${resourceBase(projectId)}/translations/import?locale=${encodeURIComponent(locale)}`,
    { method: 'POST', body: form },
  );
}
