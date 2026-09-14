import { DownloadOutlined, ExportOutlined, PlusOutlined, UploadOutlined } from '@ant-design/icons';
import {
  ModalForm,
  PageContainer,
  ProFormText,
  ProTable,
  type ActionType,
  type ProColumns,
} from '@ant-design/pro-components';
import { App, Button, Empty, Modal, Popconfirm, Space, Typography, Upload } from 'antd';
import { useEffect, useRef, useState } from 'react';
import { useIntl } from '@umijs/max';
import AuthButton from '@/components/AuthButton';
import DictTag from '@/components/DictTag';
import { queryCurrentUser, type CurrentUser } from '@/services/auth';
import {
  createUser,
  batchUpdateUserStatus,
  downloadUserImportTemplate,
  exportUsers,
  importUsers,
  queryUsers,
  resetUserPassword,
  updateUser,
  updateUserStatus,
  type PlatformUser,
  type UserCreateInput,
  type UserUpdateInput,
} from '@/services/users';
import { useLocaleFormatters } from '@/utils/format';
import { resolveApiMessage } from '@/utils/apiMessage';

type ResetPasswordForm = {
  newPassword: string;
  confirmPassword: string;
};

export default function UsersPage() {
  const { message } = App.useApp();
  const intl = useIntl();
  const format = useLocaleFormatters();
  const actionRef = useRef<ActionType>();
  // 记录列表最近一次的筛选值，让导出与当前列表结果一致；用 ref 避免多余渲染。
  const lastKeywordRef = useRef<string | undefined>(undefined);
  const [currentUser, setCurrentUser] = useState<CurrentUser>();
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<PlatformUser>();
  const [resetting, setResetting] = useState<PlatformUser>();
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);

  useEffect(() => {
    void queryCurrentUser().then(setCurrentUser);
  }, []);

  const permissions = currentUser?.permissions ?? [];

  const changeStatus = async (user: PlatformUser) => {
    const nextStatus = user.status === 'ENABLED' ? 'DISABLED' : 'ENABLED';
    try {
      await updateUserStatus(user.id, nextStatus);
      void message.success(
        intl.formatMessage({
          id: nextStatus === 'ENABLED' ? 'users.enabled' : 'users.disabled',
        }),
      );
      actionRef.current?.reload();
    } catch (reason) {
      void message.error(
        reason instanceof Error
          ? reason.message
          : intl.formatMessage({ id: 'common.operationFailed' }),
      );
    }
  };

  const changeSelectedStatus = async (status: 'ENABLED' | 'DISABLED') => {
    await batchUpdateUserStatus(selectedRowKeys.map(String), status);
    void message.success(
      intl.formatMessage({
        id: status === 'ENABLED' ? 'users.selectedEnabled' : 'users.selectedDisabled',
      }),
    );
    setSelectedRowKeys([]);
    actionRef.current?.reload();
  };

  const columns: ProColumns<PlatformUser>[] = [
    {
      title: intl.formatMessage({ id: 'users.username' }),
      dataIndex: 'keyword',
      hideInTable: true,
      fieldProps: { placeholder: intl.formatMessage({ id: 'users.searchPlaceholder' }) },
    },
    {
      title: intl.formatMessage({ id: 'users.user' }),
      search: false,
      render: (_, record) => (
        <Space direction="vertical" size={0}>
          <Typography.Text strong>{record.displayName}</Typography.Text>
          <Typography.Text
            type="secondary"
            style={{
              fontSize: 12,
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
            }}
          >
            @{record.username}
          </Typography.Text>
        </Space>
      ),
    },
    {
      title: intl.formatMessage({ id: 'users.email' }),
      dataIndex: 'email',
      search: false,
      ellipsis: true,
      renderText: (value) => value || '-',
    },
    {
      title: intl.formatMessage({ id: 'users.status' }),
      dataIndex: 'status',
      search: false,
      width: 90,
      render: (_, record) => <DictTag dictCode="user.status" value={record.status} />,
    },
    {
      title: intl.formatMessage({ id: 'users.createdAt' }),
      dataIndex: 'createdAt',
      valueType: 'dateTime',
      width: 170,
      search: false,
      render: (_, record) =>
        record.createdAt ? (
          <Typography.Text style={{ fontSize: 12, fontVariantNumeric: 'tabular-nums' }}>
            {format.dateTime(record.createdAt)}
          </Typography.Text>
        ) : (
          '-'
        ),
    },
    {
      title: intl.formatMessage({ id: 'users.actions' }),
      valueType: 'option',
      render: (_, record) => (
        <Space>
          <AuthButton
            type="link"
            size="small"
            permission="system:user:update"
            permissions={permissions}
            onClick={() => setEditing(record)}
          >
            {intl.formatMessage({ id: 'common.edit' })}
          </AuthButton>
          <AuthButton
            type="link"
            size="small"
            permission="system:user:reset-password"
            permissions={permissions}
            disabled={record.id === currentUser?.id}
            onClick={() => setResetting(record)}
          >
            {intl.formatMessage({ id: 'users.resetPassword' })}
          </AuthButton>
          <Popconfirm
            title={intl.formatMessage({
              id: record.status === 'ENABLED' ? 'users.disableConfirm' : 'users.enableConfirm',
            })}
            onConfirm={() => void changeStatus(record)}
            disabled={!permissions.includes('system:user:status') || record.id === currentUser?.id}
          >
            <AuthButton
              type="link"
              size="small"
              danger={record.status === 'ENABLED'}
              permission="system:user:status"
              permissions={permissions}
              disabled={
                !permissions.includes('system:user:status') || record.id === currentUser?.id
              }
            >
              {intl.formatMessage({
                id: record.status === 'ENABLED' ? 'common.disable' : 'common.enable',
              })}
            </AuthButton>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <PageContainer
      title={intl.formatMessage({ id: 'users.title' })}
      subTitle={intl.formatMessage({ id: 'users.subtitle' })}
    >
      <ProTable<PlatformUser>
        sticky
        rowKey="id"
        actionRef={actionRef}
        columns={columns}
        request={async (params) => {
          lastKeywordRef.current = params.keyword as string | undefined;
          const page = await queryUsers({
            current: params.current,
            pageSize: params.pageSize,
            keyword: params.keyword as string | undefined,
          });
          return { data: page.records, total: page.total, success: true };
        }}
        search={{ labelWidth: 'auto' }}
        pagination={{ defaultPageSize: 10 }}
        options={{ reload: true, density: false, setting: false, fullScreen: false }}
        rowSelection={{
          selectedRowKeys,
          onChange: setSelectedRowKeys,
          getCheckboxProps: (record) => ({ disabled: record.id === currentUser?.id }),
        }}
        tableAlertRender={({ selectedRowKeys: keys }) => (
          <Space>
            {intl.formatMessage({ id: 'common.selectedCount' }, { count: keys.length })}
            <Button type="link" onClick={() => setSelectedRowKeys([])}>
              {intl.formatMessage({ id: 'common.clearSelection' })}
            </Button>
          </Space>
        )}
        tableAlertOptionRender={() => (
          <Space>
            <AuthButton
              type="link"
              permission="system:user:status"
              permissions={permissions}
              onClick={() => void changeSelectedStatus('ENABLED')}
            >
              {intl.formatMessage({ id: 'users.batchEnable' })}
            </AuthButton>
            <Popconfirm
              title={intl.formatMessage({ id: 'users.batchDisableConfirm' })}
              onConfirm={() => void changeSelectedStatus('DISABLED')}
            >
              <AuthButton
                danger
                type="link"
                permission="system:user:status"
                permissions={permissions}
              >
                {intl.formatMessage({ id: 'users.batchDisable' })}
              </AuthButton>
            </Popconfirm>
          </Space>
        )}
        locale={{
          emptyText: (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description={intl.formatMessage({ id: 'users.empty' })}
            />
          ),
        }}
        toolBarRender={() => [
          <AuthButton
            key="template"
            icon={<DownloadOutlined />}
            permission="system:user:create"
            permissions={permissions}
            onClick={() => void downloadUserImportTemplate()}
          >
            {intl.formatMessage({ id: 'users.downloadTemplate' })}
          </AuthButton>,
          <Upload
            key="import"
            accept=".xlsx"
            showUploadList={false}
            customRequest={async ({ file, onSuccess, onError }) => {
              try {
                const result = await importUsers(file as File);
                if (result.failed > 0) {
                  Modal.warning({
                    title: intl.formatMessage(
                      { id: 'users.importResult' },
                      { succeeded: result.succeeded, failed: result.failed },
                    ),
                    width: 680,
                    content: (
                      <div style={{ maxHeight: 320, overflow: 'auto' }}>
                        {result.errors.map((error) => (
                          <div key={`${error.rowNumber}-${error.username}`}>
                            {intl.formatMessage(
                              { id: 'users.importErrorRow' },
                              {
                                row: error.rowNumber,
                                username: error.username || '-',
                                message: resolveApiMessage(error),
                              },
                            )}
                          </div>
                        ))}
                      </div>
                    ),
                  });
                } else {
                  void message.success(
                    intl.formatMessage({ id: 'users.imported' }, { count: result.succeeded }),
                  );
                }
                actionRef.current?.reload();
                onSuccess?.(result);
              } catch (reason) {
                void message.error(
                  reason instanceof Error
                    ? reason.message
                    : intl.formatMessage({ id: 'users.importFailed' }),
                );
                onError?.(reason as Error);
              }
            }}
          >
            <AuthButton
              icon={<UploadOutlined />}
              permission="system:user:create"
              permissions={permissions}
            >
              {intl.formatMessage({ id: 'users.excelImport' })}
            </AuthButton>
          </Upload>,
          <AuthButton
            key="export"
            icon={<ExportOutlined />}
            permission="system:user:list"
            permissions={permissions}
            onClick={async () => {
              try {
                await exportUsers(lastKeywordRef.current);
              } catch (reason) {
                // 超出导出上限时后端返回 400，必须提示用户，不能只丢进控制台。
                void message.error(
                  reason instanceof Error
                    ? reason.message
                    : intl.formatMessage({ id: 'users.exportFailed' }),
                );
              }
            }}
          >
            {intl.formatMessage({ id: 'users.export' })}
          </AuthButton>,
          <AuthButton
            key="create"
            type="primary"
            icon={<PlusOutlined />}
            permission="system:user:create"
            permissions={permissions}
            onClick={() => setCreateOpen(true)}
          >
            {intl.formatMessage({ id: 'users.create' })}
          </AuthButton>,
        ]}
      />

      <ModalForm<UserCreateInput>
        grid
        rowProps={{ gutter: 16 }}
        width={640}
        title={intl.formatMessage({ id: 'users.create' })}
        open={createOpen}
        modalProps={{ destroyOnHidden: true, onCancel: () => setCreateOpen(false) }}
        onFinish={async (values) => {
          try {
            await createUser(values);
            void message.success(intl.formatMessage({ id: 'users.created' }));
            setCreateOpen(false);
            actionRef.current?.reload();
            return true;
          } catch (error) {
            // ProForm 会吞掉 onFinish 的异常，必须在此显式提示，否则表单静默失败。
            void message.error(error instanceof Error ? error.message : String(error));
            return false;
          }
        }}
      >
        <ProFormText
          colProps={{ span: 12 }}
          name="username"
          label={intl.formatMessage({ id: 'users.username' })}
          rules={[{ required: true }]}
        />
        <ProFormText
          colProps={{ span: 12 }}
          name="displayName"
          label={intl.formatMessage({ id: 'users.displayName' })}
          rules={[{ required: true }]}
        />
        <ProFormText
          colProps={{ span: 12 }}
          name="email"
          label={intl.formatMessage({ id: 'users.email' })}
          rules={[{ type: 'email' }]}
        />
        <ProFormText.Password
          colProps={{ span: 12 }}
          name="password"
          label={intl.formatMessage({ id: 'users.initialPassword' })}
          rules={[{ required: true, min: 8, max: 72 }]}
        />
      </ModalForm>

      <ModalForm<UserUpdateInput>
        key={editing?.id ?? 'edit-user'}
        title={intl.formatMessage(
          { id: 'users.editTitle' },
          {
            suffix: editing
              ? intl.formatMessage({ id: 'users.titleSuffix' }, { username: editing.username })
              : '',
          },
        )}
        open={Boolean(editing)}
        initialValues={editing}
        modalProps={{ destroyOnHidden: true, onCancel: () => setEditing(undefined) }}
        onFinish={async (values) => {
          try {
            if (!editing) return false;
            await updateUser(editing.id, values);
            void message.success(intl.formatMessage({ id: 'users.updated' }));
            setEditing(undefined);
            actionRef.current?.reload();
            return true;
          } catch (error) {
            // ProForm 会吞掉 onFinish 的异常，必须在此显式提示，否则表单静默失败。
            void message.error(error instanceof Error ? error.message : String(error));
            return false;
          }
        }}
      >
        <ProFormText
          colProps={{ span: 12 }}
          name="displayName"
          label={intl.formatMessage({ id: 'users.displayName' })}
          rules={[{ required: true }]}
        />
        <ProFormText
          colProps={{ span: 12 }}
          name="email"
          label={intl.formatMessage({ id: 'users.email' })}
          rules={[{ type: 'email' }]}
        />
      </ModalForm>

      <ModalForm<ResetPasswordForm>
        key={resetting?.id ?? 'reset-password'}
        title={intl.formatMessage(
          { id: 'users.resetTitle' },
          {
            suffix: resetting
              ? intl.formatMessage({ id: 'users.titleSuffix' }, { username: resetting.username })
              : '',
          },
        )}
        open={Boolean(resetting)}
        modalProps={{ destroyOnHidden: true, onCancel: () => setResetting(undefined) }}
        onFinish={async (values) => {
          try {
            if (!resetting) return false;
            if (values.newPassword !== values.confirmPassword) {
              void message.error(intl.formatMessage({ id: 'users.passwordMismatch' }));
              return false;
            }
            await resetUserPassword(resetting.id, values.newPassword);
            void message.success(intl.formatMessage({ id: 'users.passwordReset' }));
            setResetting(undefined);
            return true;
          } catch (error) {
            // ProForm 会吞掉 onFinish 的异常，必须在此显式提示，否则表单静默失败。
            void message.error(error instanceof Error ? error.message : String(error));
            return false;
          }
        }}
      >
        <ProFormText.Password
          colProps={{ span: 12 }}
          name="newPassword"
          label={intl.formatMessage({ id: 'users.newPassword' })}
          rules={[{ required: true, min: 8, max: 72 }]}
        />
        <ProFormText.Password
          colProps={{ span: 12 }}
          name="confirmPassword"
          label={intl.formatMessage({ id: 'users.confirmPassword' })}
          rules={[{ required: true, min: 8, max: 72 }]}
        />
      </ModalForm>
    </PageContainer>
  );
}
