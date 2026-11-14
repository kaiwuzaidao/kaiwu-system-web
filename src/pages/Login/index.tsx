import {
  CloudUploadOutlined,
  CodeOutlined,
  DeploymentUnitOutlined,
  LockOutlined,
  SafetyCertificateOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { history, useIntl } from '@umijs/max';
import { LoginForm, ProFormText } from '@ant-design/pro-components';
import { App, Typography } from 'antd';
import { useEffect } from 'react';
import LanguageSwitcher from '@/components/LanguageSwitcher';
import {
  currentUserSnapshot,
  hasSession,
  login,
  readAndClearSessionExitReason,
} from '@/services/auth';
import { queryPublicI18nCatalog } from '@/services/i18n';
import { queryCurrentProjects } from '@/services/projects';
import { enterableProjects, enterProject, findEnterableByCode } from '@/utils/projectEntry';
import { installCatalog } from '@/i18n/runtime';
import { currentLocale } from '@/utils/locale';
import { kaiwuPalette } from '@/theme/tokens';

type LoginValues = {
  username: string;
  password: string;
};

/**
 * 读取并校验登录后的回跳地址。
 *
 * 子应用（如 /apps/order-center/...）不是本 SPA 的路由，由 nginx 反代到独立的前端，
 * 因此必须整页跳转而不是 history.replace——后者只会在 SPA 内部匹配不到路由。
 * 整页刷新是安全的：Access Token 只驻留内存，会由 HttpOnly Refresh Cookie 恢复。
 *
 * 只接受站内绝对路径。`//` 与 `/\\` 会被浏览器当作协议相对地址指向外站，
 * 是开放重定向最常见的入口，必须挡掉。
 */
function safeRedirectTarget(): string | undefined {
  if (typeof window === 'undefined') return undefined;
  const raw = new URLSearchParams(window.location.search).get('redirect');
  if (!raw || !raw.startsWith('/') || raw.startsWith('//') || raw.startsWith('/\\')) {
    return undefined;
  }
  const url = new URL(raw, window.location.origin);
  if (url.origin !== window.location.origin) return undefined;
  // 回跳到登录页本身会形成死循环。
  if (url.pathname === '/login') return undefined;
  // 子应用（/apps/<code>/...）不能作为回跳目标：它的令牌只能经 postMessage 向主站
  // 窗口索取，而整页跳转不建立 opener/parent 关系。跳回去仍是无令牌的顶层页面，
  // 立刻又 401 跳回登录页，形成无限弹跳。必须由用户从平台重新进入该应用。
  if (url.pathname.startsWith('/apps/')) return undefined;
  return `${url.pathname}${url.search}${url.hash}`;
}

/**
 * 其他项目链到登录页时带的目标项目编码（?project=<编码>）。
 *
 * 只接受形如项目编码的短字符串；它只用来在「当前用户有权访问的项目」里做相等匹配，
 * 绝不参与跳转地址拼接，所以不是开放重定向的入口。
 */
function requestedProjectCode(): string | undefined {
  if (typeof window === 'undefined') return undefined;
  const raw = new URLSearchParams(window.location.search).get('project');
  return raw && /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(raw) ? raw : undefined;
}

/**
 * 登录后去哪：
 * 1. 带 ?project=<编码> 且该项目当前用户能进入 → 直接进入该项目；不能进入 → 项目选择页并提示；
 * 2. 带合法的 redirect → 整页跳过去；
 * 3. 只有一个可进入的项目 → 直接进入；
 * 4. 否则进项目选择页。
 *
 * 自动进入一律在当前页：登录提交后的跳转不是用户手势触发，新标签页会被浏览器拦截，
 * 用户会卡在登录页，所以这里不读「打开方式」偏好。
 *
 * 需要强制改密的用户不走直达：/workspace 是不带平台布局的整屏页，改密弹窗不会出现，
 * 直达会让新用户带着初始密码进到业务后台。他们先落在会自己挂载改密弹窗的选择页。
 */
async function leaveLogin(): Promise<void> {
  const mustChange = Boolean(currentUserSnapshot()?.mustChangePassword);
  const projectCode = requestedProjectCode();
  if (projectCode && !mustChange) {
    try {
      const target = findEnterableByCode(await queryCurrentProjects(), projectCode);
      if (target) {
        enterProject(target, 'inline');
        return;
      }
    } catch {
      // 查不到项目清单时退回选择页，不把已验证的登录判为失败。
    }
    history.replace(`/select-project?denied=${encodeURIComponent(projectCode)}`);
    return;
  }
  const target = safeRedirectTarget();
  if (target && !(mustChange && target.startsWith('/workspace/'))) {
    window.location.replace(target);
    return;
  }
  if (!mustChange) {
    try {
      const entries = enterableProjects(await queryCurrentProjects());
      if (entries.length === 1) {
        enterProject(entries[0], 'inline');
        return;
      }
    } catch {
      // 查不到项目清单时退回选择页，选择页自己会提示加载失败并允许重试。
    }
  }
  history.replace('/select-project');
}

export default function LoginPage() {
  const { message } = App.useApp();
  const intl = useIntl();
  const highlights = [
    {
      icon: <SafetyCertificateOutlined />,
      label: intl.formatMessage({ id: 'login.highlight.permission' }),
    },
    {
      icon: <DeploymentUnitOutlined />,
      label: intl.formatMessage({ id: 'login.highlight.isolation' }),
    },
    { icon: <CloudUploadOutlined />, label: intl.formatMessage({ id: 'login.highlight.oneshot' }) },
  ];
  // 登录页同时承担产品说明：新访客需要一眼看懂「做什么」和「怎么开始」。
  const steps = [
    {
      icon: <DeploymentUnitOutlined />,
      title: intl.formatMessage({ id: 'login.steps.create.title' }),
      description: intl.formatMessage({ id: 'login.steps.create.description' }),
    },
    {
      icon: <CodeOutlined />,
      title: intl.formatMessage({ id: 'login.steps.generate.title' }),
      description: intl.formatMessage({ id: 'login.steps.generate.description' }),
    },
    {
      icon: <CloudUploadOutlined />,
      title: intl.formatMessage({ id: 'login.steps.deliver.title' }),
      description: intl.formatMessage({ id: 'login.steps.deliver.description' }),
    },
    {
      icon: <CodeOutlined />,
      title: intl.formatMessage({ id: 'login.steps.continue.title' }),
      description: intl.formatMessage({ id: 'login.steps.continue.description' }),
    },
  ];

  useEffect(() => {
    if (hasSession()) {
      void leaveLogin();
      return;
    }
    // 匿名 catalog 只含登录与救援文案；失败时静默保留随 Web 发布的最小救援包。
    void queryPublicI18nCatalog(currentLocale())
      .then(installCatalog)
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    const reason = readAndClearSessionExitReason();
    if (reason) {
      void message.warning(intl.formatMessage({ id: 'login.sessionExit' }, { reason }));
    }
  }, [intl, message]);

  const submit = async (values: LoginValues) => {
    try {
      await login(values.username, values.password);
      // 需要强制改密时落在项目选择页，由它挂载不可关闭的改密弹窗（见 leaveLogin）。
      // Access Token 仍只驻留内存；整页刷新由 HttpOnly Refresh Cookie 安全恢复。
      void leaveLogin();
      return true;
    } catch (reason) {
      void message.error(
        reason instanceof Error ? reason.message : intl.formatMessage({ id: 'login.failure' }),
      );
      return false;
    }
  };

  return (
    <div className="kaiwu-login">
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          color: '#fff',
          // V5：保留深色工程感，但改深海军蓝——去掉原来的紫与青绿。
          background: `linear-gradient(140deg, ${kaiwuPalette.loginDeep} 0%, ${kaiwuPalette.loginDeepAlt} 100%)`,
          minWidth: 0,
          position: 'relative',
        }}
        className="kaiwu-login-hero"
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: 12,
                background: 'rgba(255,255,255,0.18)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 700,
                fontSize: 20,
                letterSpacing: 1,
                border: '1px solid rgba(255,255,255,0.3)',
              }}
            >
              {/* i18n-ignore-next-line -- 产品字标，不是自然语言文案。 */}K
            </div>
            <div>
              {/* i18n-ignore-next-line -- 产品名称保持统一。 */}
              <div style={{ fontSize: 28, fontWeight: 600, lineHeight: 1.2 }}>Kaiwu</div>
              <div style={{ fontSize: 12, opacity: 0.8, marginTop: 2 }}>
                {intl.formatMessage({ id: 'login.brand.subtitle' })}
              </div>
            </div>
          </div>

          <div style={{ marginTop: 64 }}>
            <div style={{ fontSize: 40, fontWeight: 600, lineHeight: 1.25 }}>
              {intl.formatMessage({ id: 'login.hero.title.first' })}
              <br />
              {intl.formatMessage({ id: 'login.hero.title.second' })}
            </div>
            <div
              style={{
                marginTop: 16,
                fontSize: 14,
                lineHeight: 1.7,
                opacity: 0.85,
                maxWidth: 420,
              }}
            >
              {intl.formatMessage({ id: 'login.hero.description' })}
            </div>
          </div>

          <div style={{ marginTop: 48, maxWidth: 460 }}>
            <div
              style={{
                fontSize: 12,
                letterSpacing: 2,
                opacity: 0.7,
                textTransform: 'uppercase',
              }}
            >
              {intl.formatMessage({ id: 'login.steps.title' })}
            </div>
            <div style={{ marginTop: 20, display: 'grid', gap: 18 }}>
              {steps.map((step, index) => (
                <div
                  key={step.title}
                  style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}
                >
                  <div
                    style={{
                      width: 30,
                      height: 30,
                      flexShrink: 0,
                      borderRadius: 8,
                      background: 'rgba(255,255,255,0.16)',
                      border: '1px solid rgba(255,255,255,0.24)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 13,
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {index + 1}
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 15, fontWeight: 600, lineHeight: 1.4 }}>
                      {step.title}
                    </div>
                    <div
                      style={{
                        fontSize: 13,
                        lineHeight: 1.6,
                        opacity: 0.8,
                        marginTop: 2,
                      }}
                    >
                      {step.description}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 12,
            marginTop: 40,
          }}
        >
          {highlights.map((item) => (
            <div
              key={item.label}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '8px 14px',
                borderRadius: 999,
                background: 'rgba(255,255,255,0.14)',
                border: '1px solid rgba(255,255,255,0.22)',
                fontSize: 13,
              }}
            >
              <span style={{ opacity: 0.9 }}>{item.icon}</span>
              {item.label}
            </div>
          ))}
        </div>
      </div>

      <div
        className="kaiwu-login-form"
        style={{
          maxWidth: '100%',

          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          background: '#fff',
          position: 'relative',
        }}
      >
        <div style={{ position: 'absolute', top: 24, right: 28 }}>
          <LanguageSwitcher />
        </div>
        <div style={{ maxWidth: 400, width: '100%', margin: '0 auto' }}>
          <div style={{ marginBottom: 32 }}>
            <div style={{ fontSize: 28, fontWeight: 600 }}>
              {intl.formatMessage({ id: 'login.form.title' })}
            </div>
            <div style={{ fontSize: 13, color: kaiwuPalette.textTertiary, marginTop: 6 }}>
              {intl.formatMessage({ id: 'login.form.subtitle' })}
            </div>
          </div>
          <LoginForm<LoginValues>
            logo={null as never}
            title={null as never}
            subTitle={null as never}
            onFinish={submit}
            submitter={{
              searchConfig: { submitText: intl.formatMessage({ id: 'login.form.submit' }) },
              submitButtonProps: { size: 'large', block: true },
            }}
            contentStyle={{ width: '100%', minWidth: 0, maxWidth: '100%', padding: 0 }}
          >
            <ProFormText
              name="username"
              fieldProps={{
                size: 'large',
                prefix: <UserOutlined />,
                'aria-label': intl.formatMessage({ id: 'login.username.placeholder' }),
              }}
              placeholder={intl.formatMessage({ id: 'login.username.placeholder' })}
              rules={[
                {
                  required: true,
                  message: intl.formatMessage({ id: 'login.username.required' }),
                },
              ]}
            />
            <ProFormText.Password
              colProps={{ span: 12 }}
              name="password"
              fieldProps={{
                size: 'large',
                prefix: <LockOutlined />,
                'aria-label': intl.formatMessage({ id: 'login.password.placeholder' }),
              }}
              placeholder={intl.formatMessage({ id: 'login.password.placeholder' })}
              rules={[
                {
                  required: true,
                  message: intl.formatMessage({ id: 'login.password.required' }),
                },
              ]}
            />
          </LoginForm>
          <Typography.Paragraph
            type="secondary"
            style={{ textAlign: 'center', marginTop: 24, marginBottom: 0, fontSize: 12 }}
          >
            {intl.formatMessage({ id: 'login.footer' })}
          </Typography.Paragraph>
        </div>
      </div>
    </div>
  );
}
