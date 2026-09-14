import { useIntl } from '@umijs/max';

/** 兼容尚未迁移的页面；迁移后页面应使用 useLocaleFormatters。 */
export function formatDateTime(value?: string | null): string {
  if (!value) return '-';
  const matched = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}:\d{2})/.exec(value);
  return matched ? `${matched[1]} ${matched[2]}` : value;
}

/** 按当前界面 locale 格式化展示值，不改变 API、数据库或 URL 中的机器值。 */
export function useLocaleFormatters() {
  const intl = useIntl();

  const dateTime = (value?: string) => {
    if (!value) return '-';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return value;
    return new Intl.DateTimeFormat(intl.locale, {
      year: 'numeric',
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).format(parsed);
  };

  const number = (value: number) => new Intl.NumberFormat(intl.locale).format(value);

  return { dateTime, number };
}
