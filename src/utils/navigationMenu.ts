/**
 * ProLayout 的菜单数据只在请求后缓存；语言偏好保存成功时由此显式刷新。
 *
 * 该模块不依赖认证或布局，避免认证服务与运行时 layout 形成循环依赖。
 */
export const navigationMenuActionRef: {
  current: { reload: () => void } | undefined;
} = { current: undefined };

export function reloadNavigationMenus() {
  navigationMenuActionRef.current?.reload();
}
