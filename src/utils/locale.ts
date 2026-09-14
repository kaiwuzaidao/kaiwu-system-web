import { setLocale } from '@umijs/max';

export const DEFAULT_LOCALE = 'zh-CN';
export type SupportedLocale = string;

// useLocalStorage=false 时 Umi 自带 getLocale() 会始终回退 default；应用必须维护
// 当前进程内的 locale，才能支持 en-US -> zh-CN 的无刷新反向切换。
let runtimeLocale: SupportedLocale = DEFAULT_LOCALE;
let enabledLocales = new Set<string>([DEFAULT_LOCALE, 'en-US']);

const BCP_47 = /^[A-Za-z]{2,3}(?:-[A-Za-z]{4})?(?:-[A-Za-z]{2}|-[0-9]{3})?$/;

export function registerEnabledLocales(locales: string[]) {
  enabledLocales = new Set(locales.filter((locale) => BCP_47.test(locale)));
  enabledLocales.add(DEFAULT_LOCALE);
}

export function normalizeLocale(locale: unknown): SupportedLocale {
  return typeof locale === 'string' && BCP_47.test(locale) && enabledLocales.has(locale)
    ? locale
    : DEFAULT_LOCALE;
}

/** 在 Umi Provider 创建前装载服务端 Bootstrap 偏好，不触发尚未就绪的插件事件。 */
export function initializeLocale(locale: unknown): SupportedLocale {
  runtimeLocale = normalizeLocale(locale);
  return runtimeLocale;
}

/** 无刷新应用语言，避免清空只驻留内存的登录凭据。 */
export function applyLocale(locale: unknown) {
  const normalized = normalizeLocale(locale);
  if (runtimeLocale !== normalized) {
    // 必须先调用 setLocale：Umi 会通过下面导出的 currentLocale 读取旧值来判断是否切换。
    setLocale(normalized, false);
    runtimeLocale = normalized;
  }
  return normalized;
}

export function currentLocale(): SupportedLocale {
  return runtimeLocale;
}
