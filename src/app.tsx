import { history, type RunTimeLayoutConfig } from '@umijs/max';
import type { MenuDataItem } from '@ant-design/pro-components';
import ForcePasswordChange from '@/components/ForcePasswordChange';
import RightContent from '@/components/RightContent';
import { resolveMenuIcon } from '@/constants/menuIcons';
import {
  hasSession,
  queryNavigationMenus,
  restoreSession,
  type NavigationMenu,
} from '@/services/auth';
import { currentLocale } from '@/utils/locale';
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
    icon: resolveMenuIcon(menu.icon),
    children: menu.children.length > 0 ? toMenuData(menu.children) : undefined,
  }));
}

export const layout: RunTimeLayoutConfig = () => {
  return {
    logo: false,
    menu: {
      locale: false,
      // 侧边栏由平台菜单表驱动：菜单名称、图标、排序、分组都在
      // 「项目管理 → system → 权限中心」维护，前端不再保留第二份定义。
      // config.ts 的 routes 只负责路由到组件的映射与面包屑名称。
      request: async () => {
        try {
          return toMenuData(await queryNavigationMenus());
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
    menuHeaderRender: (_, title) => (
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '4px 4px' }}>
        <div
          style={{
            width: 30,
            height: 30,
            borderRadius: 8,
            background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#fff',
            fontWeight: 700,
            fontSize: 15,
            letterSpacing: 0.4,
            boxShadow: '0 4px 12px rgba(79,70,229,0.28)',
          }}
        >
          Z
        </div>
        {title}
      </div>
    ),
    rightContentRender: () => <RightContent />,
    // 强制改密弹窗挂在这里：任何页面都能看到，不依赖跳转到个人中心。
    childrenRender: (children) => (
      <>
        {children}
        <ForcePasswordChange />
      </>
    ),
    /**
     * PageContainer 的所有纵向间距都由 paddingBlockPageContainerContent 派生：
     * 页头上边距 = P/4，标题上边距 = P/4，页头下边距 = P/2，内容区上下 = P/3。
     * 默认 40 时标题上方会叠出 24(内容区) + 10 + 10 = 44px，明显过高。
     * 收到 24 后为 16 + 6 + 6 = 28px，标题到内容为 12 + 8 = 20px。
     *
     * 只调纵向：paddingInline 不设置，保持页头标题与下方卡片左对齐。
     */
    token: {
      pageContainer: {
        paddingBlockPageContainerContent: 24,
      },
    },
    contentStyle: {
      // 顶部收紧，左右与底部保持规范的 24 页边距。
      padding: '16px 24px 24px',
      background: '#f5f6fa',
    },
    onPageChange: () => {
      const path = history.location.pathname;
      if (path !== '/login' && !hasSession()) {
        history.replace('/login');
        return;
      }
    },
  };
};
