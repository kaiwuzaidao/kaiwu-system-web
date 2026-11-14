import { DiffOutlined, DisconnectOutlined, ReloadOutlined } from '@ant-design/icons';
import {
  PageContainer,
  ProTable,
  type ActionType,
  type ProColumns,
} from '@ant-design/pro-components';
import { App, Button, Drawer, Input, Modal, Space, Table, Tabs, Typography } from 'antd';
import { useRef, useState } from 'react';
import { useIntl } from '@umijs/max';
import AuthButton from '@/components/AuthButton';
import DictTag from '@/components/DictTag';
import { useDict } from '@/hooks/useDict';
import { currentSessionId, currentUserSnapshot } from '@/services/auth';
import {
  forceOffline,
  parseFieldChanges,
  queryLoginLogs,
  queryOnlineSessions,
  queryOperationLogs,
  type FieldChange,
  type LoginLog,
  type OnlineSession,
  type OperationLog,
} from '@/services/security';
import { useLocaleFormatters } from '@/utils/format';

export default function SecurityPage() {
  const { message } = App.useApp();
  const intl = useIntl();
  const format = useLocaleFormatters();
  const permissions = currentUserSnapshot()?.permissions ?? [];
  const activeSessionId = currentSessionId();
  const operationRef = useRef<ActionType>();
  const loginRef = useRef<ActionType>();
  const sessionRef = useRef<ActionType>();
  const [offline, setOffline] = useState<OnlineSession>();
  const [reason, setReason] = useState('');
  const [diffLog, setDiffLog] = useState<OperationLog>();
  // 搜索下拉的选项同样走受管字典，避免筛选项与展示标签两套来源。
  const { options: auditModuleOptions } = useDict('security.audit.module');
  const { options: loginStatusOptions } = useDict('security.login.status');
  const { options: sessionStatusOptions } = useDict('security.session.status');
  const selectOptions = (options: { value: string; label: string }[]) =>
    options.map(({ value, label }) => ({ value, label }));
  const dateColumn = {
    title: intl.formatMessage({ id: 'security.time' }),
    dataIndex: 'createdAt',
    width: 170,
    search: false,
    render: (_: unknown, row: { createdAt?: string }) => format.dateTime(row.createdAt),
  };

  const operationColumns: ProColumns<OperationLog>[] = [
    { title: intl.formatMessage({ id: 'security.user' }), dataIndex: 'username', width: 130 },
    {
      title: intl.formatMessage({ id: 'security.module' }),
      dataIndex: 'module',
      width: 120,
      // 筛选下拉与展示标签同源，避免「筛选项写死一套、展示又是一套」。
      fieldProps: { options: selectOptions(auditModuleOptions) },
      valueType: 'select',
      render: (_, row) => <DictTag dictCode="security.audit.module" value={row.module} />,
    },
    {
      title: intl.formatMessage({ id: 'security.operation' }),
      dataIndex: 'operation',
      search: false,
      width: 170,
    },
    {
      title: intl.formatMessage({ id: 'security.request' }),
      dataIndex: 'requestPath',
      search: false,
      ellipsis: true,
    },
    {
      title: intl.formatMessage({ id: 'security.detail' }),
      dataIndex: 'detail',
      search: false,
      ellipsis: true,
    },
    {
      title: intl.formatMessage({ id: 'security.changes' }),
      valueType: 'option',
      width: 80,
      render: (_, row) => {
        // 没有字段级 diff 的操作直接留空，不渲染禁用按钮：一个灰按钮传达的是
        // 「这里本该有东西但坏了」，而实际含义是「这类操作不记录字段级变更」。
        if (!row.changeJson) {
          return <Typography.Text type="secondary">-</Typography.Text>;
        }
        return (
          <Button type="link" size="small" icon={<DiffOutlined />} onClick={() => setDiffLog(row)}>
            {intl.formatMessage({ id: 'security.view' })}
          </Button>
        );
      },
    },
    {
      title: intl.formatMessage({ id: 'security.traceId' }),
      dataIndex: 'traceId',
      search: false,
      ellipsis: true,
      width: 180,
    },
    dateColumn,
  ];

  const loginColumns: ProColumns<LoginLog>[] = [
    { title: intl.formatMessage({ id: 'security.user' }), dataIndex: 'username', width: 140 },
    {
      title: intl.formatMessage({ id: 'security.status' }),
      dataIndex: 'status',
      valueType: 'select',
      fieldProps: { options: selectOptions(loginStatusOptions) },
      width: 100,
      render: (_, row) => <DictTag dictCode="security.login.status" value={row.status} />,
    },
    {
      title: intl.formatMessage({ id: 'security.description' }),
      dataIndex: 'message',
      search: false,
      ellipsis: true,
    },
    {
      title: intl.formatMessage({ id: 'security.clientIp' }),
      dataIndex: 'clientIp',
      search: false,
      width: 140,
    },
    {
      title: intl.formatMessage({ id: 'security.traceId' }),
      dataIndex: 'traceId',
      search: false,
      ellipsis: true,
      width: 180,
    },
    dateColumn,
  ];

  const sessionColumns: ProColumns<OnlineSession>[] = [
    { title: intl.formatMessage({ id: 'security.user' }), dataIndex: 'username', width: 140 },
    {
      title: intl.formatMessage({ id: 'security.status' }),
      dataIndex: 'status',
      valueType: 'select',
      fieldProps: { options: selectOptions(sessionStatusOptions) },
      width: 100,
      render: (_, row) => <DictTag dictCode="security.session.status" value={row.status} />,
    },
    {
      title: intl.formatMessage({ id: 'security.sessionSource' }),
      dataIndex: 'sessionSource',
      search: false,
      width: 110,
      render: (_, row) => (
        <DictTag dictCode="security.session.source" value={row.sessionSource ?? 'WEB'} />
      ),
    },
    {
      title: intl.formatMessage({ id: 'security.clientName' }),
      dataIndex: 'clientName',
      search: false,
      width: 120,
      render: (_, row) => row.clientName ?? '-',
    },
    {
      title: intl.formatMessage({ id: 'security.sessionId' }),
      dataIndex: 'sessionId',
      search: false,
      ellipsis: true,
      render: (_, row) => <Typography.Text copyable>{row.sessionId}</Typography.Text>,
    },
    { ...dateColumn, title: intl.formatMessage({ id: 'security.loginTime' }) },
    {
      title: intl.formatMessage({ id: 'security.lastSeen' }),
      dataIndex: 'lastSeenAt',
      search: false,
      width: 170,
      render: (_, row) => format.dateTime(row.lastSeenAt),
    },
    {
      title: intl.formatMessage({ id: 'security.actions' }),
      valueType: 'option',
      width: 110,
      render: (_, row) => (
        <AuthButton
          danger
          type="link"
          size="small"
          icon={<DisconnectOutlined />}
          permission="system:session:force-offline"
          permissions={permissions}
          disabled={row.status !== 'ONLINE' || row.sessionId === activeSessionId}
          onClick={() => {
            setReason('');
            setOffline(row);
          }}
        >
          {intl.formatMessage({ id: 'security.forceOffline' })}
        </AuthButton>
      ),
    },
  ];

  const request =
    <T,>(
      loader: (params: Record<string, unknown>) => Promise<{
        records: T[];
        total: number;
      }>,
    ) =>
    async (params: Record<string, unknown>) => {
      const page = await loader(params);
      return { data: page.records, total: page.total, success: true };
    };

  return (
    <PageContainer
      title={intl.formatMessage({ id: 'security.title' })}
      subTitle={intl.formatMessage({ id: 'security.subtitle' })}
    >
      <Tabs
        items={[
          {
            key: 'operations',
            label: intl.formatMessage({ id: 'security.operations' }),
            children: (
              <ProTable<OperationLog>
                sticky
                rowKey="id"
                actionRef={operationRef}
                columns={operationColumns}
                request={request(queryOperationLogs)}
                pagination={{ defaultPageSize: 10 }}
              />
            ),
          },
          {
            key: 'logins',
            label: intl.formatMessage({ id: 'security.logins' }),
            children: (
              <ProTable<LoginLog>
                sticky
                rowKey="id"
                actionRef={loginRef}
                columns={loginColumns}
                request={request(queryLoginLogs)}
                pagination={{ defaultPageSize: 10 }}
              />
            ),
          },
          {
            key: 'sessions',
            label: intl.formatMessage({ id: 'security.sessions' }),
            children: (
              <ProTable<OnlineSession>
                sticky
                rowKey="sessionId"
                actionRef={sessionRef}
                columns={sessionColumns}
                request={request(queryOnlineSessions)}
                pagination={{ defaultPageSize: 10 }}
                toolBarRender={() => [
                  <Button
                    key="reload"
                    icon={<ReloadOutlined />}
                    onClick={() => sessionRef.current?.reload()}
                  >
                    {intl.formatMessage({ id: 'common.refresh' })}
                  </Button>,
                ]}
              />
            ),
          },
        ]}
      />
      <Modal
        title={intl.formatMessage(
          { id: 'security.offlineTitle' },
          { username: offline?.username ?? '' },
        )}
        open={Boolean(offline)}
        okText={intl.formatMessage({ id: 'security.offlineConfirm' })}
        okButtonProps={{ danger: true }}
        onCancel={() => setOffline(undefined)}
        onOk={async () => {
          if (!offline) return;
          try {
            await forceOffline(offline.sessionId, reason);
            void message.success(intl.formatMessage({ id: 'security.offlineSuccess' }));
            setOffline(undefined);
            sessionRef.current?.reload();
          } catch (error) {
            void message.error(error instanceof Error ? error.message : String(error));
          }
        }}
      >
        <Space direction="vertical" style={{ width: '100%' }}>
          <Typography.Text type="secondary">
            {intl.formatMessage({ id: 'security.offlineHint' })}
          </Typography.Text>
          <Input.TextArea
            value={reason}
            maxLength={200}
            showCount
            rows={3}
            placeholder={intl.formatMessage({ id: 'security.reason' })}
            onChange={(event) => setReason(event.target.value)}
          />
        </Space>
      </Modal>
      <Drawer
        title={
          diffLog
            ? intl.formatMessage(
                { id: 'security.diffOperationTitle' },
                { operation: diffLog.operation },
              )
            : intl.formatMessage({ id: 'security.diffTitle' })
        }
        width={640}
        open={Boolean(diffLog)}
        onClose={() => setDiffLog(undefined)}
        destroyOnHidden
      >
        {diffLog && <OperationDiffPanel log={diffLog} />}
      </Drawer>
    </PageContainer>
  );
}

function OperationDiffPanel({ log }: { log: OperationLog }) {
  const intl = useIntl();
  const changes = parseFieldChanges(log.changeJson);
  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Space size={16} wrap>
        {log.targetType && (
          <Typography.Text type="secondary">
            {intl.formatMessage({ id: 'security.targetType' })}
            <Typography.Text code>{log.targetType}</Typography.Text>
          </Typography.Text>
        )}
        {log.targetId && (
          <Typography.Text type="secondary">
            {intl.formatMessage({ id: 'security.targetId' })}
            <Typography.Text code copyable>
              {log.targetId}
            </Typography.Text>
          </Typography.Text>
        )}
        {log.username && (
          <Typography.Text type="secondary">
            {intl.formatMessage({ id: 'security.operator' }, { username: log.username })}
          </Typography.Text>
        )}
      </Space>
      {changes.length > 0 ? (
        <Table<FieldChange>
          sticky
          size="small"
          rowKey="field"
          pagination={false}
          dataSource={changes}
          columns={[
            { title: intl.formatMessage({ id: 'security.field' }), dataIndex: 'field', width: 160 },
            {
              title: intl.formatMessage({ id: 'security.before' }),
              dataIndex: 'before',
              render: (value: string | null) =>
                renderDiffValue(
                  value,
                  intl.formatMessage({ id: 'security.emptyValue' }),
                  intl.formatMessage({ id: 'security.nullValue' }),
                ),
            },
            {
              title: intl.formatMessage({ id: 'security.after' }),
              dataIndex: 'after',
              render: (value: string | null) =>
                renderDiffValue(
                  value,
                  intl.formatMessage({ id: 'security.emptyValue' }),
                  intl.formatMessage({ id: 'security.nullValue' }),
                ),
            },
          ]}
        />
      ) : (
        <Typography.Text type="secondary">
          {intl.formatMessage({ id: 'security.noDiff' })}
        </Typography.Text>
      )}
      {log.detail && (
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          {intl.formatMessage({ id: 'security.summary' }, { detail: log.detail })}
        </Typography.Text>
      )}
    </Space>
  );
}

function renderDiffValue(value: string | null, emptyText: string, nullText: string) {
  if (value === null || value === undefined) {
    return <Typography.Text type="secondary">{nullText}</Typography.Text>;
  }
  if (value === '') {
    return <Typography.Text type="secondary">{emptyText}</Typography.Text>;
  }
  return <Typography.Text>{value}</Typography.Text>;
}
