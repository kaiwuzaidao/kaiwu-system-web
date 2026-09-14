import { BellOutlined, CheckOutlined } from '@ant-design/icons';
import { history, useIntl } from '@umijs/max';
import { Badge, Button, Dropdown, Empty, Spin, Typography } from 'antd';
import { useCallback, useEffect, useState } from 'react';
import DictTag from '@/components/DictTag';
import {
  markAllNotificationsRead,
  markNotificationRead,
  queryNotificationSummary,
  type Notification,
} from '@/services/notifications';
import { useLocaleFormatters } from '@/utils/format';
import { safeInternalPath } from '@/utils/navigation';

/** 未读数轮询间隔；站内信不是实时通道，60 秒足够且不给后端压力。 */
const POLL_INTERVAL_MS = 60_000;

/**
 * 站内信入口。
 *
 * @param compact 侧边栏底部使用的紧凑形态（32×32）；默认是顶栏用的 40×44。
 */
export default function NotificationBell({ compact = false }: { compact?: boolean }) {
  const intl = useIntl();
  const format = useLocaleFormatters();
  const [unread, setUnread] = useState(0);
  const [recent, setRecent] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const summary = await queryNotificationSummary();
      setUnread(summary.unreadCount);
      setRecent(summary.recent ?? []);
    } catch {
      // 站内信不可用时铃铛保持静默，不打断主流程。
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), POLL_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [load]);

  const openItem = async (item: Notification) => {
    setOpen(false);
    try {
      await markNotificationRead(item.id);
    } catch {
      // 标记失败不影响跳转。
    }
    void load();
    history.push(safeInternalPath(item.linkUrl) ?? '/notifications');
  };

  const readAll = async () => {
    await markAllNotificationsRead();
    await load();
  };

  return (
    <Dropdown
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) void load();
      }}
      // 紧凑形态在侧边栏底部，需向上弹出，否则面板会被裁在视口外。
      placement={compact ? 'topLeft' : 'bottomRight'}
      trigger={['click']}
      popupRender={() => (
        <div
          style={{
            width: 340,
            background: '#fff',
            borderRadius: 10,
            boxShadow: '0 6px 24px rgba(0,0,0,0.12)',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '10px 14px',
              borderBottom: '1px solid #f0f0f0',
            }}
          >
            <span style={{ fontWeight: 500, fontSize: 14 }}>
              {intl.formatMessage({ id: 'layout.notification.unread' })}
              {unread > 0 ? ` · ${unread}` : ''}
            </span>
            {unread > 0 && (
              <Button
                type="link"
                size="small"
                icon={<CheckOutlined />}
                onClick={() => void readAll()}
              >
                {intl.formatMessage({ id: 'layout.notification.readAll' })}
              </Button>
            )}
          </div>

          <Spin spinning={loading}>
            {recent.length === 0 ? (
              <div style={{ padding: '20px 0' }}>
                <Empty
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                  description={intl.formatMessage({ id: 'layout.notification.empty' })}
                />
              </div>
            ) : (
              <div style={{ maxHeight: 340, overflowY: 'auto' }}>
                {recent.map((item) => (
                  <div
                    key={item.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => void openItem(item)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') void openItem(item);
                    }}
                    style={{
                      padding: '10px 14px',
                      cursor: 'pointer',
                      borderBottom: '1px solid #fafafa',
                    }}
                    onMouseEnter={(event) => {
                      event.currentTarget.style.background = 'rgba(79,70,229,0.04)';
                    }}
                    onMouseLeave={(event) => {
                      event.currentTarget.style.background = 'transparent';
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        marginBottom: 2,
                      }}
                    >
                      <DictTag dictCode="notification.type" value={item.notificationType} />
                      <Typography.Text style={{ fontSize: 13, fontWeight: 500, flex: 1 }} ellipsis>
                        {item.title}
                      </Typography.Text>
                    </div>
                    {item.content && (
                      <Typography.Text
                        type="secondary"
                        style={{ fontSize: 12, display: 'block' }}
                        ellipsis
                      >
                        {item.content}
                      </Typography.Text>
                    )}
                    <Typography.Text
                      type="secondary"
                      style={{ fontSize: 11, fontVariantNumeric: 'tabular-nums' }}
                    >
                      {format.dateTime(item.createdAt)}
                    </Typography.Text>
                  </div>
                ))}
              </div>
            )}
          </Spin>

          <div
            style={{
              padding: '8px 14px',
              borderTop: '1px solid #f0f0f0',
              textAlign: 'center',
            }}
          >
            <Button
              type="link"
              size="small"
              onClick={() => {
                setOpen(false);
                history.push('/notifications');
              }}
            >
              {intl.formatMessage({ id: 'layout.notification.viewAll' })}
            </Button>
          </div>
        </div>
      )}
    >
      <div
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: compact ? 32 : 40,
          height: compact ? 32 : 44,
          flexShrink: 0,
          cursor: 'pointer',
          borderRadius: 8,
          transition: 'background 0.15s ease',
        }}
        onMouseEnter={(event) => {
          event.currentTarget.style.background = 'rgba(0,0,0,0.04)';
        }}
        onMouseLeave={(event) => {
          event.currentTarget.style.background = 'transparent';
        }}
      >
        <Badge
          count={unread}
          size="small"
          overflowCount={99}
          // 默认 offset 会让红标溢出到容器外，窄侧边栏里显得突兀；向内收一点。
          offset={compact ? [-2, 2] : undefined}
        >
          <BellOutlined style={{ fontSize: 16 }} />
        </Badge>
      </div>
    </Dropdown>
  );
}
