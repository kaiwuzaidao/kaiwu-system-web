import { useIntl } from '@umijs/max';
import { Alert, Button, Empty, Space, Table, Tag, Typography } from 'antd';
import { useCallback, useEffect, useState } from 'react';
import { listLocalAgentCapabilities, type AgentLocalCapability } from '@/services/agent';

export default function SystemAgentCapabilitiesPanel() {
  const intl = useIntl();
  const t = useCallback((key: string) => intl.formatMessage({ id: `agent.local.${key}` }), [intl]);
  const [rows, setRows] = useState<AgentLocalCapability[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await listLocalAgentCapabilities());
      setError('');
    } catch (failure) {
      setRows([]);
      setError(failure instanceof Error ? failure.message : t('loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [t]);
  useEffect(() => {
    void load();
  }, [load]);
  return (
    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
      <Alert type="info" showIcon message={t('intro')} description={t('scope')} />
      {error && <Alert type="error" showIcon message={error} />}
      <Button onClick={() => void load()} loading={loading}>
        {t('refresh')}
      </Button>
      <Table<AgentLocalCapability>
        rowKey="code"
        loading={loading}
        dataSource={rows}
        pagination={{ pageSize: 20 }}
        scroll={{ x: 850 }}
        locale={{ emptyText: <Empty description={t('empty')} /> }}
        columns={[
          { title: t('code'), dataIndex: 'code', width: 230 },
          { title: t('description'), dataIndex: 'description' },
          { title: t('permission'), dataIndex: 'permission', width: 210 },
          {
            title: t('mode'),
            dataIndex: 'readOnly',
            width: 125,
            render: (readOnly: boolean) => (readOnly ? t('readOnly') : t('confirmation')),
          },
          {
            title: t('availability'),
            dataIndex: 'available',
            width: 130,
            render: (available: boolean) => (
              <Tag color={available ? 'success' : 'default'}>
                {available ? t('allowed') : t('denied')}
              </Tag>
            ),
          },
        ]}
      />
      <Typography.Text type="secondary">{t('note')}</Typography.Text>
    </Space>
  );
}
