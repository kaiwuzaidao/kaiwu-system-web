import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { useIntl } from '@umijs/max';
import { EditOutlined } from '@ant-design/icons';
import { Alert, Button, Form, Input, Popover, Switch, Tooltip, type InputRef } from 'antd';
import { updateAgentConversation, type AgentConversation } from '@/services/agent';

/** 当前会话的名称与记忆开关，从对话头部的编辑按钮打开。 */
export default function SessionSettings({
  current,
  disabled,
  onUpdate,
}: {
  current: AgentConversation;
  disabled: boolean;
  onUpdate: (item: AgentConversation) => void;
}) {
  const intl = useIntl();
  const t = (id: string) => intl.formatMessage({ id });
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [form] = Form.useForm();
  const titleRef = useRef<InputRef>(null);
  const locked = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    if (!open) return;
    form.setFieldsValue(current);
    setError(undefined);
    // 浮层内容首次打开时才挂载，等一帧再聚焦。
    const timer = window.setTimeout(() => titleRef.current?.focus());
    return () => window.clearTimeout(timer);
  }, [open, current, form]);
  // 浮层属于抽屉的 React 子树，Esc 会冒泡到抽屉把整个对话窗关掉并留下孤立浮层；
  // 浮层打开时只关浮层。外层包住触发按钮和浮层内容（React 事件会穿过 portal 冒泡）。
  const closeOnEscape = (event: KeyboardEvent) => {
    if (!open || event.key !== 'Escape') return;
    event.stopPropagation();
    setOpen(false);
  };
  const save = async (values: Pick<AgentConversation, 'title' | 'useMemory'>) => {
    if (locked.current || disabled) return;
    locked.current = true;
    setBusy(true);
    setError(undefined);
    try {
      const updated = await updateAgentConversation({
        ...current,
        ...values,
        title: values.title.trim(),
      });
      if (mounted.current) {
        onUpdate(updated);
        setOpen(false);
      }
    } catch (e) {
      if (mounted.current) setError(e instanceof Error ? e.message : t('agent.chat.failed'));
    } finally {
      locked.current = false;
      if (mounted.current) setBusy(false);
    }
  };
  return (
    <span className="agent-dock-settings-anchor" onKeyDown={closeOnEscape}>
      <Popover
        trigger="click"
        placement="bottomRight"
        open={open}
        onOpenChange={(next) => setOpen(next && !disabled)}
        content={
          <Form
            form={form}
            layout="vertical"
            disabled={busy || disabled}
            className="agent-dock-settings"
            onFinish={(values) => void save(values)}
          >
            {error && <Alert showIcon type="error" message={error} style={{ marginBottom: 12 }} />}
            <Form.Item
              name="title"
              label={t('agent.chat.rename')}
              rules={[{ required: true, whitespace: true, message: t('agent.chat.required') }]}
            >
              <Input ref={titleRef} maxLength={100} />
            </Form.Item>
            <div className="agent-dock-settings-footer">
              <Form.Item
                name="useMemory"
                label={t('agent.chat.useMemory')}
                valuePropName="checked"
                layout="horizontal"
                style={{ marginBottom: 0 }}
              >
                <Switch size="small" />
              </Form.Item>
              <Button htmlType="submit" type="primary" loading={busy}>
                {t('agent.chat.save')}
              </Button>
            </div>
          </Form>
        }
      >
        <Tooltip title={open ? undefined : t('common.edit')}>
          <Button
            type="text"
            icon={<EditOutlined />}
            disabled={disabled}
            aria-label={t('common.edit')}
          />
        </Tooltip>
      </Popover>
    </span>
  );
}
