import { ApiOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons';
import { PageContainer, ProCard } from '@ant-design/pro-components';
import { useIntl } from '@umijs/max';
import {
  Alert,
  App,
  Form,
  Input,
  InputNumber,
  Modal,
  Select,
  Space,
  Switch,
  Table,
  Typography,
} from 'antd';
import { useEffect, useState } from 'react';
import AuthButton from '@/components/AuthButton';
import DictTag from '@/components/DictTag';
import { currentUserSnapshot } from '@/services/auth';
import { useLocaleFormatters } from '@/utils/format';
import {
  queryAiModels,
  queryAiModelRoutes,
  saveAiModel,
  saveAiModelRoutes,
  testAiModel,
  type AiModel,
  type AiModelRoutes,
  type AiModelSaveInput,
} from '@/services/ai';

export default function AiProviderPage() {
  const { message } = App.useApp();
  const intl = useIntl();
  const format = useLocaleFormatters();
  const t = (id: string) => intl.formatMessage({ id });
  const permissions = currentUserSnapshot()?.permissions ?? [];
  const [models, setModels] = useState<AiModel[]>([]);
  const [routes, setRoutes] = useState<AiModelRoutes>({ planModelId: null, answerModelId: null });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingRoutes, setSavingRoutes] = useState(false);
  const [testingId, setTestingId] = useState<string>();
  const [editing, setEditing] = useState<AiModel>();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form] = Form.useForm<AiModelSaveInput>();
  const baseUrl = Form.useWatch('baseUrl', form);
  const [routeForm] = Form.useForm<AiModelRoutes>();

  const load = async () => {
    const [nextModels, nextRoutes] = await Promise.all([queryAiModels(), queryAiModelRoutes()]);
    setModels(nextModels);
    setRoutes(nextRoutes);
    routeForm.setFieldsValue(nextRoutes);
  };
  useEffect(() => {
    void load()
      .catch((error) => {
        void message.error(error instanceof Error ? error.message : t('ai.loadFailed'));
      })
      .finally(() => setLoading(false));
  }, []);

  const openEditor = (model?: AiModel) => {
    setEditing(model);
    form.resetFields();
    form.setFieldsValue(
      model
        ? {
            providerName: model.providerName,
            baseUrl: model.baseUrl,
            model: model.model,
            temperature: model.temperature,
            timeoutSeconds: model.timeoutSeconds,
          }
        : { providerName: 'OpenAI Compatible', temperature: 0.2, timeoutSeconds: 60 },
    );
    setDialogOpen(true);
  };

  return (
    <PageContainer title={t('ai.title')} subTitle={t('ai.subtitle')}>
      <Space direction="vertical" size="middle" style={{ width: '100%' }}>
        <ProCard title={t('ai.modelRoutes')} bordered>
          <Typography.Paragraph type="secondary">{t('ai.modelRoutesHint')}</Typography.Paragraph>
          {!loading && !models.some((model) => model.id === '1') && (
            <Alert
              type="warning"
              showIcon
              message={t('ai.routesNeedModels')}
              style={{ marginBottom: 16 }}
            />
          )}
          <Form<AiModelRoutes>
            form={routeForm}
            layout="vertical"
            initialValues={routes}
            onFinish={async (values) => {
              setSavingRoutes(true);
              try {
                const saved = await saveAiModelRoutes({
                  planModelId: values.planModelId ?? null,
                  answerModelId: values.answerModelId ?? null,
                });
                setRoutes(saved);
                routeForm.setFieldsValue(saved);
                void message.success(t('ai.routesSaved'));
              } catch (error) {
                void message.error(error instanceof Error ? error.message : t('ai.loadFailed'));
              } finally {
                setSavingRoutes(false);
              }
            }}
          >
            <Space wrap align="start" size="middle">
              {(['planModelId', 'answerModelId'] as const).map((key) => (
                <Form.Item
                  key={key}
                  name={key}
                  label={t(key === 'planModelId' ? 'ai.planModel' : 'ai.answerModel')}
                >
                  <Select
                    allowClear
                    disabled={!permissions.includes('system:ai:save') || loading}
                    placeholder={t('ai.defaultModel')}
                    style={{ width: 260, maxWidth: '100%' }}
                    options={models.map((model) => ({
                      value: model.id,
                      label: `${model.providerName} · ${model.model}`,
                    }))}
                  />
                </Form.Item>
              ))}
              <Form.Item label=" ">
                <AuthButton
                  permission="system:ai:save"
                  permissions={permissions}
                  type="primary"
                  htmlType="submit"
                  loading={savingRoutes}
                  disabled={loading}
                >
                  {t('ai.saveRoutes')}
                </AuthButton>
              </Form.Item>
            </Space>
          </Form>
        </ProCard>
        <ProCard
          title={t('ai.models')}
          bordered
          extra={
            <AuthButton
              permission="system:ai:save"
              permissions={permissions}
              icon={<PlusOutlined />}
              type="primary"
              onClick={() => openEditor()}
            >
              {t('ai.addModel')}
            </AuthButton>
          }
        >
          <Table<AiModel>
            rowKey="id"
            dataSource={models}
            loading={loading}
            scroll={{ x: 700 }}
            locale={{ emptyText: t('ai.modelsEmpty') }}
            columns={[
              { title: t('ai.name'), dataIndex: 'providerName' },
              { title: t('ai.model'), dataIndex: 'model' },
              {
                title: t('ai.apiKeyPlain'),
                render: (_, row) => t(row.apiKeyConfigured ? 'ai.configured' : 'ai.notConfigured'),
              },
              {
                title: t('config.recentTest'),
                render: (_, row) => (
                  <Space direction="vertical" size={0}>
                    <DictTag dictCode="ai.test.status" value={row.lastTestStatus} />
                    {row.lastTestAt && (
                      <Typography.Text type="secondary">
                        {format.dateTime(row.lastTestAt)}
                      </Typography.Text>
                    )}
                    {row.lastTestMessage && (
                      <Typography.Text type="secondary">{row.lastTestMessage}</Typography.Text>
                    )}
                  </Space>
                ),
              },
              {
                title: t('org.actions'),
                render: (_, row) => (
                  <Space wrap>
                    <AuthButton
                      type="link"
                      icon={<EditOutlined />}
                      permission="system:ai:save"
                      permissions={permissions}
                      onClick={() => openEditor(row)}
                    >
                      {t('ai.editModel')}
                    </AuthButton>
                    <AuthButton
                      type="link"
                      icon={<ApiOutlined />}
                      permission="system:ai:test"
                      permissions={permissions}
                      loading={testingId === row.id}
                      disabled={Boolean(testingId)}
                      onClick={async () => {
                        setTestingId(row.id);
                        try {
                          const result = await testAiModel(row.id);
                          if (result.success)
                            void message.success(
                              intl.formatMessage(
                                { id: 'ai.testSuccess' },
                                { latency: result.latencyMs },
                              ),
                            );
                          else void message.error(result.message || t('ai.testFailed'));
                          const nextModels = await queryAiModels();
                          setModels(nextModels);
                        } catch (error) {
                          void message.error(
                            error instanceof Error ? error.message : t('ai.testFailed'),
                          );
                        } finally {
                          setTestingId(undefined);
                        }
                      }}
                    >
                      {t('ai.testModel')}
                    </AuthButton>
                  </Space>
                ),
              },
            ]}
          />
        </ProCard>
      </Space>
      <Modal
        title={t(editing ? 'ai.editModel' : 'ai.addModel')}
        open={dialogOpen}
        confirmLoading={saving}
        onCancel={() => {
          if (!saving) {
            setDialogOpen(false);
            form.resetFields();
          }
        }}
        onOk={() => form.submit()}
        destroyOnHidden
      >
        <Form<AiModelSaveInput>
          form={form}
          layout="vertical"
          onFinish={async (values) => {
            setSaving(true);
            try {
              await saveAiModel({ ...values, id: editing?.id });
              setDialogOpen(false);
              form.resetFields();
              void message.success(t('ai.modelSaved'));
              setModels(await queryAiModels());
            } catch (error) {
              void message.error(error instanceof Error ? error.message : t('ai.loadFailed'));
            } finally {
              setSaving(false);
            }
          }}
        >
          <Form.Item
            name="providerName"
            label={t('ai.name')}
            rules={[{ required: true, max: 100 }]}
          >
            <Input />
          </Form.Item>
          <Form.Item name="model" label={t('ai.model')} rules={[{ required: true, max: 128 }]}>
            <Input />
          </Form.Item>
          <Form.Item
            name="baseUrl"
            label={t('ai.baseUrl')}
            rules={[{ required: true }, { type: 'url', message: t('ai.urlRule') }]}
          >
            <Input />
          </Form.Item>
          {editing?.apiKeyConfigured &&
            baseUrl &&
            baseUrl.trim().replace(/\/+$/, '') !== editing.baseUrl.trim().replace(/\/+$/, '') && (
              <Alert
                type="warning"
                showIcon
                message={t('ai.addressChangedKeyHint')}
                style={{ marginBottom: 16 }}
              />
            )}
          <Form.Item
            name="apiKey"
            label={intl.formatMessage(
              { id: 'ai.apiKey' },
              { state: t(editing?.apiKeyConfigured ? 'ai.configured' : 'ai.notConfigured') },
            )}
          >
            <Input.Password autoComplete="new-password" placeholder={t('ai.apiKeyPlaceholder')} />
          </Form.Item>
          {editing?.apiKeyConfigured && (
            <Form.Item name="clearApiKey" label={t('ai.clearApiKey')} valuePropName="checked">
              <Switch />
            </Form.Item>
          )}
          <Space wrap align="start">
            <Form.Item name="temperature" label={t('ai.temperature')}>
              <InputNumber min={0} max={2} step={0.1} />
            </Form.Item>
            <Form.Item name="timeoutSeconds" label={t('ai.timeout')}>
              <InputNumber min={5} max={300} precision={0} />
            </Form.Item>
          </Space>
        </Form>
      </Modal>
    </PageContainer>
  );
}
