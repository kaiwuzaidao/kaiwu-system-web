import { useIntl } from '@umijs/max';
import { Alert, App, Button, Form, Input, Modal, Popconfirm, Space, Spin, Table } from 'antd';
import { useCallback, useEffect, useState } from 'react';
import AuthButton from '@/components/AuthButton';
import DictTag from '@/components/DictTag';
import {
  createBackendService,
  queryBackendServices,
  setBackendServiceStatus,
  updateBackendService,
  type BackendService,
} from '@/services/projects';

type Props = { projectId: string; permissions: string[] };
type Fields = { serviceCode: string; serviceUrl: string };
/** 项目管理员维护显式后端服务；实际发布仍须审核 Gateway 片段。 */
export default function BackendServicesPanel({ projectId, permissions }: Props) {
  const intl = useIntl();
  const t = (id: string) => intl.formatMessage({ id: `projects.backendServices.${id}` });
  const { message } = App.useApp();
  const [rows, setRows] = useState<BackendService[]>([]);
  const [loading, setLoading] = useState(false);
  const [authorized, setAuthorized] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<BackendService>();
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm<Fields>();
  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await queryBackendServices(projectId));
      setAuthorized(true);
      setLoadError('');
    } catch (error) {
      setAuthorized(false);
      setRows([]);
      setLoadError(error instanceof Error ? error.message : t('loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [projectId, message, intl]);
  useEffect(() => {
    void load();
  }, [load]);
  const edit = (row?: BackendService) => {
    setEditing(row);
    form.setFieldsValue({ serviceCode: row?.serviceCode ?? '', serviceUrl: row?.serviceUrl ?? '' });
    setOpen(true);
  };
  const save = async (values: Fields) => {
    setSaving(true);
    try {
      if (editing)
        await updateBackendService(projectId, editing.serviceCode, values.serviceUrl || null);
      else await createBackendService(projectId, values);
      setOpen(false);
      form.resetFields();
      void message.success(t('saved'));
      await load();
    } catch (error) {
      void message.error(error instanceof Error ? error.message : t('saveFailed'));
    } finally {
      setSaving(false);
    }
  };
  const setStatus = async (row: BackendService) => {
    setSaving(true);
    try {
      await setBackendServiceStatus(
        projectId,
        row.serviceCode,
        row.status === 'ENABLED' ? 'DISABLED' : 'ENABLED',
      );
      void message.success(t('saved'));
      await load();
    } catch (error) {
      void message.error(error instanceof Error ? error.message : t('saveFailed'));
    } finally {
      setSaving(false);
    }
  };
  if (!authorized) {
    return (
      <section aria-label={t('title')}>
        <Spin spinning={loading}>
          {loadError && (
            <Alert
              type="error"
              showIcon
              message={loadError}
              action={<Button onClick={() => void load()}>{t('refresh')}</Button>}
            />
          )}
        </Spin>
      </section>
    );
  }
  return (
    <section aria-label={t('title')}>
      <Space style={{ margin: '20px 0 12px' }}>
        <strong>{t('title')}</strong>
        <AuthButton
          permission="system:project:update"
          permissions={permissions}
          onClick={() => edit()}
        >
          {t('add')}
        </AuthButton>
        <Button onClick={() => void load()} loading={loading}>
          {t('refresh')}
        </Button>
      </Space>
      <Table<BackendService>
        rowKey="serviceCode"
        dataSource={rows}
        loading={loading}
        pagination={false}
        size="small"
        scroll={{ x: 520 }}
        columns={[
          {
            title: t('code'),
            render: (_, row) => (row.serviceCode === 'default' ? t('default') : row.serviceCode),
          },
          {
            title: t('url'),
            dataIndex: 'serviceUrl',
            render: (value: string | null) => value || '—',
          },
          {
            title: t('status'),
            render: (_, row) => <DictTag dictCode="common.status" value={row.status} />,
          },
          {
            title: t('actions'),
            render: (_, row) => (
              <Space>
                <AuthButton
                  permission="system:project:update"
                  permissions={permissions}
                  onClick={() => edit(row)}
                >
                  {t('edit')}
                </AuthButton>
                <Popconfirm title={t('statusConfirm')} onConfirm={() => setStatus(row)}>
                  <AuthButton
                    permission="system:project:update"
                    permissions={permissions}
                    loading={saving}
                  >
                    {row.status === 'ENABLED' ? t('disable') : t('enable')}
                  </AuthButton>
                </Popconfirm>
              </Space>
            ),
          },
        ]}
      />
      <Modal
        open={open}
        title={editing ? t('edit') : t('add')}
        onCancel={() => {
          setOpen(false);
          form.resetFields();
        }}
        onOk={() => form.submit()}
        confirmLoading={saving}
        destroyOnClose
      >
        <Form form={form} layout="vertical" onFinish={(values: Fields) => void save(values)}>
          <Form.Item
            name="serviceCode"
            label={t('code')}
            rules={[{ required: true }, { pattern: /^[a-z][a-z0-9]{1,15}$/ }]}
          >
            <Input disabled={Boolean(editing)} maxLength={16} />
          </Form.Item>
          <Form.Item
            name="serviceUrl"
            label={t('url')}
            rules={editing?.serviceCode === 'default' ? [] : [{ required: true }]}
          >
            <Input maxLength={512} />
          </Form.Item>
        </Form>
      </Modal>
    </section>
  );
}
