import { history, type RunTimeLayoutConfig } from '@umijs/max';
import type { MenuDataItem } from '@ant-design/pro-components';
import AgentDock from '@/components/AgentDock';
import { proLayoutTokens } from '@/theme/layout';
import ForcePasswordChange from '@/components/ForcePasswordChange';
import RightContent, { PlatformBreadcrumb, SidebarFooter } from '@/components/RightContent';
import { resolveMenuIcon } from '@/constants/menuIcons';
import {
  hasSession,
  queryNavigationMenus,
  restoreSession,
  type NavigationMenu,
} from '@/services/auth';
import { currentLocale } from '@/utils/locale';
import { resolveRuntimeMessage } from '@/i18n/runtime';
import { navigationMenuActionRef } from '@/utils/navigationMenu';
import { installProjectAccessBridge } from '@/utils/projectAccessBridge';

installProjectAccessBridge();

/** 在 Umi 首屏解锁前恢复仅驻留内存的 Access Token。 */
export async function getInitialState() {
  await restoreSession();
  return {};
}

/** 让 Umi 的 getLocale/setLocale 使用内存状态，而不是关闭后的 Local Storage。 */
export const locale = {
  getLocale: currentLocale,
};

/** 后端导航树 → ProLayout 菜单项。 */
function toMenuData(menus: NavigationMenu[]): MenuDataItem[] {
  return menus.map((menu) => ({
    // DIRECTORY 没有路由，用 id 兜底做 key，避免同层 key 冲突。
    path: menu.path ?? `/menu/${menu.id}`,
    // 菜单名称已由 System 按用户持久化语言从 menu_name_i18n 解析。
    name: menu.name,
    // 分组标题只显示文字（V5 设计）；目录在菜单表里配置的图标不渲染到分组标题上。
    icon: menu.type === 'DIRECTORY' ? undefined : resolveMenuIcon(menu.icon, menu.path),
    children: menu.children.length > 0 ? toMenuData(menu.children) : undefined,
  }));
}

/**
 * 顶层菜单里排在分组之前的独立菜单（工作台、项目管理、消息中心）归入「工作空间」分组，
 * 让侧栏每一段都有分组标题。只调整展示结构，不改变菜单数据与路由。
 */
function groupLeadingMenus(menus: NavigationMenu[]): NavigationMenu[] {
  const firstDirectory = menus.findIndex((menu) => menu.type === 'DIRECTORY');
  const title = resolveRuntimeMessage('layout.workspace');
  if (firstDirectory <= 0 || !title) return menus;
  return [
    {
      id: 'kaiwu-workspace',
      name: title,
      type: 'DIRECTORY',
      children: menus.slice(0, firstDirectory),
    },
    ...menus.slice(firstDirectory),
  ];
}

export const layout: RunTimeLayoutConfig = () => {
  return {
    logo: (
      <span className="kaiwu-sidebar-brand-mark" aria-hidden="true">
        K
      </span>
    ),
    className: 'kaiwu-platform-layout',
    // Ant Design Pro 原生混合布局，保留已有菜单分组与默认展开策略。
    navTheme: 'light',
    layout: 'mix',
    splitMenus: false,
    siderWidth: 256,
    fixedHeader: true,
    fixSiderbar: true,
    contentWidth: 'Fluid',
    menu: {
      locale: false,
      type: 'group',
      // 侧边栏由平台菜单表驱动：菜单名称、图标、排序、分组都在
      // 「项目管理 → system → 权限中心」维护，前端不再保留第二份定义。
      // config.ts 的 routes 只负责路由到组件的映射与面包屑名称。
      request: async () => {
        try {
          return toMenuData(groupLeadingMenus(await queryNavigationMenus()));
        } catch (reason) {
          // 菜单接口失败时返回空菜单而不是回退到静态定义：
          // 回退会重新引入第二份事实源，且让故障静默。路由本身仍可直接访问。
          // eslint-disable-next-line no-console
          console.warn('[menu] 导航菜单加载失败：', reason);
          return [];
        }
      },
    },
    actionRef: navigationMenuActionRef,
    menuFooterRender: (props) => <SidebarFooter collapsed={Boolean(props?.collapsed)} />,
    rightContentRender: () => <RightContent />,
    headerHeight: 56,
    // 强制改密弹窗挂在这里：任何页面都能看到，不依赖跳转到个人中心。
    childrenRender: (children) => (
      <>
        <div className="kaiwu-content-frame">
          <div className="kaiwu-page-breadcrumb">
            <PlatformBreadcrumb />
          </div>
          {children}
        </div>
        <ForcePasswordChange />
        <AgentDock />
      </>
    ),
    token: proLayoutTokens,
    contentStyle: { padding: 0 },
    onPageChange: () => {
      const path = history.location.pathname;
      if (path !== '/login' && !hasSession()) {
        // 设备授权确认页由命令行链接直接打开，登录后要回到原链接，短码才不会丢。
        if (path === '/device') {
          const target = `${path}${history.location.search}`;
          history.replace(`/login?redirect=${encodeURIComponent(target)}`);
          return;
        }
        history.replace('/login');
        return;
      }
    },
  };
};
