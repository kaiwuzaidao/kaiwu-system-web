import { useIntl } from '@umijs/max';
import { useEffect, useState } from 'react';
import type { DictionaryOption } from '@/dictionaries/types';
import { DICT_FALLBACK } from '@/dictionaries/fallback';
import { apiRequest } from '@/services/auth';
import { currentLocale, normalizeLocale } from '@/utils/locale';

type EffectiveDictItem = {
  id: string;
  itemLabel: string;
  itemValue: string;
  sortNo: number;
  defaultItem: boolean;
  color?: string;
  extraJson?: string;
  status: string;
};

type EffectiveDict = {
  code: string;
  name: string;
  description?: string;
  items: EffectiveDictItem[];
};

type CacheEntry = {
  status: 'loading' | 'loaded' | 'error';
  options: DictionaryOption[];
  promise?: Promise<DictionaryOption[]>;
};

const cache = new Map<string, CacheEntry>();
const subscribers = new Map<string, Set<() => void>>();

function notify(dictCode: string) {
  subscribers.get(dictCode)?.forEach((fn) => fn());
}

function subscribe(dictCode: string, listener: () => void) {
  const set = subscribers.get(dictCode) ?? new Set();
  set.add(listener);
  subscribers.set(dictCode, set);
  return () => {
    set.delete(listener);
  };
}

function fallbackOptions(dictCode: string): DictionaryOption[] {
  return DICT_FALLBACK[dictCode] ?? [];
}

/**
 * 降级到本地 fallback 时必须留痕。
 *
 * 早期这里是静默 catch，导致「后端没 seed 这个字典」和「字典正常」在页面上表现完全一致：
 * 照样显示中文，没人会发现走的是硬编码。`ai.enabled` / `gitlab.enabled` 两个字典
 * 从未 seed 却存活了很久，就是这么来的。
 */
function warnFallback(dictCode: string, why: string) {
  const hasFallback = (DICT_FALLBACK[dictCode]?.length ?? 0) > 0;
  // eslint-disable-next-line no-console
  console.warn(
    `[dict] ${dictCode} ${why}，降级到本地 fallback${hasFallback ? '' : '（本地也没有，将原样显示后端原始值）'}。` +
      ' 请确认后端已 seed 该字典，可执行 pnpm check:dict 比对。',
  );
}

async function fetchDict(dictCode: string): Promise<DictionaryOption[]> {
  try {
    const data = await apiRequest<EffectiveDict>(
      `/api/metadata/dicts/effective/${encodeURIComponent(dictCode)}`,
    );
    const options = data.items
      .filter((item) => item.status === 'ENABLED')
      .sort((a, b) => a.sortNo - b.sortNo)
      .map((item) => ({
        value: item.itemValue,
        label: item.itemLabel,
        color: item.color,
      }));
    if (options.length === 0) {
      // 字典存在但没有启用中的字典项，等同于不可用。
      warnFallback(dictCode, '后端返回 0 个启用项');
    }
    return options;
  } catch (reason) {
    // 后端未就绪 / 未 seed / 网络问题：降级到本地 fallback，但不再静默。
    warnFallback(dictCode, `读取失败（${reason instanceof Error ? reason.message : '未知错误'}）`);
    return fallbackOptions(dictCode);
  }
}

function cacheKey(dictCode: string, locale: string) {
  return `${normalizeLocale(locale)}:${dictCode}`;
}

function loadDict(dictCode: string, locale: string) {
  const key = cacheKey(dictCode, locale);
  const existing = cache.get(key);
  if (existing && existing.status !== 'error') return existing;
  const entry: CacheEntry = {
    status: 'loading',
    options: fallbackOptions(dictCode),
  };
  entry.promise = fetchDict(dictCode).then((options) => {
    entry.status = 'loaded';
    entry.options = options.length > 0 ? options : fallbackOptions(dictCode);
    notify(dictCode);
    return entry.options;
  });
  cache.set(key, entry);
  return entry;
}

/**
 * 消费受管字典：优先取后端 scope=0 的 global 字典，加载中或失败时返回本地
 * `DICT_FALLBACK` 兜底，保证渲染不会空。相同 locale + dictCode 全局只请求一次；
 * 语言切换后使用新的缓存分区并重新向服务端读取已本地化标签。
 *
 * <p>标签的翻译完全由服务端按 label_i18n_key → label_i18n → 原文解析后下发
 * （ADR 0014），这里不再用 `intl.formatMessage({id: 'dict.{code}.{value}'})` 做
 * 客户端二次覆盖——那层覆盖此前是全局字典标签实际生效的唯一路径（服务端从不解析
 * label_i18n），且优先级高于服务端结果，会让管理员在字典管理页改了引用资源却看不到
 * 效果。现在响应内容就是最终显示内容，Network 面板看到的即所见。</p>
 */
export function useDict(dictCode: string) {
  const intl = useIntl();
  const [, setTick] = useState(0);
  const entry = loadDict(dictCode, intl.locale);

  useEffect(() => {
    const unsubscribe = subscribe(dictCode, () => setTick((n) => n + 1));
    return unsubscribe;
  }, [dictCode]);

  return {
    options: entry.options,
    loading: entry.status === 'loading',
  };
}

/** 同步读取字典（无 subscribe），只在事件回调等 hook 之外场景使用。 */
export function readDict(dictCode: string): DictionaryOption[] {
  return cache.get(cacheKey(dictCode, currentLocale()))?.options ?? fallbackOptions(dictCode);
}
