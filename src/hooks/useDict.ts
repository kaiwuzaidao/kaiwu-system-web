import { useIntl } from '@umijs/max';
import { useEffect, useState } from 'react';
import type { DictionaryOption } from '@/dictionaries/types';
import { DICT_FALLBACK } from '@/dictionaries/fallback';
import { apiRequest, subscribeSessionChange } from '@/services/auth';
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
  /** 最近一次读取失败的时间，用于限频重试。 */
  failedAt?: number;
  startedAt: number;
};

/** 失败后至少间隔这么久才允许再次请求，避免每次渲染都打接口。 */
const RETRY_INTERVAL_MS = 5_000;
/** 请求超过这个时长仍未返回（如登录态失效时 apiRequest 永不 resolve）视为卡死，允许重发。 */
const STALL_MS = 15_000;

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

async function fetchDict(
  dictCode: string,
  projectId?: string,
): Promise<{ options: DictionaryOption[]; failed: boolean }> {
  try {
    const data = await apiRequest<EffectiveDict>(
      projectId
        ? `/api/current/projects/${encodeURIComponent(projectId)}/dicts/${encodeURIComponent(dictCode)}`
        : `/api/metadata/dicts/effective/${encodeURIComponent(dictCode)}`,
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
    return { options, failed: false };
  } catch (reason) {
    // 后端未就绪 / 未 seed / 网络问题：降级到本地 fallback，但不再静默。
    warnFallback(dictCode, `读取失败（${reason instanceof Error ? reason.message : '未知错误'}）`);
    return { options: fallbackOptions(dictCode), failed: true };
  }
}

function cacheKey(dictCode: string, locale: string, projectId?: string) {
  return `${normalizeLocale(locale)}:${projectId ?? 'global'}:${dictCode}`;
}

function shouldReload(entry: CacheEntry) {
  const now = Date.now();
  if (entry.status === 'error') return now - (entry.failedAt ?? 0) >= RETRY_INTERVAL_MS;
  if (entry.status === 'loading') return now - entry.startedAt >= STALL_MS;
  return false;
}

function loadDict(dictCode: string, locale: string, projectId?: string) {
  const key = cacheKey(dictCode, locale, projectId);
  const existing = cache.get(key);
  if (existing && !shouldReload(existing)) return existing;
  // 失败过的条目保留上次的 fallback 选项，重试期间页面不闪空。
  const entry: CacheEntry = {
    status: 'loading',
    options: existing?.options ?? fallbackOptions(dictCode),
    startedAt: Date.now(),
  };
  entry.promise = fetchDict(dictCode, projectId).then(({ options, failed }) => {
    // 被更新的请求取代后，旧响应不再覆盖。
    if (cache.get(key) !== entry) return entry.options;
    entry.options = options.length > 0 ? options : fallbackOptions(dictCode);
    if (failed) {
      // 失败不再当作「已加载」永久缓存，下次渲染限频重试。
      entry.status = 'error';
      entry.failedAt = Date.now();
    } else {
      entry.status = 'loaded';
    }
    notify(dictCode);
    return entry.options;
  });
  cache.set(key, entry);
  return entry;
}

/**
 * 登录 / 会话变化后，丢弃所有没成功加载的条目：登录前或登录瞬间发出的请求可能因 401
 * 失败或被挂起，不清掉就会在整个 SPA 生命周期内一直显示原始 code。
 * token 刷新同样会触发这里，所以已成功的条目保持不动。
 */
subscribeSessionChange(() => {
  cache.forEach((entry, key) => {
    if (entry.status === 'loaded' && key.includes(':global:')) return;
    cache.delete(key);
    notify(key.slice(key.lastIndexOf(':') + 1));
  });
});

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
export function useDict(dictCode: string, projectId?: string) {
  const intl = useIntl();
  const [, setTick] = useState(0);
  const entry = loadDict(dictCode, intl.locale, projectId);

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
