import { resolveRuntimeMessage } from '@/i18n/runtime';

export type ApiMessage = {
  message?: string;
  messageKey?: string;
  messageArgs?: Record<string, unknown>;
};

/** 优先解析服务端稳定 key；缺 key 或客户端版本较旧时回退兼容 message。 */
export function resolveApiMessage(result?: ApiMessage, fallback = ''): string {
  if (!result?.messageKey) return result?.message || fallback;
  const template = resolveRuntimeMessage(result.messageKey);
  if (typeof template !== 'string') return result.message || fallback;
  return template.replace(/\{([A-Za-z][A-Za-z0-9_]*)\}/g, (match, key) => {
    const value = result.messageArgs?.[key];
    return value === undefined || value === null ? match : String(value);
  });
}
