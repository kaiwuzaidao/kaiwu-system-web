import {
  AppstoreOutlined,
  DeploymentUnitOutlined,
  SearchOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { history, useIntl } from '@umijs/max';
import { Button, Empty, Input, List, Modal, Space, Tag, Typography } from 'antd';
import { useEffect, useState } from 'react';
import { globalSearch, type SearchItem } from '@/services/search';
import LineIcon from '@/components/LineIcon';
import { kaiwuPalette } from '@/theme/tokens';

const ICONS = {
  PROJECT: <AppstoreOutlined />,
  USER: <UserOutlined />,
  DELIVERY: <DeploymentUnitOutlined />,
};

const LABEL_KEYS = {
  PROJECT: 'layout.search.type.project',
  USER: 'layout.search.type.user',
  DELIVERY: 'layout.search.type.delivery',
};

/**
 * 全局搜索入口。
 *
 * @param block 侧边栏底部使用的全宽条形态；默认是顶栏用的紧凑图标按钮。
 *              侧边栏只有 216px，图标按钮挤在一行会把用户名压到换行。
 */
export default function GlobalSearch({
  block = false,
  active = true,
}: {
  block?: boolean;
  active?: boolean;
}) {
  const intl = useIntl();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<SearchItem[]>([]);

  useEffect(() => {
    if (!active) {
      setOpen(false);
      return;
    }
    const handler = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [active]);

  useEffect(() => {
    if (!open || query.trim().length < 2) {
      setItems([]);
      return;
    }
    const timer = window.setTimeout(async () => {
      setLoading(true);
      try {
        setItems(await globalSearch(query.trim()));
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => window.clearTimeout(timer);
  }, [open, query]);

  return (
    <>
      {block ? (
        <div
          className="kaiwu-global-search"
          role="button"
          tabIndex={0}
          aria-label={intl.formatMessage({ id: 'layout.search.aria' })}
          onClick={() => setOpen(true)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              setOpen(true);
            }
          }}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            height: 32,
            padding: '0 8px',
            borderRadius: 8,
            cursor: 'pointer',
            color: kaiwuPalette.textTertiary,
            fontSize: 13,
            transition: 'background 0.15s ease',
          }}
          onMouseEnter={(event) => {
            event.currentTarget.style.background = 'rgba(0,0,0,0.04)';
          }}
          onMouseLeave={(event) => {
            event.currentTarget.style.background = 'transparent';
          }}
        >
          <LineIcon name="search" size={15} />
          <span style={{ flex: 1, minWidth: 0 }}>
            {intl.formatMessage({ id: 'layout.search.jump' })}
          </span>
          <span
            style={{
              fontSize: 12,
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
            }}
          >
            ⌘ K
          </span>
        </div>
      ) : (
        <Button
          type="text"
          icon={<SearchOutlined />}
          onClick={() => setOpen(true)}
          aria-label={intl.formatMessage({ id: 'layout.search.aria' })}
        >
          <span style={{ color: kaiwuPalette.textTertiary, fontSize: 12 }}>⌘K</span>
        </Button>
      )}
      <Modal
        title={intl.formatMessage({ id: 'layout.search.title' })}
        open={open}
        footer={null}
        width={680}
        destroyOnHidden
        onCancel={() => {
          setOpen(false);
          setQuery('');
        }}
      >
        <Input
          autoFocus
          size="large"
          prefix={<SearchOutlined />}
          placeholder={intl.formatMessage({ id: 'layout.search.placeholder' })}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <List
          style={{ marginTop: 16, minHeight: 180 }}
          loading={loading}
          dataSource={items}
          locale={{
            emptyText:
              query.trim().length < 2 ? (
                <Typography.Text type="secondary">
                  {intl.formatMessage({ id: 'layout.search.prompt' })}
                </Typography.Text>
              ) : (
                <Empty
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                  description={intl.formatMessage({ id: 'layout.search.empty' })}
                />
              ),
          }}
          renderItem={(item) => (
            <List.Item
              style={{ cursor: 'pointer', borderRadius: 8, paddingInline: 12 }}
              onClick={() => {
                history.push(item.path);
                setOpen(false);
                setQuery('');
              }}
            >
              <List.Item.Meta
                avatar={ICONS[item.type]}
                title={
                  <Space>
                    <span>{item.title}</span>
                    <Tag>{intl.formatMessage({ id: LABEL_KEYS[item.type] })}</Tag>
                  </Space>
                }
                description={item.subtitle}
              />
            </List.Item>
          )}
        />
      </Modal>
    </>
  );
}
