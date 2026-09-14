import loginEnUS from '@/locales/en-US/login';
import loginZhCN from '@/locales/zh-CN/login';

/**
 * 数据库或 Gateway 不可用时仍能完成登录和故障恢复的最小文案。
 * 完整页面文案必须来自数据库 catalog，禁止继续向这里追加业务模块文案。
 */
export const rescueMessages: Record<string, Record<string, string>> = {
  'zh-CN': {
    ...loginZhCN,
    'common.language': '语言',
    'common.language.updated': '语言设置已保存',
    'common.language.updateFailed': '保存语言设置失败',
    'client.connectionFailed': '无法连接服务，请确认 Kaiwu 网关已启动',
    'client.serviceUnavailable': '服务暂时不可用，请稍后重试',
    'client.requestFailed': '请求失败（HTTP {status}）',
    'client.loginFailed': '登录失败（HTTP {status}）',
    'client.sessionExpired': '会话已失效',
    'client.catalogFailed': '语言资源加载失败，已保留当前界面语言',
  },
  'en-US': {
    ...loginEnUS,
    'common.language': 'Language',
    'common.language.updated': 'Language preference saved',
    'common.language.updateFailed': 'Failed to save language preference',
    'client.connectionFailed': 'Cannot connect to the Kaiwu Gateway',
    'client.serviceUnavailable': 'The service is temporarily unavailable',
    'client.requestFailed': 'Request failed (HTTP {status})',
    'client.loginFailed': 'Sign-in failed (HTTP {status})',
    'client.sessionExpired': 'Your session has expired',
    'client.catalogFailed': 'Language resources failed to load; the current language was kept',
  },
};

export function rescueCatalog(locale: string) {
  return rescueMessages[locale] ?? rescueMessages['zh-CN'];
}
