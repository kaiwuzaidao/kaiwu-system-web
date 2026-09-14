import { ApiOutlined, KeyOutlined } from '@ant-design/icons';
import {
  PageContainer,
  ProCard,
  ProDescriptions,
  ProForm,
  ProFormSwitch,
  ProFormText,
} from '@ant-design/pro-components';
import { Alert, App, Col, Row, Space, Tag, Typography } from 'antd';
import { useIntl } from '@umijs/max';
import { useEffect, useState } from 'react';
import AuthButton from '@/components/AuthButton';
import DictTag from '@/components/DictTag';
import { useLocaleFormatters } from '@/utils/format';
import { currentUserSnapshot } from '@/services/auth';
import {
  queryGitlabConfig,
  saveGitlabConfig,
  testGitlabConfig,
  type GitlabConfig,
  type GitlabConfigSaveInput,
} from '@/services/gitlab';

/** 表单在左栏内的响应式列宽：窄屏单列，中屏起两列。与大模型配置页保持一致。 */
const HALF_COL = { xs: 24, md: 12 };

export default function GitlabConfigPage() {
  const { message } = App.useApp();
  const intl = useIntl();
  const format = useLocaleFormatters();
  const permissions = currentUserSnapshot()?.permissions ?? [];
  const [config, setConfig] = useState<GitlabConfig>();
  const [testing, setTesting] = useState(false);

  const load = async () => setConfig(await queryGitlabConfig());

  useEffect(() => {
    void load();
  }, []);

  const onTest = async () => {
    setTesting(true);
    try {
      const result = await testGitlabConfig();
      if (result.success) {
        void message.success(result.message);
      } else {
        // 原实现对失败也弹绿色成功提示；失败详情交给运行状态里的结果 Alert。
        void message.error(intl.formatMessage({ id: 'ai.testFailed' }));
      }
      await load();
    } finally {
      setTesting(false);
    }
  };

  return (
    <PageContainer
      title={intl.formatMessage({ id: 'gitlab.title' })}
      subTitle={intl.formatMessage({ id: 'gitlab.subtitle' })}
    >
      {/* 左表单右状态：与大模型配置页同一套骨架，避免两个受管配置页各一种排版。 */}
      <Row gutter={[16, 16]}>
        <Col xs={24} xl={16}>
          <ProCard
            title={intl.formatMessage({ id: 'gitlab.managed' })}
            bordered={false}
            headerBordered={false}
          >
            <ProForm<GitlabConfigSaveInput>
              // key 只跟随已保存的地址：带上 lastTestAt 会让"测试"后表单整体重挂载，
              // 把用户尚未保存的输入清回旧值。
              key={config?.baseUrl ?? 'new'}
              grid
              rowProps={{ gutter: [16, 0] }}
              initialValues={{
                baseUrl: config?.baseUrl,
                defaultGroupId: config?.defaultGroupId,
                enabled: config?.enabled ?? true,
              }}
              submitter={{
                render: (_, dom) => (
                  <Space style={{ marginTop: 8 }}>
                    {permissions.includes('system:git:save') ? dom[1] : null}
                    <AuthButton
                      icon={<ApiOutlined />}
                      permission="system:git:test"
                      permissions={permissions}
                      loading={testing}
                      onClick={() => void onTest()}
                    >
                      {intl.formatMessage({ id: 'gitlab.testSaved' })}
                    </AuthButton>
                  </Space>
                ),
              }}
              onFinish={async (values) => {
                try {
                  setConfig(await saveGitlabConfig(values));
                  void message.success(intl.formatMessage({ id: 'gitlab.saved' }));
                  return true;
                } catch (error) {
                  // ProForm 会吞掉 onFinish 的异常，必须在此显式提示，否则表单静默失败。
                  void message.error(error instanceof Error ? error.message : String(error));
                  return false;
                }
              }}
            >
              <ProFormText
                name="baseUrl"
                label={intl.formatMessage({ id: 'gitlab.baseUrl' })}
                tooltip={intl.formatMessage({ id: 'gitlab.baseUrlHint' })}
                colProps={HALF_COL}
                placeholder={intl.formatMessage({ id: 'gitlab.baseUrlPlaceholder' })}
                rules={[
                  { required: true },
                  { type: 'url', message: intl.formatMessage({ id: 'gitlab.urlRule' }) },
                ]}
              />
              <ProFormText
                name="defaultGroupId"
                label={intl.formatMessage({ id: 'gitlab.group' })}
                tooltip={intl.formatMessage({ id: 'gitlab.groupHint' })}
                colProps={HALF_COL}
                placeholder={intl.formatMessage({ id: 'gitlab.groupPlaceholder' })}
                extra={intl.formatMessage({ id: 'gitlab.groupExtra' })}
              />
              <ProFormText.Password
                name="token"
                label={intl.formatMessage(
                  { id: 'gitlab.token' },
                  {
                    state: intl.formatMessage({
                      id: config?.tokenConfigured ? 'ai.configured' : 'ai.notConfigured',
                    }),
                  },
                )}
                tooltip={intl.formatMessage({ id: 'gitlab.tokenHint' })}
                colProps={HALF_COL}
                placeholder={intl.formatMessage({ id: 'gitlab.tokenPlaceholder' })}
                extra={intl.formatMessage({ id: 'gitlab.tokenExtra' })}
              />
              {config?.tokenConfigured && (
                <ProFormSwitch
                  name="clearToken"
                  label={intl.formatMessage({ id: 'gitlab.clearToken' })}
                  colProps={HALF_COL}
                />
              )}
              <ProFormSwitch
                name="enabled"
                label={intl.formatMessage({ id: 'gitlab.enable' })}
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
              <ProDescriptions.Item label={intl.formatMessage({ id: 'gitlab.apiToken' })}>
                {config?.tokenConfigured ? (
                  <Tag color="success" icon={<KeyOutlined />} style={{ margin: 0 }}>
                    {intl.formatMessage({ id: 'ai.configured' })}
                  </Tag>
                ) : (
                  <Tag color="default" icon={<KeyOutlined />} style={{ margin: 0 }}>
                    {intl.formatMessage({ id: 'ai.notConfigured' })}
                  </Tag>
                )}
              </ProDescriptions.Item>
              <ProDescriptions.Item label={intl.formatMessage({ id: 'gitlab.defaultGroup' })}>
                {config?.defaultGroupId ? (
                  <Typography.Text
                    copyable={{ text: config.defaultGroupId }}
                    style={{
                      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                    }}
                  >
                    {config.defaultGroupId}
                  </Typography.Text>
                ) : (
                  '-'
                )}
              </ProDescriptions.Item>
              <ProDescriptions.Item label={intl.formatMessage({ id: 'config.recentTest' })}>
                <DictTag dictCode="gitlab.test.status" value={config?.lastTestStatus} />
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
