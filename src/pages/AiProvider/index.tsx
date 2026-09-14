import { ApiOutlined, KeyOutlined } from '@ant-design/icons';
import {
  PageContainer,
  ProCard,
  ProDescriptions,
  ProForm,
  ProFormDigit,
  ProFormSwitch,
  ProFormText,
} from '@ant-design/pro-components';
import { Alert, App, Col, Row, Space, Tag, Typography } from 'antd';
import { useIntl } from '@umijs/max';
import { useEffect, useState } from 'react';
import AuthButton from '@/components/AuthButton';
import DictTag from '@/components/DictTag';
import { useLocaleFormatters } from '@/utils/format';
import {
  queryAiProvider,
  saveAiProvider,
  testAiProvider,
  type AiProviderConfig,
  type AiProviderSaveInput,
} from '@/services/ai';
import { currentUserSnapshot } from '@/services/auth';

/** 表单在左栏内的响应式列宽：窄屏单列，中屏起两列。 */
const HALF_COL = { xs: 24, md: 12 };
/** 数值类短字段：窄屏也能并排。 */
const QUARTER_COL = { xs: 12, md: 6 };

export default function AiProviderPage() {
  const { message } = App.useApp();
  const intl = useIntl();
  const format = useLocaleFormatters();
  const [config, setConfig] = useState<AiProviderConfig>();
  const [testing, setTesting] = useState(false);
  const permissions = currentUserSnapshot()?.permissions ?? [];

  const load = async () => setConfig(await queryAiProvider());

  useEffect(() => {
    void load();
  }, []);

  const onTest = async () => {
    setTesting(true);
    try {
      const result = await testAiProvider();
      if (result.success) {
        void message.success(
          intl.formatMessage({ id: 'ai.testSuccess' }, { latency: result.latencyMs }),
        );
      } else {
        // 失败原因可能很长，交给运行状态里的结果 Alert 完整展示，弹窗只作提示。
        void message.error(intl.formatMessage({ id: 'ai.testFailed' }));
      }
      await load();
    } finally {
      setTesting(false);
    }
  };

  return (
    <PageContainer
      title={intl.formatMessage({ id: 'ai.title' })}
      subTitle={intl.formatMessage({ id: 'ai.subtitle' })}
    >
      {/* 左表单右状态：宽屏把横向空间用在表单上，同时让主操作按钮留在首屏。 */}
      <Row gutter={[16, 16]}>
        <Col xs={24} xl={16}>
          <ProCard
            title={intl.formatMessage({ id: 'ai.provider' })}
            bordered={false}
            headerBordered={false}
          >
            <ProForm<AiProviderSaveInput>
              // key 只跟随已保存的地址：带上 lastTestAt 会让"测试"后表单整体重挂载，
              // 把用户尚未保存的输入清回旧值。
              key={config?.baseUrl ?? 'new'}
              grid
              rowProps={{ gutter: [16, 0] }}
              initialValues={{
                providerName: config?.providerName || 'OpenAI Compatible',
                baseUrl: config?.baseUrl,
                model: config?.model,
                temperature: config?.temperature ?? 0.2,
                timeoutSeconds: config?.timeoutSeconds ?? 60,
                enabled: config?.enabled ?? true,
              }}
              submitter={{
                // dom[1] 才是提交按钮；渲染整个数组会带出默认重置按钮。
                render: (_, dom) => (
                  <Space style={{ marginTop: 8 }}>
                    {permissions.includes('system:ai:save') ? dom[1] : null}
                    <AuthButton
                      icon={<ApiOutlined />}
                      permission="system:ai:test"
                      permissions={permissions}
                      loading={testing}
                      onClick={() => void onTest()}
                    >
                      {intl.formatMessage({ id: 'ai.testSaved' })}
                    </AuthButton>
                  </Space>
                ),
              }}
              onFinish={async (values) => {
                try {
                  setConfig(await saveAiProvider(values));
                  void message.success(intl.formatMessage({ id: 'ai.saved' }));
                  return true;
                } catch (error) {
                  // ProForm 会吞掉 onFinish 的异常，必须在此显式提示，否则表单静默失败。
                  void message.error(error instanceof Error ? error.message : String(error));
                  return false;
                }
              }}
            >
              <ProFormText
                name="providerName"
                label={intl.formatMessage({ id: 'ai.name' })}
                colProps={HALF_COL}
                rules={[{ required: true }]}
                placeholder={intl.formatMessage({ id: 'ai.namePlaceholder' })}
              />
              <ProFormText
                name="model"
                label={intl.formatMessage({ id: 'ai.model' })}
                colProps={HALF_COL}
                rules={[{ required: true }]}
                placeholder={intl.formatMessage({ id: 'ai.modelPlaceholder' })}
              />
              <ProFormText
                name="baseUrl"
                label={intl.formatMessage({ id: 'ai.baseUrl' })}
                colProps={{ xs: 24 }}
                rules={[
                  { required: true },
                  { type: 'url', message: intl.formatMessage({ id: 'ai.urlRule' }) },
                ]}
                placeholder={intl.formatMessage({ id: 'ai.baseUrlPlaceholder' })}
              />
              <ProFormText.Password
                name="apiKey"
                label={intl.formatMessage(
                  { id: 'ai.apiKey' },
                  {
                    state: intl.formatMessage({
                      id: config?.apiKeyConfigured ? 'ai.configured' : 'ai.notConfigured',
                    }),
                  },
                )}
                colProps={HALF_COL}
                placeholder={intl.formatMessage({ id: 'ai.apiKeyPlaceholder' })}
              />
              {config?.apiKeyConfigured && (
                <ProFormSwitch
                  name="clearApiKey"
                  label={intl.formatMessage({ id: 'ai.clearApiKey' })}
                  colProps={HALF_COL}
                />
              )}
              <ProFormDigit
                name="temperature"
                label={intl.formatMessage({ id: 'ai.temperature' })}
                colProps={QUARTER_COL}
                min={0}
                max={2}
                fieldProps={{ step: 0.1, precision: 1 }}
              />
              <ProFormDigit
                name="timeoutSeconds"
                label={intl.formatMessage({ id: 'ai.timeout' })}
                colProps={QUARTER_COL}
                min={5}
                max={300}
                fieldProps={{ precision: 0 }}
              />
              <ProFormSwitch
                name="enabled"
                label={intl.formatMessage({ id: 'ai.enable' })}
                colProps={HALF_COL}
              />
            </ProForm>
          </ProCard>
        </Col>

        <Col xs={24} xl={8}>
          <ProCard
            title={intl.formatMessage({ id: 'config.runtime' })}
            bordered={false}
            headerBordered={false}
          >
            <ProDescriptions column={1} size="small" colon={false}>
              <ProDescriptions.Item label={intl.formatMessage({ id: 'config.enabled' })}>
                <DictTag
                  dictCode="common.boolean_enabled"
                  value={config ? String(config.enabled) : undefined}
                />
              </ProDescriptions.Item>
              <ProDescriptions.Item label={intl.formatMessage({ id: 'ai.currentModel' })}>
                {config?.model ? (
                  <Typography.Text
                    copyable={{ text: config.model }}
                    style={{
                      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                    }}
                  >
                    {config.model}
                  </Typography.Text>
                ) : (
                  '-'
                )}
              </ProDescriptions.Item>
              <ProDescriptions.Item label={intl.formatMessage({ id: 'ai.apiKeyPlain' })}>
                {config?.apiKeyConfigured ? (
                  <Tag color="success" icon={<KeyOutlined />} style={{ margin: 0 }}>
                    {intl.formatMessage({ id: 'ai.configured' })}
                  </Tag>
                ) : (
                  <Tag color="default" icon={<KeyOutlined />} style={{ margin: 0 }}>
                    {intl.formatMessage({ id: 'ai.notConfigured' })}
                  </Tag>
                )}
              </ProDescriptions.Item>
              <ProDescriptions.Item label={intl.formatMessage({ id: 'config.recentTest' })}>
                <DictTag dictCode="ai.test.status" value={config?.lastTestStatus} />
              </ProDescriptions.Item>
              <ProDescriptions.Item label={intl.formatMessage({ id: 'config.testTime' })}>
                <Typography.Text
                  style={{
                    fontSize: 13,
                    fontVariantNumeric: 'tabular-nums',
                    color: config?.lastTestAt ? undefined : 'rgba(0,0,0,0.45)',
                  }}
                >
                  {format.dateTime(config?.lastTestAt)}
                </Typography.Text>
              </ProDescriptions.Item>
            </ProDescriptions>
            {config?.lastTestMessage ? (
              // 结果文案由后端给出、状态 Tag 仍走字典，这里只按状态对齐 Alert 的严重级别。
              <Alert
                type={config.lastTestStatus === 'SUCCESS' ? 'success' : 'error'}
                showIcon
                message={config.lastTestMessage}
                style={{ marginTop: 8 }}
              />
            ) : null}
          </ProCard>
        </Col>
      </Row>
    </PageContainer>
  );
}
