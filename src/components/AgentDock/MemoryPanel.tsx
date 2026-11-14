import { useEffect, useRef, useState } from 'react';
import { useIntl } from '@umijs/max';
import {
  Alert,
  Button,
  Empty,
  Form,
  Input,
  List,
  Popconfirm,
  Space,
  Spin,
  Switch,
  Typography,
} from 'antd';
import {
  deleteAgentMemory,
  listAgentMemories,
  saveAgentMemory,
  type AgentMemory,
} from '@/services/agent';

/** 个人记忆管理。个人数据只从鉴权接口加载，不落浏览器存储。 */
export default function MemoryPanel({ disabled }: { disabled: boolean }) {
  const intl = useIntl();
  const t = (id: string) => intl.formatMessage({ id });
  const [memories, setMemories] = useState<AgentMemory[]>([]);
  const [revision, setRevision] = useState(0);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [editing, setEditing] = useState<AgentMemory>();
  const [form] = Form.useForm();
  const mounted = useRef(true);
  const locked = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(undefined);
    const load = async () => {
      try {
        const result = await listAgentMemories();
        if (!cancelled) setMemories(result);
      } catch (e) {
        if (!cancelled) {
          setMemories([]);
          setError(e instanceof Error ? e.message : t('agent.chat.failed'));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [revision]);
  const mutate = async (action: () => Promise<void>) => {
    if (locked.current || disabled) return;
    locked.current = true;
    setBusy(true);
    setError(undefined);
    try {
      await action();
      if (mounted.current) setRevision((v) => v + 1);
    } catch (e) {
      if (mounted.current) setError(e instanceof Error ? e.message : t('agent.chat.failed'));
    } finally {
      locked.current = false;
      if (mounted.current) setBusy(false);
    }
  };
  const resetEditing = () => {
    setEditing(undefined);
    form.resetFields();
  };
  return (
    <div className="agent-dock-memory">
      <Typography.Paragraph type="secondary" className="agent-dock-memory-hint">
        {t('agent.memory.hint')}
      </Typography.Paragraph>
      {error && (
        <Alert
          showIcon
          type="error"
          message={error}
          style={{ marginBottom: 16 }}
          action={
            <Button size="small" onClick={() => setRevision((v) => v + 1)}>
              {t('agent.chat.refresh')}
            </Button>
          }
        />
      )}
      <Form
        form={form}
        layout="vertical"
        initialValues={{ enabled: true }}
        disabled={busy || disabled}
        className="agent-dock-memory-form"
        onFinish={(values) =>
          void mutate(async () => {
            await saveAgentMemory(values.content.trim(), values.enabled, editing?.id);
            if (mounted.current) resetEditing();
          })
        }
      >
        <Form.Item
          name="content"
          label={t('agent.memory.content')}
          rules={[{ required: true, whitespace: true, message: t('agent.chat.required') }]}
        >
          <Input.TextArea maxLength={500} showCount rows={2} />
        </Form.Item>
        <div className="agent-dock-memory-actions">
          <Form.Item
            name="enabled"
            valuePropName="checked"
            label={t('agent.memory.enabled')}
            layout="horizontal"
            style={{ marginBottom: 0 }}
          >
            <Switch size="small" />
          </Form.Item>
          <Space>
            {editing && <Button onClick={resetEditing}>{t('agent.chat.cancel')}</Button>}
            <Button htmlType="submit" type="primary" loading={busy}>
              {t(editing ? 'agent.chat.save' : 'agent.memory.add')}
            </Button>
          </Space>
        </div>
      </Form>
      {loading && memories.length === 0 ? (
        <div className="agent-dock-sidebar-state">
          <Spin size="small" />
        </div>
      ) : (
        <List
          className="agent-dock-memory-list"
          dataSource={memories}
          locale={{
            emptyText: (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('agent.memory.empty')} />
            ),
          }}
          renderItem={(item) => (
            <List.Item
              className={item.enabled ? undefined : 'is-disabled'}
              actions={[
                <Switch
                  key="enabled"
                  size="small"
                  aria-label={t('agent.memory.enabled')}
                  checked={item.enabled}
                  disabled={busy || disabled}
                  onChange={(enabled) =>
                    void mutate(async () => {
                      await saveAgentMemory(item.content, enabled, item.id);
                    })
                  }
                />,
                <Button
                  key="edit"
                  type="link"
                  size="small"
                  disabled={busy || disabled}
                  onClick={() => {
                    setEditing(item);
                    form.setFieldsValue(item);
                  }}
                >
                  {t('agent.memory.edit')}
                </Button>,
                <Popconfirm
                  key="delete"
                  title={t('agent.memory.deleteConfirm')}
                  onConfirm={() =>
                    mutate(async () => {
                      await deleteAgentMemory(item.id);
                      if (mounted.current && editing?.id === item.id) resetEditing();
                    })
                  }
                >
                  <Button type="link" size="small" danger disabled={busy || disabled}>
                    {t('agent.chat.delete')}
                  </Button>
                </Popconfirm>,
              ]}
            >
              <Typography.Text style={{ whiteSpace: 'pre-wrap' }}>{item.content}</Typography.Text>
            </List.Item>
          )}
        />
      )}
    </div>
  );
}
