import {
  IdcardOutlined,
  KeyOutlined,
  LockOutlined,
  MailOutlined,
  SafetyCertificateOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { PageContainer, ProDescriptions, ProForm, ProFormText } from '@ant-design/pro-components';
import { history, useIntl } from '@umijs/max';
import { Alert, App, Card, Col, Form, Row, Space, Tag, Typography } from 'antd';
import { useEffect, useMemo, useState } from 'react';
import LanguageSwitcher from '@/components/LanguageSwitcher';
import {
  changePassword,
  clearMustChangePassword,
  queryCurrentUser,
  type CurrentUser,
} from '@/services/auth';

type PasswordForm = {
  oldPassword: string;
  newPassword: string;
  confirmPassword: string;
};

function groupPermissions(permissions: string[]) {
  const map = new Map<string, string[]>();
  for (const code of permissions) {
    const [group] = code.split(':');
    const key = group || 'other';
    const list = map.get(key) ?? [];
    list.push(code);
    map.set(key, list);
  }
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, list]) => ({ key, list: list.sort() }));
}

export default function ProfilePage() {
  const { message } = App.useApp();
  const intl = useIntl();
  const [user, setUser] = useState<CurrentUser>();
  const [loading, setLoading] = useState(true);
  const [passwordForm] = Form.useForm<PasswordForm>();

  const submitPassword = async (values: PasswordForm) => {
    try {
      await changePassword(values);
      passwordForm.resetFields();
      // 主动改密同样清除强制标记：强制场景由全局弹窗处理，这里只是兜底。
      clearMustChangePassword();
      void message.success(intl.formatMessage({ id: 'profile.passwordChanged' }));
      return true;
    } catch (reason) {
      void message.error(
        reason instanceof Error
          ? reason.message
          : intl.formatMessage({ id: 'profile.passwordFailed' }),
      );
      return false;
    }
  };

  useEffect(() => {
    void queryCurrentUser()
      .then(setUser)
      .finally(() => setLoading(false));
  }, []);

  const groups = useMemo(() => groupPermissions(user?.permissions ?? []), [user?.permissions]);

  const initial = user?.displayName?.[0] ?? user?.username?.[0] ?? <UserOutlined />;

  return (
    <PageContainer
      header={{ title: null, breadcrumb: {} }}
      style={{ background: 'transparent' }}
      loading={loading}
    >
      <div
        style={{
          borderRadius: 12,
          padding: '28px 32px',
          marginBottom: 16,
          background: 'linear-gradient(120deg, #4f46e5 0%, #6d5bef 40%, #7c3aed 100%)',
          color: '#fff',
          display: 'flex',
          alignItems: 'center',
          gap: 20,
          boxShadow: '0 12px 28px rgba(79,70,229,0.22)',
        }}
      >
        <div
          style={{
            width: 64,
            height: 64,
            borderRadius: 16,
            background: 'rgba(255,255,255,0.18)',
            border: '1px solid rgba(255,255,255,0.28)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 26,
            fontWeight: 600,
          }}
        >
          {initial}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 22, fontWeight: 600 }}>{user?.displayName ?? '-'}</div>
          <div style={{ marginTop: 4, opacity: 0.86, fontSize: 13 }}>
            @{user?.username ?? '-'} ·{' '}
            {intl.formatMessage(
              { id: 'profile.permissionCount' },
              { count: user?.permissions.length ?? 0 },
            )}
          </div>
        </div>
      </div>

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={10}>
          <Card
            title={intl.formatMessage({ id: 'profile.account' })}
            extra={<LanguageSwitcher />}
            variant="borderless"
            styles={{ header: { borderBottom: 'none', paddingBottom: 0 } }}
          >
            <ProDescriptions column={1} colon={false} size="small">
              <ProDescriptions.Item
                label={
                  <Space size={6}>
                    <UserOutlined /> {intl.formatMessage({ id: 'profile.displayName' })}
                  </Space>
                }
              >
                {user?.displayName ?? '-'}
              </ProDescriptions.Item>
              <ProDescriptions.Item
                label={
                  <Space size={6}>
                    <IdcardOutlined /> {intl.formatMessage({ id: 'profile.username' })}
                  </Space>
                }
              >
                {user?.username ?? '-'}
              </ProDescriptions.Item>
              <ProDescriptions.Item
                label={
                  <Space size={6}>
                    <MailOutlined /> {intl.formatMessage({ id: 'profile.userId' })}
                  </Space>
                }
              >
                <Typography.Text copyable={Boolean(user?.id)} style={{ fontSize: 12 }}>
                  {user?.id ?? '-'}
                </Typography.Text>
              </ProDescriptions.Item>
            </ProDescriptions>
            <Alert
              type="info"
              showIcon
              style={{ marginTop: 16 }}
              message={intl.formatMessage({ id: 'profile.editHint' })}
              description={
                <a onClick={() => history.push('/users')}>
                  {intl.formatMessage({ id: 'profile.openUsers' })}
                </a>
              }
            />
          </Card>

          <Card
            title={
              <Space>
                <LockOutlined />
                {intl.formatMessage({ id: 'profile.changePassword' })}
              </Space>
            }
            variant="borderless"
            style={{ marginTop: 16 }}
            styles={{ header: { borderBottom: 'none', paddingBottom: 0 } }}
          >
            <Alert
              type="info"
              showIcon
              style={{ marginBottom: 16 }}
              message={intl.formatMessage({ id: 'profile.passwordHint' })}
            />
            <ProForm<PasswordForm>
              form={passwordForm}
              layout="vertical"
              onFinish={submitPassword}
              submitter={{
                searchConfig: { submitText: intl.formatMessage({ id: 'profile.passwordSubmit' }) },
                resetButtonProps: false,
              }}
            >
              <ProFormText.Password
                colProps={{ span: 12 }}
                name="oldPassword"
                label={intl.formatMessage({ id: 'profile.currentPassword' })}
                fieldProps={{
                  prefix: <LockOutlined />,
                  autoComplete: 'current-password',
                }}
                rules={[
                  {
                    required: true,
                    message: intl.formatMessage({ id: 'profile.currentPasswordRequired' }),
                  },
                ]}
              />
              <ProFormText.Password
                colProps={{ span: 12 }}
                name="newPassword"
                label={intl.formatMessage({ id: 'profile.newPassword' })}
                extra={intl.formatMessage({ id: 'profile.newPasswordExtra' })}
                fieldProps={{
                  prefix: <LockOutlined />,
                  autoComplete: 'new-password',
                }}
                rules={[
                  {
                    required: true,
                    message: intl.formatMessage({ id: 'profile.newPasswordRequired' }),
                  },
                  {
                    min: 8,
                    max: 72,
                    message: intl.formatMessage({ id: 'profile.passwordLength' }),
                  },
                ]}
              />
              <ProFormText.Password
                colProps={{ span: 12 }}
                name="confirmPassword"
                label={intl.formatMessage({ id: 'profile.confirmPassword' })}
                dependencies={['newPassword']}
                fieldProps={{
                  prefix: <LockOutlined />,
                  autoComplete: 'new-password',
                }}
                rules={[
                  {
                    required: true,
                    message: intl.formatMessage({ id: 'profile.confirmPasswordRequired' }),
                  },
                  ({ getFieldValue }) => ({
                    validator(_, value) {
                      return !value || getFieldValue('newPassword') === value
                        ? Promise.resolve()
                        : Promise.reject(
                            new Error(intl.formatMessage({ id: 'profile.passwordMismatch' })),
                          );
                    },
                  }),
                ]}
              />
            </ProForm>
          </Card>
        </Col>

        <Col xs={24} lg={14}>
          <Card
            title={
              <Space>
                <KeyOutlined />
                {intl.formatMessage({ id: 'profile.permissions' })}
                <Typography.Text type="secondary" style={{ fontSize: 12, fontWeight: 400 }}>
                  {intl.formatMessage({ id: 'profile.permissionsHint' })}
                </Typography.Text>
              </Space>
            }
            variant="borderless"
            styles={{ header: { borderBottom: 'none', paddingBottom: 0 } }}
          >
            {groups.length === 0 ? (
              <Typography.Text type="secondary">
                {intl.formatMessage({ id: 'profile.noPermissions' })}
              </Typography.Text>
            ) : (
              <Space direction="vertical" size={16} style={{ width: '100%' }}>
                {groups.map(({ key, list }) => (
                  <div key={key}>
                    <div
                      style={{
                        fontSize: 12,
                        color: 'rgba(0,0,0,0.45)',
                        marginBottom: 8,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                      }}
                    >
                      <SafetyCertificateOutlined />
                      {['system', 'other'].includes(key)
                        ? intl.formatMessage({ id: `profile.group.${key}` })
                        : key}
                      <span>· {list.length}</span>
                    </div>
                    <Space size={[6, 6]} wrap>
                      {list.map((code) => (
                        <Tag
                          key={code}
                          style={{
                            margin: 0,
                            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                            fontSize: 12,
                            background: 'rgba(79,70,229,0.06)',
                            border: '1px solid rgba(79,70,229,0.18)',
                            color: '#4f46e5',
                          }}
                        >
                          {code}
                        </Tag>
                      ))}
                    </Space>
                  </div>
                ))}
              </Space>
            )}
          </Card>
        </Col>
      </Row>
    </PageContainer>
  );
}
