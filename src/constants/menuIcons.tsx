import type { ReactNode } from 'react';
import LineIcon, { type LineIconName } from '@/components/LineIcon';

/**
 * 后端菜单图标名 → V5 线性图标。图标名仍是菜单表里维护的 Ant Design 名称，
 * 只是渲染换成设计稿的细线图标集，菜单数据与权限中心的可选项都不变。
 */
const MENU_ICON_GLYPHS: Record<string, LineIconName> = {
  DashboardOutlined: 'layout',
  BellOutlined: 'bell',
  SettingOutlined: 'settings',
  RocketOutlined: 'package',
  UserOutlined: 'user',
  SafetyCertificateOutlined: 'shield',
  ApartmentOutlined: 'grid',
  AppstoreOutlined: 'grid',
  BookOutlined: 'layers',
  FieldTimeOutlined: 'clock',
  ApiOutlined: 'spark',
  CodeOutlined: 'package',
  DeploymentUnitOutlined: 'activity',
  CloudServerOutlined: 'layers',
};

const MENU_ICONS: Record<string, ReactNode> = Object.fromEntries(
  Object.entries(MENU_ICON_GLYPHS).map(([name, glyph]) => [name, <LineIcon name={glyph} />]),
);

export const MENU_ICON_OPTIONS = Object.entries(MENU_ICONS).map(([name, icon]) => ({
  label: (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
      {icon}
      {name}
    </span>
  ),
  value: name,
}));

/**
 * 平台内置路由的设计稿图标。菜单表里的图标名不在映射内（历史库里可能是其它 Ant Design 名称）时，
 * 按路由兜底，避免出现没有图标、文字整体左移的菜单项。
 */
const ROUTE_GLYPHS: Record<string, LineIconName> = {
  '/': 'layout',
  '/projects': 'grid',
  '/notifications': 'bell',
  '/users': 'user',
  '/security': 'shield',
  '/organization': 'grid',
  '/configs': 'settings',
  '/dictionaries': 'layers',
  '/scheduler': 'clock',
  '/ai-provider': 'spark',
  '/storage': 'layers',
  '/project-factory': 'package',
};

export function resolveMenuIcon(name?: string, path?: string): ReactNode {
  if (name && MENU_ICONS[name]) return MENU_ICONS[name];
  // 不传路由（如权限中心的图标预览）时保持原语义：未知图标就不显示。
  if (path === undefined) return undefined;
  return <LineIcon name={ROUTE_GLYPHS[path] ?? 'grid'} />;
}
