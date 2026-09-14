import { PlusOutlined } from '@ant-design/icons';
import { Button, Input, Modal, Select, Space, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useEffect, useMemo, useState } from 'react';
import { useIntl } from '@umijs/max';
import type { I18nResource } from '@/services/i18n';

/** 从 translationsJson 中提取有非空译文的语言；无效 JSON 按无译文处理。 */
export function coveredLocales(translationsJson?: string): string[] {
  if (!translationsJson) return [];
  try {
    const parsed = JSON.parse(translationsJson) as Record<string, unknown>;
    return Object.entries(parsed)
      .filter(([, value]) => typeof value === 'string' && value.trim())
      .map(([locale]) => locale);
  } catch {
    return [];
  }
}

type ResourcePickerModalProps = {
  open: boolean;
  resources: I18nResource[];
  onClose: () => void;
  onCreate: () => void;
  onPick: (resource: I18nResource) => void;
};

/** 可按模块和关键字收敛近千条资源的选择弹窗。 */
export function ResourcePickerModal({
  open,
  resources,
  onClose,
  onCreate,
  onPick,
}: ResourcePickerModalProps) {
  const intl = useIntl();
  const [keyword, setKeyword] = useState('');
  const [moduleCode, setModuleCode] = useState<string>();

  useEffect(() => {
    if (!open) {
      setKeyword('');
      setModuleCode(undefined);
    }
  }, [open]);

  const modules = useMemo(
    () => [...new Set(resources.map((item) => item.moduleCode))].sort(),
    [resources],
  );
  const filtered = useMemo(() => {
    const text = keyword.trim().toLowerCase();
    return resources.filter((item) => {
      if (moduleCode && item.moduleCode !== moduleCode) return false;
      if (!text) return true;
      return (
        item.messageKey.toLowerCase().includes(text) ||
        item.defaultText.toLowerCase().includes(text)
      );
    });
  }, [keyword, moduleCode, resources]);

  const columns: ColumnsType<I18nResource> = [
    {
      title: intl.formatMessage({ id: 'localizedName.pickKey' }),
      dataIndex: 'messageKey',
      width: 260,
      render: (_, row) => <Typography.Text code>{row.messageKey}</Typography.Text>,
    },
    {
      title: intl.formatMessage({ id: 'localizedName.pickDefault' }),
      dataIndex: 'defaultText',
      ellipsis: true,
    },
    {
      title: intl.formatMessage({ id: 'localizedName.translationsPreview' }),
      dataIndex: 'translationsJson',
      width: 160,
      render: (_, row) => {
        const covered = coveredLocales(row.translationsJson);
        if (covered.length === 0) {
          return <Typography.Text type="secondary">-</Typography.Text>;
        }
        return covered.map((locale) => (
          <Tag key={locale} style={{ marginInlineEnd: 4 }}>
            {locale}
          </Tag>
        ));
      },
    },
    {
      title: intl.formatMessage({ id: 'localizedName.pickModule' }),
      dataIndex: 'moduleCode',
      width: 120,
    },
  ];

  return (
    <Modal
      open={open}
      width={860}
      title={intl.formatMessage({ id: 'localizedName.pickTitle' })}
      onCancel={onClose}
      footer={
        <Button onClick={onClose}>{intl.formatMessage({ id: 'localizedName.cancel' })}</Button>
      }
    >
      <Space style={{ marginBottom: 12 }}>
        <Input.Search
          allowClear
          style={{ width: 260 }}
          placeholder={intl.formatMessage({ id: 'localizedName.pickSearchPlaceholder' })}
          onSearch={setKeyword}
          onChange={(event) => {
            if (!event.target.value) setKeyword('');
          }}
        />
        <Select
          allowClear
          style={{ width: 180 }}
          placeholder={intl.formatMessage({ id: 'localizedName.pickModule' })}
          value={moduleCode}
          onChange={setModuleCode}
          options={modules.map((item) => ({ value: item, label: item }))}
        />
        <Button type="primary" icon={<PlusOutlined />} onClick={onCreate}>
          {intl.formatMessage({ id: 'localizedName.createResource' })}
        </Button>
      </Space>
      <Table<I18nResource>
        rowKey="id"
        size="small"
        columns={columns}
        dataSource={filtered}
        pagination={{ pageSize: 10, showSizeChanger: false }}
        onRow={(row) => ({
          style: { cursor: 'pointer' },
          onClick: () => onPick(row),
        })}
      />
    </Modal>
  );
}
