import { Button, type ButtonProps } from 'antd';
import type { ReactNode } from 'react';

type AuthButtonProps = ButtonProps & {
  permission: string;
  permissions: string[];
  children?: ReactNode;
};

/**
 * 前端操作可见性组件；后端 @RequirePermission 才是最终安全边界。
 */
export default function AuthButton({
  permission,
  permissions,
  children,
  ...buttonProps
}: AuthButtonProps) {
  if (!permissions.includes(permission)) {
    return null;
  }
  return <Button {...buttonProps}>{children}</Button>;
}
