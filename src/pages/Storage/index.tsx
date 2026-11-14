import { ApiOutlined, PlusOutlined, QuestionCircleOutlined } from '@ant-design/icons';
import {
  ModalForm,
  PageContainer,
  ProFormDependency,
  ProFormDigit,
  ProFormSelect,
  ProFormSwitch,
  ProFormText,
  ProTable,
  type ActionType,
  type ProColumns,
} from '@ant-design/pro-components';
import { App, Button, Empty, Popconfirm, Popover, Select, Space, Tabs, Typography } from 'antd';
import { useIntl } from '@umijs/max';
import { useEffect, useMemo, useRef, useState } from 'react';
import AuthButton from '@/components/AuthButton';
import DictSelect from '@/components/DictSelect';
import DictTag from '@/components/DictTag';
import { currentUserSnapshot } from '@/services/auth';
import { queryCurrentProjects, type PlatformProject } from '@/services/projects';
import {
  bindProjectStorage,
  changeStorageBindingStatus,
  createStorageAccount,
  queryStorageAccounts,
  queryStorageBindings,
  testStorageAccount,
  updateStorageAccount,
  type ProjectStorageBinding,
  type StorageAccount,
  type StorageAccountInput,
} from '@/services/storage';
import { useLocaleFormatters } from '@/utils/format';
import './account-dialog.less';

const ALIYUN_OSS = 'ALIYUN_OSS';
const MB = 1024 * 1024;
const HALF_COL = { xs: 24, md: 12 };

function FieldLabel({ label, hint }: { label: string; hint: string }) {
  return (
    <span className="kaiwu-storage-field-label">
      {label}
      <Popover
        trigger="click"
        placement="topLeft"
        content={<div className="kaiwu-storage-field-help">{hint}</div>}
      >
        <Button
          type="text"
          size="small"
          className="kaiwu-storage-help-button"
          icon={<QuestionCircleOutlined />}
          aria-label={hint}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
          }}
        />
      </Popover>
    </span>
  );
}

type BindFormValues = {
  projectId: string;
  storageName: string;
  accountId: string;
  maxObjectMb: number;
  allowedContentTypes?: string[];
};

/**
 * 对象存储（ADR 0039）：登记存储账号、把项目绑定到账号。
 * 长期密钥只在保存时提交，页面永远拿不到明文或密文。
 */
export default function StoragePage() {
  const { message } = App.useApp();
  const intl = useIntl();
  const format = useLocaleFormatters();
  const permissions = currentUserSnapshot()?.permissions ?? [];
  const t = (id: string, values?: Record<string, string | number>) =>
    intl.formatMessage({ id }, values);

  const accountActionRef = useRef<ActionType>();
  const bindingActionRef = useRef<ActionType>();
  const [accounts, setAccounts] = useState<StorageAccount[]>([]);
  const [accountsLoaded, setAccountsLoaded] = useState(false);
  const [projects, setProjects] = useState<PlatformProject[]>([]);
  const [projectFilter, setProjectFilter] = useState<string>();
  const [editing, setEditing] = useState<StorageAccount>();
  const [accountFormOpen, setAccountFormOpen] = useState(false);
  const [bindFormOpen, setBindFormOpen] = useState(false);
  const [testingId, setTestingId] = useState<string>();

  useEffect(() => {
    void queryCurrentProjects().then((items) =>
      setProjects(items.filter((item) => !item.builtIn && item.status === 'ACTIVE')),
    );
  }, []);

  const projectOptions = useMemo(
    () =>
      projects.map((project) => ({
        value: project.id,
        label: `${project.projectName}（${project.projectCode}）`,
      })),
    [projects],
  );
  const accountOptions = useMemo(
    () =>
      accounts
        .filter((account) => account.enabled)
        .map((account) => ({
          value: account.id,
          label: `${account.accountName}（${account.bucket}）`,
        })),
    [accounts],
  );

  const onTest = async (account: StorageAccount) => {
    setTestingId(account.id);
    try {
      const result = await testStorageAccount(account.id);
      if (result.success) {
        void message.success(t('storage.account.testSuccess', { latency: result.latencyMs }));
      } else {
        void message.error(t('storage.account.testFailed', { message: result.message }));
      }
      accountActionRef.current?.reload();
    } finally {
      setTestingId(undefined);
    }
  };

  const onChangeStatus = async (binding: ProjectStorageBinding, status: string) => {
    try {
      await changeStorageBindingStatus(binding.id, status);
      void message.success(t('storage.binding.statusUpdated'));
      bindingActionRef.current?.reload();
    } catch (error) {
      void message.error(error instanceof Error ? error.message : String(error));
    }
  };

  const accountColumns: ProColumns<StorageAccount>[] = [
    {
      title: t('storage.account.name'),
      render: (_, account) => (
        <Space direction="vertical" size={0}>
          <Typography.Text strong>{account.accountName}</Typography.Text>
          <Typography.Text type="secondary">{account.accountCode}</Typography.Text>
        </Space>
      ),
    },
    {
      title: t('storage.account.providerType'),
      width: 140,
      render: (_, account) => (
        <DictTag dictCode="storage.provider.type" value={account.providerType} />
      ),
    },
    {
      title: t('storage.account.bucket'),
      ellipsis: true,
      render: (_, account) => (
        <Space direction="vertical" size={0}>
          <Typography.Text>{account.bucket}</Typography.Text>
          <Typography.Text type="secondary" ellipsis>
            {account.endpoint}
          </Typography.Text>
        </Space>
      ),
    },
    {
      title: t('storage.account.enabled'),
      width: 90,
      render: (_, account) => (
        <DictTag dictCode="common.boolean_enabled" value={account.enabled ? 'true' : 'false'} />
      ),
    },
    {
      title: t('storage.account.bindingCount'),
      dataIndex: 'bindingCount',
      width: 90,
    },
    {
      title: t('storage.account.lastTest'),
      width: 200,
      render: (_, account) =>
        account.lastTestStatus ? (
          <Space direction="vertical" size={0}>
            <DictTag dictCode="ai.test.status" value={account.lastTestStatus} />
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              {format.dateTime(account.lastTestAt)}
            </Typography.Text>
          </Space>
        ) : (
          '-'
        ),
    },
    {
      title: t('storage.actions'),
      valueType: 'option',
      width: 170,
      render: (_, account) => (
        <Space>
          <AuthButton
            type="link"
            size="small"
            permission="system:storage:save"
            permissions={permissions}
            onClick={() => {
              setEditing(account);
              setAccountFormOpen(true);
            }}
          >
            {t('common.edit')}
          </AuthButton>
          <AuthButton
            type="link"
            size="small"
            icon={<ApiOutlined />}
            permission="system:storage:test"
            permissions={permissions}
            loading={testingId === account.id}
            onClick={() => void onTest(account)}
          >
            {t('storage.account.test')}
          </AuthButton>
        </Space>
      ),
    },
  ];

  const bindingColumns: ProColumns<ProjectStorageBinding>[] = [
    {
      title: t('storage.binding.project'),
      render: (_, binding) => (
        <Space direction="vertical" size={0}>
          <Typography.Text strong>{binding.projectName}</Typography.Text>
          <Typography.Text type="secondary">{binding.projectCode}</Typography.Text>
        </Space>
      ),
    },
    { title: t('storage.binding.storageName'), dataIndex: 'storageName', width: 110 },
    {
      title: t('storage.binding.account'),
      ellipsis: true,
      render: (_, binding) => (
        <Space direction="vertical" size={0}>
          <Typography.Text>{binding.accountName}</Typography.Text>
          <Typography.Text type="secondary">{binding.bucket}</Typography.Text>
        </Space>
      ),
    },
    {
      title: t('storage.binding.status'),
      width: 90,
      render: (_, binding) => <DictTag dictCode="storage.binding.status" value={binding.status} />,
    },
    {
      title: t('storage.binding.prefix'),
      width: 150,
      render: (_, binding) => <Typography.Text code>{`${binding.projectCode}/`}</Typography.Text>,
    },
    {
      title: t('storage.binding.maxObjectSize'),
      width: 120,
      render: (_, binding) => (
        <span style={{ fontVariantNumeric: 'tabular-nums' }}>
          {Math.round((binding.maxObjectBytes / MB) * 10) / 10}
        </span>
      ),
    },
    {
      title: t('storage.binding.contentTypes'),
      ellipsis: true,
      render: (_, binding) =>
        binding.allowedContentTypes.length > 0
          ? binding.allowedContentTypes.join(', ')
          : t('storage.binding.contentTypesAll'),
    },
    {
      title: t('storage.binding.storageRef'),
      width: 120,
      render: (_, binding) => (
        <Typography.Text type="secondary" copyable={{ text: binding.id }}>
          {`…${binding.id.slice(-6)}`}
        </Typography.Text>
      ),
    },
    {
      title: t('storage.binding.createdAt'),
      width: 170,
      render: (_, binding) => format.dateTime(binding.createdAt),
    },
    {
      title: t('storage.actions'),
      valueType: 'option',
      width: 190,
      render: (_, binding) => (
        <Space size={0}>
          {binding.status !== 'ACTIVE' && (
            <AuthButton
              type="link"
              size="small"
              permission="system:storage:save"
              permissions={permissions}
              onClick={() => void onChangeStatus(binding, 'ACTIVE')}
            >
              {t('storage.binding.makeActive')}
            </AuthButton>
          )}
          {binding.status !== 'READ_ONLY' && (
            <AuthButton
              type="link"
              size="small"
              permission="system:storage:save"
              permissions={permissions}
              onClick={() => void onChangeStatus(binding, 'READ_ONLY')}
            >
              {t('storage.binding.makeReadOnly')}
            </AuthButton>
          )}
          {binding.status !== 'DISABLED' && (
            <Popconfirm
              title={t('storage.binding.disableConfirm')}
              onConfirm={() => onChangeStatus(binding, 'DISABLED')}
            >
              <AuthButton
                type="link"
                size="small"
                danger
                permission="system:storage:save"
                permissions={permissions}
              >
                {t('storage.binding.disable')}
              </AuthButton>
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ];

  return (
    <PageContainer title={t('storage.title')} subTitle={t('storage.subtitle')}>
      <Tabs
        items={[
          {
            key: 'accounts',
            label: t('storage.tab.accounts'),
            children: (
              <ProTable<StorageAccount>
                scroll={{ x: 850 }}
                rowKey="id"
                actionRef={accountActionRef}
                columns={accountColumns}
                search={false}
                pagination={false}
                options={{ reload: true, density: false, setting: false }}
                request={async () => {
                  const data = await queryStorageAccounts();
                  setAccounts(data);
                  setAccountsLoaded(true);
                  return { data, success: true };
                }}
                locale={{
                  emptyText: (
                    <Empty description={t('storage.account.empty')}>
                      {accountsLoaded && (
                        <AuthButton
                          type="primary"
                          icon={<PlusOutlined />}
                          permission="system:storage:save"
                          permissions={permissions}
                          onClick={() => {
                            setEditing(undefined);
                            setAccountFormOpen(true);
                          }}
                        >
                          {t('storage.account.add')}
                        </AuthButton>
                      )}
                    </Empty>
                  ),
                }}
                toolBarRender={() =>
                  accountsLoaded && accounts.length === 0
                    ? []
                    : [
                        <AuthButton
                          key="create"
                          type="primary"
                          icon={<PlusOutlined />}
                          permission="system:storage:save"
                          permissions={permissions}
                          onClick={() => {
                            setEditing(undefined);
                            setAccountFormOpen(true);
                          }}
                        >
                          {t('storage.account.add')}
                        </AuthButton>,
                      ]
                }
              />
            ),
          },
          {
            key: 'bindings',
            label: t('storage.tab.bindings'),
            children: (
              <ProTable<ProjectStorageBinding>
                scroll={{ x: 900 }}
                rowKey="id"
                actionRef={bindingActionRef}
                columns={bindingColumns}
                search={false}
                pagination={false}
                options={{ reload: true, density: false, setting: false }}
                params={{ projectFilter }}
                request={async () => ({
                  data: await queryStorageBindings(projectFilter),
                  success: true,
                })}
                locale={{ emptyText: <Empty description={t('storage.binding.empty')} /> }}
                toolbar={{
                  title: (
                    <Select
                      allowClear
                      showSearch
                      optionFilterProp="label"
                      value={projectFilter}
                      options={projectOptions}
                      placeholder={t('storage.binding.allProjects')}
                      style={{ width: 260 }}
                      onChange={setProjectFilter}
                    />
                  ),
                }}
                toolBarRender={() => [
                  <AuthButton
                    key="bind"
                    type="primary"
                    icon={<PlusOutlined />}
                    permission="system:storage:save"
                    permissions={permissions}
                    onClick={() => setBindFormOpen(true)}
                  >
                    {t('storage.binding.add')}
                  </AuthButton>,
                ]}
              />
            ),
          },
        ]}
      />

      <ModalForm<StorageAccountInput>
        key={editing?.id ?? 'new'}
        title={t(editing ? 'storage.account.edit' : 'storage.account.add')}
        open={accountFormOpen}
        onOpenChange={setAccountFormOpen}
        width={760}
        modalProps={{
          destroyOnClose: true,
          centered: true,
          className: 'kaiwu-storage-account-dialog',
        }}
        grid
        rowProps={{ gutter: [16, 0] }}
        initialValues={
          editing
            ? { ...editing, accessKeyId: undefined }
            : {
                providerType: ALIYUN_OSS,
                pathStyle: false,
                credentialTtlSeconds: 1800,
                enabled: true,
              }
        }
        onFinish={async (values) => {
          try {
            if (editing) {
              await updateStorageAccount(editing.id, values);
            } else {
              await createStorageAccount(values);
            }
            void message.success(t('storage.account.saved'));
            accountActionRef.current?.reload();
            return true;
          } catch (error) {
            // ModalForm 会吞掉 onFinish 的异常，必须显式提示，否则表单静默失败。
            void message.error(error instanceof Error ? error.message : String(error));
            return false;
          }
        }}
      >
        <ProFormText
          name="accountName"
          label={t('storage.account.name')}
          colProps={HALF_COL}
          rules={[{ required: true }]}
        />
        <ProFormText
          name="accountCode"
          label={t('storage.account.code')}
          colProps={HALF_COL}
          disabled={Boolean(editing)}
          rules={[{ required: true, pattern: /^[a-z0-9][a-z0-9-]{1,63}$/ }]}
        />
        <DictSelect
          name="providerType"
          dictCode="storage.provider.type"
          label={t('storage.account.providerType')}
          colProps={HALF_COL}
          rules={[{ required: true }]}
        />
        <ProFormText
          name="bucket"
          fieldProps={{ 'aria-label': t('storage.account.bucket') }}
          label={
            <FieldLabel
              label={t('storage.account.bucket')}
              hint={t('storage.account.bucketHint')}
            />
          }
          colProps={HALF_COL}
          rules={[{ required: true }]}
        />
        <ProFormDependency name={['providerType']}>
          {({ providerType }) => (
            <ProFormText
              name="endpoint"
              fieldProps={{ 'aria-label': t('storage.account.endpoint') }}
              label={
                providerType === ALIYUN_OSS ? (
                  <FieldLabel
                    label={t('storage.account.endpoint')}
                    hint={t('storage.account.aliyunHint')}
                  />
                ) : (
                  t('storage.account.endpoint')
                )
              }
              colProps={{ xs: 24 }}
              rules={[{ required: true, type: 'url' }]}
            />
          )}
        </ProFormDependency>
        <ProFormText
          name="stsEndpoint"
          fieldProps={{ 'aria-label': t('storage.account.stsEndpoint') }}
          label={
            <FieldLabel
              label={t('storage.account.stsEndpoint')}
              hint={t('storage.account.stsEndpointHint')}
            />
          }
          colProps={HALF_COL}
          rules={[{ required: true, type: 'url' }]}
        />
        <ProFormText
          name="region"
          fieldProps={{ 'aria-label': t('storage.account.region') }}
          label={
            <FieldLabel
              label={t('storage.account.region')}
              hint={t('storage.account.regionHint')}
            />
          }
          colProps={HALF_COL}
          rules={[{ required: true }]}
        />
        <ProFormDependency name={['providerType']}>
          {({ providerType }) => (
            <>
              <ProFormText
                name="roleArn"
                fieldProps={{ 'aria-label': t('storage.account.roleArn') }}
                label={
                  <FieldLabel
                    label={t('storage.account.roleArn')}
                    hint={t('storage.account.roleArnHint')}
                  />
                }
                colProps={HALF_COL}
                rules={[{ required: providerType === ALIYUN_OSS }]}
              />
              <ProFormSwitch
                name="pathStyle"
                label={t('storage.account.pathStyle')}
                colProps={HALF_COL}
                disabled={providerType === ALIYUN_OSS}
              />
            </>
          )}
        </ProFormDependency>
        <ProFormText
          name="accessKeyId"
          label={t('storage.account.accessKeyId')}
          colProps={HALF_COL}
          rules={[{ required: !editing }]}
          placeholder={editing?.accessKeyIdMasked}
        />
        <ProFormText.Password
          name="accessKeySecret"
          label={t('storage.account.accessKeySecret')}
          colProps={HALF_COL}
          rules={[{ required: !editing }]}
          placeholder={editing?.secretConfigured ? t('storage.account.secretKeep') : undefined}
          fieldProps={{ autoComplete: 'new-password' }}
        />
        <ProFormDigit
          name="credentialTtlSeconds"
          label={t('storage.account.ttl')}
          colProps={HALF_COL}
          min={900}
          max={3600}
          fieldProps={{ precision: 0 }}
        />
        <ProFormSwitch name="enabled" label={t('storage.account.enabled')} colProps={HALF_COL} />
      </ModalForm>

      <ModalForm<BindFormValues>
        title={t('storage.binding.add')}
        open={bindFormOpen}
        onOpenChange={setBindFormOpen}
        modalProps={{ destroyOnClose: true }}
        initialValues={{ storageName: 'default', maxObjectMb: 20, projectId: projectFilter }}
        onFinish={async (values) => {
          try {
            await bindProjectStorage({
              projectId: values.projectId,
              storageName: values.storageName,
              accountId: values.accountId,
              maxObjectBytes: Math.round(values.maxObjectMb * MB),
              allowedContentTypes: values.allowedContentTypes ?? [],
            });
            void message.success(t('storage.binding.saved'));
            bindingActionRef.current?.reload();
            accountActionRef.current?.reload();
            return true;
          } catch (error) {
            void message.error(error instanceof Error ? error.message : String(error));
            return false;
          }
        }}
      >
        <ProFormSelect
          name="projectId"
          label={t('storage.binding.project')}
          options={projectOptions}
          showSearch
          rules={[{ required: true }]}
        />
        <ProFormText
          name="storageName"
          label={t('storage.binding.storageName')}
          rules={[{ required: true, pattern: /^[a-z0-9][a-z0-9_-]{0,31}$/ }]}
        />
        <ProFormSelect
          name="accountId"
          label={t('storage.binding.account')}
          options={accountOptions}
          rules={[{ required: true }]}
          extra={t('storage.binding.switchHint')}
        />
        <ProFormDigit
          name="maxObjectMb"
          label={t('storage.binding.maxObjectSize')}
          min={1}
          max={5120}
          rules={[{ required: true }]}
        />
        <ProFormSelect
          name="allowedContentTypes"
          label={t('storage.binding.contentTypes')}
          mode="tags"
          placeholder={t('storage.binding.contentTypesPlaceholder')}
        />
      </ModalForm>
    </PageContainer>
  );
}
