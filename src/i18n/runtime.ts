import { addLocale } from '@umijs/max';
import enUS from 'antd/es/locale/en_US';
import jaJP from 'antd/es/locale/ja_JP';
import zhCN from 'antd/es/locale/zh_CN';
import type { Locale } from 'antd/es/locale';
import { applyLocale } from '@/utils/locale';
import { rescueCatalog } from './rescue';

export type RuntimeCatalog = {
  locale: string;
  revision: number;
  messages: Record<string, string>;
};

let activeCatalog: RuntimeCatalog = {
  locale: 'zh-CN',
  revision: 0,
  messages: rescueCatalog('zh-CN'),
};

const antdLocales: Record<string, Locale> = {
  'zh-CN': zhCN,
  'en-US': enUS,
  'ja-JP': jaJP,
};

/** 先注册完整快照，再触发 Umi 唯一 IntlProvider 切换，页面不会看到半份 catalog。 */
export function installCatalog(catalog: RuntimeCatalog) {
  const messages = { ...rescueCatalog(catalog.locale), ...catalog.messages };
  addLocale(catalog.locale, messages, {
    // 应用文案可完全由数据库扩展；Ant Design 未预打包的 locale 安全回退英文组件文案。
    antd: antdLocales[catalog.locale] ?? enUS,
    momentLocale: '',
  });
  activeCatalog = { ...catalog, messages };
  applyLocale(catalog.locale);
  return activeCatalog;
}

export function currentCatalog() {
  return activeCatalog;
}

export function resolveRuntimeMessage(key: string): string | undefined {
  return activeCatalog.messages[key] ?? rescueCatalog(activeCatalog.locale)[key];
}
