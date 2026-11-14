import {
  DeleteOutlined,
  DownloadOutlined,
  EditOutlined,
  PlusOutlined,
  UploadOutlined,
} from '@ant-design/icons';
import {
  PageContainer,
  ProTable,
  type ActionType,
  type ProColumns,
} from '@ant-design/pro-components';
import {
  Alert,
  App,
  Checkbox,
  Form,
  Input,
  Modal,
  Popconfirm,
  Select,
  Space,
  Switch,
  Tag,
  Typography,
  Upload,
} from 'antd';
import { useIntl } from '@umijs/max';
import { useCallback, useEffect, useRef, useState } from 'react';
import AuthButton from '@/components/AuthButton';
import DictTag from '@/components/DictTag';
import MetadataScopePicker from '@/components/MetadataScopePicker';
import { queryCurrentUser } from '@/services/auth';
import {
  deleteI18nResource,
  exportI18nTranslations,
  importI18nTranslations,
  queryI18nLocales,
  queryI18nResources,
  saveI18nResource,
  type I18nLocale,
  type I18nResource,
} from '@/services/i18n';

type ResourceForm = Omit<I18nResource, 'translationsJson'> & {
  translations?: Record<string, string>;
};

export default function I18nResourcesPage() {
  const intl = useIntl();
  const { message } = App.useApp();
  const actionRef = useRef<ActionType>();
  const [form] = Form.useForm<ResourceForm>();
  const [userPermissions, setUserPermissions] = useState<string[]>([]);
  // 空串为平台资源；否则是业务项目 ID（ADR 0037：按项目隔离，各管各的）。
  const [projectId, setProjectId] = useState('');
  const [locales, setLocales] = useState<I18nLocale[]>([]);
  // 译文导入导出的目标语言；默认语言用原文，不参与翻译。
  const [translationLocale, setTranslationLocale] = useState('');
  const [editing, setEditing] = useState<I18nResource>();
  const [open, setOpen] = useState(false);

  // 导入译文后覆盖率会变化，语言开放状态需要重新拉取，因此提取成可复用函数。
  const loadLocales = useCallback(async () => {
    const user = await queryCurrentUser();
    setUserPermissions(user.permissions);
    setLocales(await queryI18nLocales(user.locale));
  }, []);

  useEffect(() => {
    void loadLocales();
  }, [loadLocales]);

  // 项目资源由服务端按「有效项目管理员」判定，不看平台 system:i18n:*；
  // 这里只负责让按钮可见，越权请求会被服务端拒绝。
  const permissions = projectId
    ? [...userPermissions, 'system:i18n:list', 'system:i18n:save', 'system:i18n:delete']
    : userPermissions;
  const inProject = Boolean(projectId);

  const edit = (row?: I18nResource) => {
    setEditing(row);
    let translations: Record<string, string> = {};
    try {
      translations = row?.translationsJson ? JSON.parse(row.translationsJson) : {};
    } catch {
      translations = {};
    }
    form.setFieldsValue(
      row
        ? { ...row, translations }
        : {
            moduleCode: 'common',
            publicVisible: false,
            requiredResource: !inProject,
            status: 'ENABLED',
            translations: {},
          },
    );
    setOpen(true);
  };

  const columns: ProColumns<I18nResource>[] = [
    {
      title: intl.formatMessage({ id: 'i18n.key', defaultMessage: '资源 key' }),
      dataIndex: 'messageKey',
      width: 260,
      copyable: true,
      render: (_, row) => (
        <Typography.Text code ellipsis={{ tooltip: row.messageKey }}>
          {row.messageKey}
        </Typography.Text>
      ),
    },
    {
      title: intl.formatMessage({ id: 'i18n.defaultText', defaultMessage: '默认文案（zh-CN）' }),
      dataIndex: 'defaultText',
      ellipsis: true,
    },
    {
      title: intl.formatMessage({ id: 'i18n.module', defaultMessage: '模块' }),
      dataIndex: 'moduleCode',
      width: 130,
    },
    {
      title: intl.formatMessage({ id: 'i18n.coverage', defaultMessage: '译文' }),
      width: 90,
      render: (_, row) => {
        let count = 0;
        try {
          count = Object.keys(JSON.parse(row.translationsJson ?? '{}')).length;
        } catch {
          count = 0;
        }
        return (
          <Tag>
            {count}/{Math.max(0, locales.length - 1)}
          </Tag>
        );
      },
    },
    {
      title: intl.formatMessage({ id: 'i18n.status', defaultMessage: '状态' }),
      dataIndex: 'status',
      width: 90,
      render: (_, row) => <DictTag dictCode="common.status" value={row.status} />,
    },
    {
      title: intl.formatMessage({ id: 'i18n.actions', defaultMessage: '操作' }),
      valueType: 'option',
      render: (_, row) => (
        <Space>
          <AuthButton
            type="link"
            size="small"
            icon={<EditOutlined />}
            permission="system:i18n:save"
            permissions={permissions}
            onClick={() => edit(row)}
          >
            {intl.formatMessage({ id: 'common.edit', defaultMessage: '编辑' })}
          </AuthButton>
          <Popconfirm
            title={intl.formatMessage({
              id: 'i18n.deleteConfirm',
              defaultMessage: '确定删除该资源？',
            })}
            onConfirm={async () => {
              try {
                await deleteI18nResource(row.id, row.version, projectId || undefined);
                void message.success(
                  intl.formatMessage({ id: 'common.deleted', defaultMessage: '已删除' }),
                );
                actionRef.current?.reload();
              } catch (error) {
                void message.error(error instanceof Error ? error.message : String(error));
              }
            }}
          >
            <AuthButton
              danger
              type="link"
              size="small"
              icon={<DeleteOutlined />}
              permission="system:i18n:delete"
              permissions={permissions}
            >
              {intl.formatMessage({ id: 'common.delete', defaultMessage: '删除' })}
            </AuthButton>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <PageContainer
      title={intl.formatMessage({ id: 'i18n.title', defaultMessage: '国际化资源' })}
      subTitle={intl.formatMessage({
        id: 'i18n.subtitle',
        defaultMessage: '统一维护页面与 API 文案；语言是否可选由覆盖校验决定',
      })}
    >
      <div style={{ marginBottom: 16 }}>
        <MetadataScopePicker
          value={projectId || '0'}
          fallbackToCurrentProjects
          isProjectDisabled={(project) => project.builtIn || project.status !== 'ACTIVE'}
          onChange={(value) => {
            setProjectId(value === '0' ? '' : value);
            setTimeout(() => actionRef.current?.reload(), 0);
          }}
        />
      </div>
      {inProject && (
        <Alert
          showIcon
          type="info"
          style={{ marginBottom: 16 }}
          message={intl.formatMessage({
            id: 'i18n.scopeProjectHint',
            defaultMessage: '项目文案由项目管理员维护，不参与平台语言开放校验',
          })}
        />
      )}
      {!inProject && (
        <Alert
          showIcon
          style={{ marginBottom: 16 }}
          message={intl.formatMessage({
            id: 'i18n.localeCoverage',
            defaultMessage: '语言开放状态',
          })}
          description={
            <Space wrap>
              {locales.map((item) => (
                <Tag key={item.locale} color={item.selectable ? 'green' : 'orange'}>
                  {item.label}（{item.locale}） ·{' '}
                  {item.selectable
                    ? intl.formatMessage({ id: 'i18n.available', defaultMessage: '可选择' })
                    : [
                        ...(!item.selectableConfigured
                          ? [
                              intl.formatMessage({
                                id: 'i18n.notConfigured',
                                defaultMessage: '目录未开放',
                              }),
                            ]
                          : []),
                        intl.formatMessage(
                          { id: 'i18n.missingResources', defaultMessage: '资源 {count}' },
                          { count: item.missingRequiredResources },
                        ),
                        intl.formatMessage(
                          { id: 'i18n.missingMenus', defaultMessage: '菜单 {count}' },
                          { count: item.missingMenus },
                        ),
                        intl.formatMessage(
                          { id: 'i18n.missingDictionaries', defaultMessage: '字典 {count}' },
                          { count: item.missingDictionaryItems },
                        ),
                      ].join(' / ')}
                </Tag>
              ))}
            </Space>
          }
        />
      )}
      <ProTable<I18nResource>
        sticky
        scroll={{ x: 900 }}
        rowKey="id"
        actionRef={actionRef}
        columns={columns}
        search={false}
        request={async () => ({
          data: await queryI18nResources(projectId || undefined),
          success: true,
        })}
        toolBarRender={() => [
          /* 开放新语言要求译文全覆盖，平台侧近千条无法逐条手填，
             因此提供整表导出、离线翻译、再导回的通路。 */
          <Select
            key="exportLocale"
            style={{ width: 150 }}
            value={translationLocale}
            onChange={setTranslationLocale}
            options={locales
              .filter((item) => item.locale !== 'zh-CN')
              .map((item) => ({ value: item.locale, label: item.label }))}
            placeholder={intl.formatMessage({
              id: 'i18n.selectLocale',
              defaultMessage: '选择语言',
            })}
          />,
          <AuthButton
            key="export"
            icon={<DownloadOutlined />}
            permission="system:i18n:list"
            permissions={permissions}
            disabled={!translationLocale}
            onClick={async () => {
              try {
                await exportI18nTranslations(translationLocale, projectId || undefined);
              } catch (error) {
                void message.error(error instanceof Error ? error.message : String(error));
              }
            }}
          >
            {intl.formatMessage({ id: 'i18n.exportTranslations', defaultMessage: '导出译文' })}
          </AuthButton>,
          <Upload
            key="import"
            accept=".xlsx"
            showUploadList={false}
            disabled={!translationLocale}
            customRequest={async ({
              file,
              onSuccess,
              onError,
            }: {
              file: unknown;
              onSuccess?: (body: unknown) => void;
              onError?: (error: Error) => void;
            }) => {
              try {
                const result = await importI18nTranslations(
                  translationLocale,
                  file as File,
                  projectId || undefined,
                );
                void message.success(
                  intl.formatMessage(
                    { id: 'i18n.importDone', defaultMessage: '已导入 {applied} 条译文' },
                    { applied: result.applied },
                  ),
                );
                // 失败行单独提示：整批不中断，用户据行号修正后重导即可。
                if (result.failures.length > 0) {
                  void message.warning(result.failures.join('；'), 8);
                }
                onSuccess?.(result);
                actionRef.current?.reload();
                await loadLocales();
              } catch (error) {
                void message.error(error instanceof Error ? error.message : String(error));
                onError?.(error as Error);
              }
            }}
          >
            <AuthButton
              icon={<UploadOutlined />}
              permission="system:i18n:save"
              permissions={permissions}
              disabled={!translationLocale}
            >
              {intl.formatMessage({ id: 'i18n.importTranslations', defaultMessage: '导入译文' })}
            </AuthButton>
          </Upload>,
          <AuthButton
            key="create"
            type="primary"
            icon={<PlusOutlined />}
            permission="system:i18n:save"
            permissions={permissions}
            onClick={() => edit()}
          >
            {intl.formatMessage({ id: 'i18n.create', defaultMessage: '新增资源' })}
          </AuthButton>,
        ]}
      />
      <Modal
        open={open}
        title={intl.formatMessage({
          id: editing ? 'i18n.editTitle' : 'i18n.createTitle',
          defaultMessage: editing ? '编辑国际化资源' : '新增国际化资源',
        })}
        width={760}
        destroyOnHidden
        onCancel={() => setOpen(false)}
        onOk={() =>
          void form
            .validateFields()
            .then(async (values) => {
              try {
                await saveI18nResource(
                  {
                    ...values,
                    id: editing?.id,
                    version: editing?.version,
                    translationsJson: JSON.stringify(values.translations ?? {}),
                  },
                  projectId || undefined,
                );
                void message.success(
                  intl.formatMessage({ id: 'common.saved', defaultMessage: '已保存' }),
                );
                setOpen(false);
                actionRef.current?.reload();
              } catch (error) {
                void message.error(error instanceof Error ? error.message : String(error));
              }
            })
            .catch(() => {
              /* 字段校验错误由表单展示。 */
            })
        }
      >
        <Form form={form} layout="vertical" preserve={false}>
          <Form.Item
            name="messageKey"
            label={intl.formatMessage({ id: 'i18n.key', defaultMessage: '资源 key' })}
            rules={[{ required: true }, { pattern: /^[A-Za-z][A-Za-z0-9_.:-]{1,159}$/ }]}
          >
            <Input disabled={Boolean(editing)} />
          </Form.Item>
          <Form.Item
            name="defaultText"
            label={intl.formatMessage({
              id: 'i18n.defaultText',
              defaultMessage: '默认文案（zh-CN）',
            })}
            rules={[{ required: true }]}
          >
            <Input.TextArea autoSize={{ minRows: 2, maxRows: 6 }} />
          </Form.Item>
          {locales
            .filter((item) => item.locale !== 'zh-CN')
            .map((item) => (
              <Form.Item
                key={item.locale}
                name={['translations', item.locale]}
                label={`${item.label}（${item.locale}）`}
              >
                <Input.TextArea autoSize={{ minRows: 2, maxRows: 6 }} />
              </Form.Item>
            ))}
          <Space size="large" align="start">
            <Form.Item
              name="moduleCode"
              label={intl.formatMessage({ id: 'i18n.module', defaultMessage: '模块' })}
              rules={[{ required: true }]}
            >
              <Input />
            </Form.Item>
            <Form.Item
              name="status"
              label={intl.formatMessage({ id: 'i18n.status', defaultMessage: '状态' })}
              rules={[{ required: true }]}
            >
              <Select
                style={{ width: 140 }}
                options={[{ value: 'ENABLED' }, { value: 'DISABLED' }]}
              />
            </Form.Item>
            {!inProject && (
              <Form.Item
                name="requiredResource"
                valuePropName="checked"
                label={intl.formatMessage({ id: 'i18n.required', defaultMessage: '覆盖必需' })}
              >
                <Switch />
              </Form.Item>
            )}
            {!inProject && (
              <Form.Item
                name="publicVisible"
                valuePropName="checked"
                label={intl.formatMessage({ id: 'i18n.public', defaultMessage: '登录前公开' })}
              >
                <Checkbox />
              </Form.Item>
            )}
          </Space>
          <Form.Item
            name="description"
            label={intl.formatMessage({ id: 'i18n.description', defaultMessage: '说明' })}
          >
            <Input />
          </Form.Item>
        </Form>
      </Modal>
    </PageContainer>
  );
}
