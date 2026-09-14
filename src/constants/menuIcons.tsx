import {
  ApartmentOutlined,
  ApiOutlined,
  AppstoreOutlined,
  BellOutlined,
  BookOutlined,
  CodeOutlined,
  DashboardOutlined,
  DeploymentUnitOutlined,
  FieldTimeOutlined,
  GitlabOutlined,
  RocketOutlined,
  SafetyCertificateOutlined,
  SettingOutlined,
  UserOutlined,
} from '@ant-design/icons';
import type { ReactNode } from 'react';

const MENU_ICONS: Record<string, ReactNode> = {
  DashboardOutlined: <DashboardOutlined />,
  BellOutlined: <BellOutlined />,
  SettingOutlined: <SettingOutlined />,
  RocketOutlined: <RocketOutlined />,
  UserOutlined: <UserOutlined />,
  SafetyCertificateOutlined: <SafetyCertificateOutlined />,
  ApartmentOutlined: <ApartmentOutlined />,
  AppstoreOutlined: <AppstoreOutlined />,
  BookOutlined: <BookOutlined />,
  FieldTimeOutlined: <FieldTimeOutlined />,
  ApiOutlined: <ApiOutlined />,
  GitlabOutlined: <GitlabOutlined />,
  CodeOutlined: <CodeOutlined />,
  DeploymentUnitOutlined: <DeploymentUnitOutlined />,
};

export const MENU_ICON_OPTIONS = Object.entries(MENU_ICONS).map(([name, icon]) => ({
  label: (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
      {icon}
      {name}
    </span>
  ),
  value: name,
}));

export function resolveMenuIcon(name?: string): ReactNode {
  return name ? MENU_ICONS[name] : undefined;
}
