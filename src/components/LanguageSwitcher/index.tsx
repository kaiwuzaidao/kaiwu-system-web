import { GlobalOutlined } from '@ant-design/icons';
import { useIntl } from '@umijs/max';
import { App, Button, Dropdown, Tooltip } from 'antd';
import { useEffect, useState } from 'react';
import { currentUserSnapshot, hasSession, updateCurrentUserLocale } from '@/services/auth';
import {
  applyLocale,
  currentLocale,
  normalizeLocale,
  registerEnabledLocales,
  type SupportedLocale,
} from '@/utils/locale';
import { queryI18nLocales, queryPublicI18nCatalog, type I18nLocale } from '@/services/i18n';
import { installCatalog } from '@/i18n/runtime';

export default function LanguageSwitcher({ compact = false }: { compact?: boolean }) {
  const intl = useIntl();
  const { message } = App.useApp();
  const [saving, setSaving] = useState(false);
  const [locales, setLocales] = useState<I18nLocale[]>([]);
  const current = normalizeLocale(currentUserSnapshot()?.locale ?? currentLocale());

  useEffect(() => {
    if (!hasSession()) return;
    void queryI18nLocales(current)
      .then((values) => {
        const selectable = values.filter((item) => item.selectable);
        registerEnabledLocales(selectable.map((item) => item.locale));
        setLocales(selectable);
      })
      .catch(() => setLocales([]));
  }, [current]);

  const selectLocale = async (locale: SupportedLocale) => {
    if (locale === current) return;
    if (!hasSession()) {
      try {
        installCatalog(await queryPublicI18nCatalog(locale));
      } catch {
        // PUBLIC catalog 故障时，内置 zh/en 救援包仍允许切换登录表单。
        applyLocale(locale);
      }
      return;
    }
    setSaving(true);
    try {
      await updateCurrentUserLocale(locale);
      void message.success(intl.formatMessage({ id: 'common.language.updated' }));
    } catch (reason) {
      void message.error(
        reason instanceof Error
          ? reason.message
          : intl.formatMessage({ id: 'common.language.updateFailed' }),
      );
    } finally {
      setSaving(false);
    }
  };

  const languageItems =
    locales.length > 0
      ? locales.map((item) => ({
          key: item.locale,
          label: item.label,
          onClick: () => void selectLocale(item.locale),
        }))
      : [
          {
            key: 'zh-CN',
            label: intl.formatMessage({
              id: 'common.language.zhCN',
              defaultMessage: '简体中文',
            }),
            onClick: () => void selectLocale('zh-CN'),
          },
          {
            key: 'en-US',
            label: intl.formatMessage({
              id: 'common.language.enUS',
              defaultMessage: 'English',
            }),
            onClick: () => void selectLocale('en-US'),
          },
        ];

  const trigger = (
    <Button
      type="text"
      size={compact ? 'small' : 'middle'}
      loading={saving}
      icon={<GlobalOutlined />}
      aria-label={intl.formatMessage({ id: 'common.language' })}
      style={compact ? { width: 32, height: 32, flexShrink: 0 } : undefined}
    >
      {compact
        ? null
        : (locales.find((item) => item.locale === current)?.label ??
          intl.formatMessage({ id: 'common.language', defaultMessage: '语言' }))}
    </Button>
  );

  return (
    <Dropdown
      placement={compact ? 'topRight' : 'bottomRight'}
      trigger={['click']}
      menu={{
        selectable: true,
        selectedKeys: [current],
        items: languageItems,
      }}
    >
      {compact ? (
        <Tooltip title={intl.formatMessage({ id: 'common.language' })}>{trigger}</Tooltip>
      ) : (
        trigger
      )}
    </Dropdown>
  );
}
