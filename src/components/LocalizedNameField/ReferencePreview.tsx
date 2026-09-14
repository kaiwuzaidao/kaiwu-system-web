import { Button, Space, Tag, Typography } from 'antd';
import { getLocale, useIntl } from '@umijs/max';

type ReferencePreviewProps = {
  currentKey?: string;
  currentFallback?: string;
  translations: Record<string, string>;
  disabled?: boolean;
  onChange: () => void;
  onCreate: () => void;
};

/** 引用模式下按当前界面语言展示最终文案，并提供更换与新建入口。 */
export function ReferencePreview({
  currentKey,
  currentFallback,
  translations,
  disabled,
  onChange,
  onCreate,
}: ReferencePreviewProps) {
  const intl = useIntl();
  if (!currentKey) {
    return (
      <Space>
        <Button type="primary" disabled={disabled} onClick={onChange}>
          {intl.formatMessage({ id: 'localizedName.pickResource' })}
        </Button>
        <Button disabled={disabled} onClick={onCreate}>
          {intl.formatMessage({ id: 'localizedName.createResource' })}
        </Button>
      </Space>
    );
  }

  const locale = getLocale();
  const displayValue = translations[locale]?.trim() ? translations[locale] : currentFallback || '-';
  const covered = Object.keys(translations).filter((item) => translations[item]?.trim());
  return (
    <div
      style={{
        padding: 12,
        border: '1px solid #f0f0f0',
        borderRadius: 6,
        background: '#fafafa',
      }}
    >
      <Space size={8} wrap style={{ display: 'flex', marginBottom: 8 }}>
        <Typography.Text type="secondary">
          {intl.formatMessage({ id: 'localizedName.referenced' })}
        </Typography.Text>
        <Typography.Text code copyable>
          {currentKey}
        </Typography.Text>
        <Button type="link" size="small" disabled={disabled} onClick={onChange}>
          {intl.formatMessage({ id: 'localizedName.change' })}
        </Button>
      </Space>
      <Space size={16} wrap style={{ display: 'flex' }}>
        <span>
          <Typography.Text type="secondary" style={{ marginRight: 8 }}>
            {intl.formatMessage({ id: 'localizedName.defaultPreview' })}
          </Typography.Text>
          <Typography.Text strong>{displayValue}</Typography.Text>
        </span>
        {covered.length > 0 && (
          <span>
            <Typography.Text type="secondary" style={{ marginRight: 8 }}>
              {intl.formatMessage({ id: 'localizedName.translationsPreview' })}
            </Typography.Text>
            {covered.map((item) => (
              <Tag key={item} style={{ marginInlineEnd: 4 }}>
                {item}
              </Tag>
            ))}
          </span>
        )}
      </Space>
    </div>
  );
}
