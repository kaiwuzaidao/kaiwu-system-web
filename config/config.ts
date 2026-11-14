import { defineConfig } from '@umijs/max';
import { kaiwuTheme } from '../src/theme/antd';

/**
 * 第一次开发生成项目时，可显式把一个同源路径代理到本机业务前端。
 * 只接受 loopback，且环境变量缺失时完全不产生业务路由；生产由 Nginx/Ingress 负责。
 */
function localProjectWebProxy() {
  const value = process.env.KAIWU_LOCAL_PROJECT_WEB_PROXY?.trim();
  if (!value) return {};
  const separator = value.indexOf('=');
  const projectCode = value.slice(0, separator);
  const rawTarget = value.slice(separator + 1);
  if (separator <= 0 || !/^[a-z][a-z0-9-]{1,62}$/.test(projectCode)) {
    throw new Error('KAIWU_LOCAL_PROJECT_WEB_PROXY 必须是 project-code=http://127.0.0.1:port');
  }
  const target = new URL(rawTarget);
  if (
    !['http:', 'https:'].includes(target.protocol) ||
    !['127.0.0.1', 'localhost', '[::1]'].includes(target.hostname)
  ) {
    throw new Error('本地项目前端代理只允许指向 loopback HTTP(S) 地址');
  }
  return {
    [`/apps/${projectCode}`]: {
      target: target.origin,
      changeOrigin: true,
    },
  };
}

export default defineConfig({
  // 产物带内容指纹：chunk 文件名默认是纯数字，内容变了名字不变，
  // 浏览器会把旧 umi.js 与新 chunk 混用，报 Loading chunk failed。
  hash: true,
  locale: {
    default: 'zh-CN',
    baseNavigator: false,
    useLocalStorage: false,
    antd: true,
    title: true,
  },
  // 首屏渲染前用 HttpOnly Refresh Cookie 恢复内存会话。
  model: {},
  initialState: {},
  antd: {
    appConfig: {},
    // 主题集中在 src/theme/antd.ts，组件内联样式取同一份 token，避免颜色散落多处。
    configProvider: {
      theme: kaiwuTheme,
    },
  },
  // Ant Design Pro 混合布局：原生顶栏与 256px 侧栏。
  layout: {
    title: 'Kaiwu',
    locale: false,
    siderWidth: 256,
  },
  routes: [
    {
      path: '/login',
      component: './Login',
      layout: false,
    },
    {
      path: '/',
      name: '工作台',
      icon: 'DashboardOutlined',
      component: './Home',
      hideInMenu: true,
    },
    {
      // 登录后的项目选择页：只列出当前用户有权访问的项目，整屏页不套平台布局。
      path: '/select-project',
      component: './ProjectSelect',
      layout: false,
    },
    {
      // 业务项目后台的宿主页：整屏 iframe，不套平台布局（子应用有自己的侧栏）。
      path: '/workspace/:projectId',
      component: './Workspace',
      layout: false,
    },
    {
      path: '/notifications',
      name: '消息中心',
      icon: 'BellOutlined',
      component: './Notifications',
      hideInMenu: true,
    },
    {
      path: '/profile',
      component: './Profile',
      hideInMenu: true,
    },
    {
      // CLI 设备授权确认页（ADR 0035），由命令行打印的链接直接打开，不进菜单。
      path: '/device',
      component: './Device',
      hideInMenu: true,
    },
    {
      path: '/users',
      name: '用户管理',
      icon: 'UserOutlined',
      component: './Users',
      hideInMenu: true,
    },
    {
      path: '/security',
      name: '安全运营',
      icon: 'SafetyCertificateOutlined',
      component: './Security',
      hideInMenu: true,
    },
    {
      path: '/organization',
      name: '组织架构',
      icon: 'ApartmentOutlined',
      component: './Organization',
      hideInMenu: true,
    },
    {
      path: '/projects',
      name: '项目管理',
      icon: 'AppstoreOutlined',
      component: './Projects',
      hideInMenu: true,
    },
    {
      path: '/project-onboarding',
      name: '项目开通',
      component: './ProjectOnboarding',
      hideInMenu: true,
    },
    {
      path: '/configs',
      name: '参数配置',
      icon: 'SettingOutlined',
      component: './Configs',
      hideInMenu: true,
    },
    {
      path: '/dictionaries',
      name: '字典管理',
      icon: 'BookOutlined',
      component: './Dictionaries',
      hideInMenu: true,
    },
    {
      path: '/i18n-resources',
      name: '国际化资源',
      icon: 'TranslationOutlined',
      component: './I18nResources',
      hideInMenu: true,
    },
    {
      path: '/scheduler',
      name: '定时任务',
      icon: 'FieldTimeOutlined',
      component: './Scheduler',
      hideInMenu: true,
    },
    {
      path: '/storage',
      name: '对象存储',
      icon: 'CloudServerOutlined',
      component: './Storage',
      hideInMenu: true,
    },
    {
      path: '/ai-provider',
      name: '大模型配置',
      icon: 'ApiOutlined',
      component: './AiProvider',
      hideInMenu: true,
    },
    {
      path: '/project-factory',
      name: '项目工厂',
      icon: 'CodeOutlined',
      component: './ProjectFactory',
      hideInMenu: true,
    },
    {
      path: '/deliveries',
      redirect: '/project-factory',
      hideInMenu: true,
    },
    {
      path: '/codegen',
      redirect: '/project-factory',
      hideInMenu: true,
    },
  ],
  proxy: {
    '/api': {
      target: 'http://127.0.0.1:8088',
      changeOrigin: true,
    },
    ...localProjectWebProxy(),
  },
  npmClient: 'pnpm',
});
