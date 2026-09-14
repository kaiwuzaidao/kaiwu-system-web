import { CheckOutlined } from '@ant-design/icons';
import {
  PageContainer,
  ProTable,
  type ActionType,
  type ProColumns,
} from '@ant-design/pro-components';
import { history, useIntl } from '@umijs/max';
import { App, Button, Empty, Segmented, Select, Space, Typography } from 'antd';
import { useRef, useState } from 'react';
import DictTag from '@/components/DictTag';
import { useDict } from '@/hooks/useDict';
import {
  markAllNotificationsRead,
  markNotificationRead,
  queryNotifications,
  type Notification,
} from '@/services/notifications';
import { safeInternalPath } from '@/utils/navigation';
import { useLocaleFormatters } from '@/utils/format';

export default function NotificationsPage() {
  const { message } = App.useApp();
  const intl = useIntl();
  const format = useLocaleFormatters();
  const actionRef = useRef<ActionType>();
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [type, setType] = useState<string>();
  const { options: typeOptions } = useDict('notification.type');

  const open = async (item: Notification) => {
    if (!item.readAt) {
      try {
        await markNotificationRead(item.id);
      } catch {
        // 标记失败不影响跳转。
      }
    }
    const target = safeInternalPath(item.linkUrl);
    if (target) {
      history.push(target);
    } else {
      actionRef.current?.reload();
    }
  };

  const columns: ProColumns<Notification>[] = [
    {
      title: intl.formatMessage({ id: 'notifications.type' }),
      dataIndex: 'notificationType',
      width: 100,
      render: (_, row) => <DictTag dictCode="notification.type" value={row.notificationType} />,
    },
    {
      title: intl.formatMessage({ id: 'notifications.message' }),
      render: (_, row) => (
        <Space direction="vertical" size={0}>
          <Typography.Text strong={!row.readAt}>{row.title}</Typography.Text>
          {row.content && (
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              {row.content}
            </Typography.Text>
          )}
        </Space>
      ),
    },
    {
      title: intl.formatMessage({ id: 'notifications.source' }),
      dataIndex: 'projectCode',
      width: 140,
      render: (_, row) =>
        row.projectCode ? (
          <Typography.Text
            style={{
              fontSize: 12,
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
            }}
          >
            {row.projectCode}
          </Typography.Text>
        ) : (
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {intl.formatMessage({ id: 'notifications.platform' })}
          </Typography.Text>
        ),
    },
    {
      title: intl.formatMessage({ id: 'notifications.status' }),
      width: 80,
      render: (_, row) =>
        row.readAt ? (
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {intl.formatMessage({ id: 'notifications.read' })}
          </Typography.Text>
        ) : (
          <Typography.Text style={{ fontSize: 12, color: '#4f46e5' }}>
            {intl.formatMessage({ id: 'notifications.unread' })}
          </Typography.Text>
        ),
    },
    {
      title: intl.formatMessage({ id: 'notifications.time' }),
      dataIndex: 'createdAt',
      width: 170,
      render: (_, row) => (
        <Typography.Text style={{ fontSize: 12, fontVariantNumeric: 'tabular-nums' }}>
          {format.dateTime(row.createdAt)}
        </Typography.Text>
      ),
    },
    {
      title: intl.formatMessage({ id: 'notifications.actions' }),
      valueType: 'option',
      width: 100,
      render: (_, row) => [
        <Button key="open" type="link" size="small" onClick={() => void open(row)}>
          {intl.formatMessage({
            id: row.linkUrl ? 'notifications.view' : 'notifications.markRead',
          })}
        </Button>,
      ],
    },
  ];

  return (
    <PageContainer
      title={intl.formatMessage({ id: 'notifications.title' })}
      subTitle={intl.formatMessage({ id: 'notifications.subtitle' })}
    >
      <ProTable<Notification>
        sticky
        rowKey="id"
        actionRef={actionRef}
        columns={columns}
        search={false}
        options={{ reload: true, density: false, setting: false, fullScreen: false }}
        params={{ unreadOnly, type }}
        request={async (params) => {
          const page = await queryNotifications({
            current: params.current,
            pageSize: params.pageSize,
            unreadOnly,
            type,
          });
          return { data: page.records, total: page.total, success: true };
        }}
        pagination={{ defaultPageSize: 10, showSizeChanger: false }}
        rowClassName={(row) => (row.readAt ? '' : 'kaiwu-unread-row')}
        locale={{
          emptyText: (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description={intl.formatMessage({
                id: unreadOnly || type ? 'notifications.emptyFiltered' : 'notifications.empty',
              })}
            />
          ),
        }}
        toolbar={{
          title: (
            <Space size={12}>
              <Segmented
                value={unreadOnly ? 'unread' : 'all'}
                onChange={(value) => {
                  setUnreadOnly(value === 'unread');
                  actionRef.current?.reload();
                }}
                options={[
                  { label: intl.formatMessage({ id: 'notifications.all' }), value: 'all' },
                  { label: intl.formatMessage({ id: 'notifications.unread' }), value: 'unread' },
                ]}
              />
              <Select
                allowClear
                placeholder={intl.formatMessage({ id: 'notifications.allTypes' })}
                value={type}
                onChange={(value) => {
                  setType(value);
                  actionRef.current?.reload();
                }}
                style={{ width: 140 }}
                options={typeOptions.map((option) => ({
                  label: option.label,
                  value: option.value,
                }))}
              />
            </Space>
          ),
        }}
        toolBarRender={() => [
          <Button
            key="read-all"
            icon={<CheckOutlined />}
            onClick={async () => {
              const count = await markAllNotificationsRead();
              void message.success(
                count > 0
                  ? intl.formatMessage({ id: 'notifications.markedCount' }, { count })
                  : intl.formatMessage({ id: 'notifications.noUnread' }),
              );
              actionRef.current?.reload();
            }}
          >
            {intl.formatMessage({ id: 'notifications.markAll' })}
          </Button>,
        ]}
      />
    </PageContainer>
  );
}
