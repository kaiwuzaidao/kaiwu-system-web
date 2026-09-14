import { App } from 'antd';
import { useIntl } from '@umijs/max';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { queryI18nResources, type I18nResource } from '@/services/i18n';

function parseTranslations(resource?: I18nResource): Record<string, string> {
  if (!resource?.translationsJson) return {};
  try {
    const parsed = JSON.parse(resource.translationsJson);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed as Record<string, unknown>).filter(
        ([, value]) => typeof value === 'string',
      ),
    ) as Record<string, string>;
  } catch {
    return {};
  }
}

/** 负责资源目录的惰性加载、错误反馈和当前引用解析。 */
export function useI18nResources(currentKey?: string) {
  const { message } = App.useApp();
  const intl = useIntl();
  const [resources, setResources] = useState<I18nResource[]>([]);
  const [resourcesLoaded, setResourcesLoaded] = useState(false);

  const loadResources = useCallback(
    async (silent = false) => {
      try {
        const rows = await queryI18nResources();
        setResources(rows);
        setResourcesLoaded(true);
        return rows;
      } catch (reason) {
        if (!silent) {
          void message.error(
            reason instanceof Error
              ? reason.message
              : intl.formatMessage({ id: 'localizedName.loadFailed' }),
          );
        }
        return [];
      }
    },
    [intl, message],
  );

  // 编辑现有记录时只需惰性拉取一次目录，供引用预览展示。
  useEffect(() => {
    if (currentKey && !resourcesLoaded) void loadResources(true);
  }, [currentKey, loadResources, resourcesLoaded]);

  const currentResource = useMemo(
    () => resources.find((item) => item.messageKey === currentKey),
    [currentKey, resources],
  );
  const translations = useMemo(() => parseTranslations(currentResource), [currentResource]);

  return { resources, resourcesLoaded, loadResources, translations };
}
