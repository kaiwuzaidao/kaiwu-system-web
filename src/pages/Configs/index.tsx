import { PlusOutlined } from '@ant-design/icons';
import {
  ModalForm,
  PageContainer,
  ProFormDigit,
  ProFormSwitch,
  ProFormText,
  ProFormTextArea,
  ProTable,
  type ActionType,
  type ProColumns,
} from '@ant-design/pro-components';
import { App, Empty, Popconfirm, Space, Typography } from 'antd';
import { useIntl } from '@umijs/max';
import { useEffect, useRef, useState } from 'react';
import AuthButton from '@/components/AuthButton';
import DictSelect from '@/components/DictSelect';
import LocalizedNameField from '@/components/LocalizedNameField';
import DictTag from '@/components/DictTag';
import MetadataScopePicker from '@/components/MetadataScopePicker';
import { queryCurrentUser } from '@/services/auth';
import { referencedText } from '@/utils/referencedI18n';
import { deleteConfig, queryConfigs, saveConfig, type AppConfig } from '@/services/metadata';

export default function ConfigsPage() {
  const { message } = App.useApp();
  const intl = useIntl();
  const actionRef = useRef<ActionType>();
  const [scopeId, setScopeId] = useState('0');
  const [permissions, setPermissions] = useState<string[]>([]);
  const [editing, setEditing] = useState<AppConfig>();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    void queryCurrentUser().then((user) => {
      setPermissions(user.permissions);
    });
  }, []);

  const columns: ProColumns<AppConfig>[] = [
    {
      title: intl.formatMessage({ id: 'configs.key' }),
      dataIndex: 'configKey',
      copyable: true,
      render: (_, row) => (
        <Typography.Text
          copyable={{ text: row.configKey }}
          style={{
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
            fontSize: 13,
          }}
        >
          {row.configKey}
        </Typography.Text>
      ),
    },
    {
      title: intl.formatMessage({ id: 'configs.value' }),
      dataIndex: 'configValue',
      ellipsis: true,
      render: (_, row) =>
        row.secret ? (
          <Typography.Text type="secondary">
            <span style={{ letterSpacing: 2 }}>••••••</span>{' '}
            {intl.formatMessage({ id: 'configs.encrypted' })}
          </Typography.Text>
        ) : (
          <Typography.Text
            style={{
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
              fontSize: 13,
            }}
          >
            {referencedText(intl, row.valueI18nKey, row.configValue)}
          </Typography.Text>
        ),
    },
    {
      title: intl.formatMessage({ id: 'configs.valueType' }),
      dataIndex: 'valueType',
      width: 100,
      render: (_, row) => <DictTag dictCode="config.value.type" value={row.valueType} />,
    },
    {
      title: intl.formatMessage({ id: 'configs.status' }),
      dataIndex: 'status',
      width: 90,
      render: (_, row) => <DictTag dictCode="common.status" value={row.status} />,
    },
    {
      title: intl.formatMessage({ id: 'configs.description' }),
      dataIndex: 'description',
      ellipsis: true,
    },
    {
      title: intl.formatMessage({ id: 'configs.actions' }),
      valueType: 'option',
      render: (_, row) => (
        <Space>
          <AuthButton
            type="link"
            size="small"
            permission="system:config:save"
            permissions={permissions}
            onClick={() => {
              setEditing(row);
              setOpen(true);
            }}
          >
            {intl.formatMessage({ id: 'configs.edit' })}
          </AuthButton>
          <Popconfirm
            title={intl.formatMessage({ id: 'configs.deleteConfirm' })}
            onConfirm={async () => {
              await deleteConfig(scopeId, row.id);
              void message.success(intl.formatMessage({ id: 'configs.deleted' }));
              actionRef.current?.reload();
            }}
          >
            <AuthButton
              type="link"
              size="small"
              danger
              permission="system:config:delete"
              permissions={permissions}
            >
              {intl.formatMessage({ id: 'configs.delete' })}
            </AuthButton>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <PageContainer
      title={intl.formatMessage({ id: 'configs.title' })}
      subTitle={intl.formatMessage({ id: 'configs.subtitle' })}
    >
      <ProTable<AppConfig>
        sticky
        rowKey="id"
        actionRef={actionRef}
        columns={columns}
        search={false}
        pagination={false}
        params={{ scopeId }}
        options={{ reload: true, density: false, setting: false, fullScreen: false }}
        locale={{
          emptyText: (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description={intl.formatMessage({ id: 'configs.empty' })}
            />
          ),
        }}
        request={async () => ({
          data: await queryConfigs(scopeId),
          success: true,
        })}
        toolbar={{
          title: (
            <MetadataScopePicker
              value={scopeId}
              onChange={(value) => {
                setScopeId(value);
                actionRef.current?.reload();
              }}
            />
          ),
        }}
        toolBarRender={() => [
          <AuthButton
            key="create"
            type="primary"
            icon={<PlusOutlined />}
            permission="system:config:save"
            permissions={permissions}
            onClick={() => {
              setEditing(undefined);
              setOpen(true);
            }}
          >
            {intl.formatMessage({ id: 'configs.create' })}
          </AuthButton>,
        ]}
      />
      <ModalForm<Partial<AppConfig>>
        grid
        rowProps={{ gutter: 16 }}
        width={640}
        key={editing?.id ?? `new-config-${open}`}
        title={intl.formatMessage({ id: editing ? 'configs.editTitle' : 'configs.createTitle' })}
        open={open}
        initialValues={
          editing ?? {
            valueType: 'STRING',
            secret: false,
            status: 'ENABLED',
            sortNo: 0,
          }
        }
        modalProps={{ destroyOnHidden: true, onCancel: () => setOpen(false) }}
        onFinish={async (values) => {
          try {
            await saveConfig(scopeId, { ...values, id: editing?.id });
            void message.success(intl.formatMessage({ id: 'configs.saved' }));
            setOpen(false);
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
          name="configKey"
          label={intl.formatMessage({ id: 'configs.key' })}
          rules={[
            { required: true },
            {
              pattern: /^[A-Za-z][A-Za-z0-9_.:-]{1,127}$/,
              message: intl.formatMessage({ id: 'configs.keyRule' }),
            },
          ]}
        />
        <DictSelect
          colProps={{ span: 12 }}
          name="valueType"
          label={intl.formatMessage({ id: 'configs.valueType' })}
          dictCode="config.value.type"
          rules={[{ required: true }]}
        />
        <LocalizedNameField
          fallbackName="configValue"
          fallbackLabel={intl.formatMessage({ id: 'configs.value' })}
          fallbackTextarea
          fallbackPlaceholder={
            editing?.secret ? intl.formatMessage({ id: 'configs.secretPlaceholder' }) : undefined
          }
          keyName="valueI18nKey"
          hint={intl.formatMessage({ id: 'configs.i18nKeyHint' })}
        />
        <ProFormSwitch
          colProps={{ span: 12 }}
          name="secret"
          label={intl.formatMessage({ id: 'configs.secret' })}
          tooltip={intl.formatMessage({ id: 'configs.secretTooltip' })}
        />
        <DictSelect
          colProps={{ span: 12 }}
          name="status"
          label={intl.formatMessage({ id: 'configs.status' })}
          dictCode="common.status"
          rules={[{ required: true }]}
        />
        <ProFormDigit
          colProps={{ span: 12 }}
          name="sortNo"
          label={intl.formatMessage({ id: 'configs.sort' })}
          min={0}
          max={9999}
        />
        <ProFormTextArea
          colProps={{ span: 24 }}
          name="description"
          label={intl.formatMessage({ id: 'configs.description' })}
        />
      </ModalForm>
    </PageContainer>
  );
}
