import { LockOutlined } from '@ant-design/icons';
import { useIntl } from '@umijs/max';
import { ProForm, ProFormText } from '@ant-design/pro-components';
import { Alert, App, Form, Modal } from 'antd';
import { useState } from 'react';
import { changePassword, clearMustChangePassword, currentUserSnapshot } from '@/services/auth';

type PasswordForm = {
  oldPassword: string;
  newPassword: string;
  confirmPassword: string;
};

/**
 * 首次登录或管理员重置后的强制改密弹窗。
 *
 * <p>用不可关闭的 Modal 而不是重定向到个人中心：后者对用户是静默的——点菜单像是没反应，
 * 实际是被挡了回来，看不出原因。弹窗把"必须先改密码"这件事直接说清楚。
 */
export default function ForcePasswordChange() {
  const { message } = App.useApp();
  const intl = useIntl();
  const [form] = Form.useForm<PasswordForm>();
  const [done, setDone] = useState(false);
  const required = Boolean(currentUserSnapshot()?.mustChangePassword);

  if (!required || done) {
    return null;
  }

  const submit = async (values: PasswordForm) => {
    try {
      await changePassword(values);
      clearMustChangePassword();
      setDone(true);
      void message.success(intl.formatMessage({ id: 'password.force.success' }));
      return true;
    } catch (reason) {
      void message.error(
        reason instanceof Error
          ? reason.message
          : intl.formatMessage({ id: 'password.force.failure' }),
      );
      return false;
    }
  };

  return (
    <Modal
      open
      title={intl.formatMessage({ id: 'password.force.title' })}
      // 不给关闭入口：这是必须完成的一步，留出口等于没做强制。
      closable={false}
      maskClosable={false}
      keyboard={false}
      footer={null}
      width={460}
    >
      <Alert
        type="warning"
        showIcon
        style={{ marginBottom: 20 }}
        message={intl.formatMessage({ id: 'password.force.alertTitle' })}
        description={intl.formatMessage({ id: 'password.force.alertDescription' })}
      />
      <ProForm<PasswordForm>
        form={form}
        layout="vertical"
        onFinish={submit}
        submitter={{
          searchConfig: { submitText: intl.formatMessage({ id: 'password.force.submit' }) },
          resetButtonProps: false,
          submitButtonProps: { block: true },
        }}
      >
        <ProFormText.Password
          name="oldPassword"
          label={intl.formatMessage({ id: 'password.current' })}
          fieldProps={{ prefix: <LockOutlined />, autoComplete: 'current-password' }}
          rules={[
            {
              required: true,
              message: intl.formatMessage({ id: 'password.current.required' }),
            },
          ]}
        />
        <ProFormText.Password
          name="newPassword"
          label={intl.formatMessage({ id: 'password.new' })}
          extra={intl.formatMessage({ id: 'password.new.extra' })}
          fieldProps={{ prefix: <LockOutlined />, autoComplete: 'new-password' }}
          rules={[
            { required: true, message: intl.formatMessage({ id: 'password.new.required' }) },
            {
              min: 8,
              max: 72,
              message: intl.formatMessage({ id: 'password.new.length' }),
            },
          ]}
        />
        <ProFormText.Password
          name="confirmPassword"
          label={intl.formatMessage({ id: 'password.confirm' })}
          dependencies={['newPassword']}
          fieldProps={{ prefix: <LockOutlined />, autoComplete: 'new-password' }}
          rules={[
            {
              required: true,
              message: intl.formatMessage({ id: 'password.confirm.required' }),
            },
            ({ getFieldValue }) => ({
              validator(_, value) {
                return !value || getFieldValue('newPassword') === value
                  ? Promise.resolve()
                  : Promise.reject(
                      new Error(intl.formatMessage({ id: 'password.confirm.mismatch' })),
                    );
              },
            }),
          ]}
        />
      </ProForm>
    </Modal>
  );
}
