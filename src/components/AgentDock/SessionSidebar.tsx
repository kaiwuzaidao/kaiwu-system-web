import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useIntl } from '@umijs/max';
import { DeleteOutlined } from '@ant-design/icons';
import { Alert, Button, Pagination, Popconfirm, Spin, Typography } from 'antd';
import LineIcon from '@/components/LineIcon';
import {
  deleteAgentConversation,
  listAgentConversations,
  type AgentConversation,
} from '@/services/agent';

const PAGE_SIZE = 20;

/** 会话列表侧栏。个人数据只从鉴权接口加载，不落浏览器存储。 */
export default function SessionSidebar({
  current,
  disabled,
  refreshKey,
  onCreate,
  onSelect,
  onDelete,
  onMemories,
  footer,
}: {
  current?: AgentConversation;
  disabled: boolean;
  refreshKey: number;
  onCreate: () => void;
  onSelect: (item: AgentConversation) => void;
  onDelete: (id: string) => void;
  onMemories: () => void;
  /** 侧栏底部的额外内容（窄屏时放「登录后默认进入」勾选框）。 */
  footer?: ReactNode;
}) {
  const intl = useIntl();
  const t = (id: string) => intl.formatMessage({ id });
  const [sessions, setSessions] = useState<AgentConversation[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [revision, setRevision] = useState(0);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
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
        const result = await listAgentConversations(page);
        if (!cancelled) {
          setSessions(result.records);
          setTotal(result.total);
        }
      } catch (e) {
        if (!cancelled) {
          setSessions([]);
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
  }, [page, revision, refreshKey]);
  const remove = async (id: string) => {
    if (locked.current || disabled) return;
    locked.current = true;
    setBusy(true);
    setError(undefined);
    try {
      await deleteAgentConversation(id);
      if (mounted.current) {
        onDelete(id);
        setRevision((v) => v + 1);
      }
    } catch (e) {
      if (mounted.current) setError(e instanceof Error ? e.message : t('agent.chat.failed'));
    } finally {
      locked.current = false;
      if (mounted.current) setBusy(false);
    }
  };
  return (
    <aside className="agent-dock-sidebar">
      <div className="agent-dock-sidebar-new">
        <Button
          block
          icon={<LineIcon name="plus" size={14} />}
          disabled={disabled}
          onClick={onCreate}
          aria-label={t('agent.chat.new')}
        >
          {t('agent.chat.new')}
        </Button>
      </div>
      <div className="agent-dock-sidebar-caption">{t('agent.chat.recent')}</div>
      <div className="agent-dock-sidebar-list">
        {error && (
          <Alert
            showIcon
            type="error"
            message={error}
            style={{ margin: '0 4px 8px' }}
            action={
              <Button size="small" onClick={() => setRevision((v) => v + 1)}>
                {t('agent.chat.refresh')}
              </Button>
            }
          />
        )}
        {/* 发消息后会刷新列表，已有数据时静默刷新，避免每次发送都闪一下加载态。 */}
        {loading && sessions.length === 0 ? (
          <div className="agent-dock-sidebar-state">
            <Spin size="small" />
          </div>
        ) : sessions.length === 0 ? (
          !error && (
            <Typography.Text type="secondary" className="agent-dock-sidebar-state">
              {t('agent.chat.empty')}
            </Typography.Text>
          )
        ) : (
          sessions.map((item) => (
            <div
              key={item.id}
              className={`agent-dock-session${current?.id === item.id ? ' is-active' : ''}`}
            >
              <Button
                type="text"
                block
                autoInsertSpace={false}
                className="agent-dock-session-title"
                icon={<LineIcon name="message" size={15} />}
                disabled={disabled || busy}
                aria-current={current?.id === item.id ? 'true' : undefined}
                title={item.title}
                onClick={() => onSelect(item)}
              >
                {item.title}
              </Button>
              <Popconfirm
                title={t('agent.chat.deleteConfirm')}
                placement="right"
                onConfirm={() => remove(item.id)}
              >
                <Button
                  type="text"
                  size="small"
                  className="agent-dock-session-delete"
                  icon={<DeleteOutlined />}
                  disabled={disabled || busy}
                  aria-label={t('agent.chat.delete')}
                />
              </Popconfirm>
            </div>
          ))
        )}
        {total > PAGE_SIZE && (
          <Pagination
            simple
            size="small"
            className="agent-dock-sidebar-pager"
            current={page}
            pageSize={PAGE_SIZE}
            total={total}
            showSizeChanger={false}
            onChange={setPage}
            disabled={busy || disabled}
          />
        )}
      </div>
      <div className="agent-dock-sidebar-footer">
        {/* 底部说明兼作个人记忆入口：记忆与会话都跟随账号，两种模式共用。 */}
        <Button
          type="link"
          className="agent-dock-sidebar-link"
          disabled={busy || disabled}
          onClick={onMemories}
          aria-label={t('agent.memory.title')}
        >
          {t('agent.chat.footerTitle')}
        </Button>
        <div className="agent-dock-sidebar-tip">{t('agent.chat.footerDesc')}</div>
        {footer && <div className="agent-dock-sidebar-extra">{footer}</div>}
      </div>
    </aside>
  );
}
