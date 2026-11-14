import { resolveRuntimeMessage } from '@/i18n/runtime';

export type ApiMessage = {
  message?: string;
  messageKey?: string;
  messageArgs?: Record<string, unknown>;
};

/** 优先解析服务端稳定 key；缺 key 或客户端版本较旧时回退兼容 message。 */
export function resolveApiMessage(result?: ApiMessage, fallback = ''): string {
  if (!result?.messageKey) return result?.message || fallback;
  // 该 key 是兜底分类，服务端 message 可能包含具体的业务阻碍。
  if (result.messageKey === 'api.common.badRequest' && result.message) return result.message;
  const template = resolveRuntimeMessage(result.messageKey);
  if (typeof template !== 'string') return result.message || fallback;
  return template.replace(/\{([A-Za-z][A-Za-z0-9_]*)\}/g, (match, key) => {
    const value = result.messageArgs?.[key];
    return value === undefined || value === null ? match : String(value);
  });
}
