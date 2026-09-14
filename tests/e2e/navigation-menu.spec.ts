import { expect, test } from '@playwright/test';
import { createAdminApiContext, loginAsAdmin } from './support/auth';
import { e2e, requireAdminCredentials } from './support/env';

type Envelope<T> = { code: number; data: T };
type NavigationMenu = {
  id: string;
  name: string;
  type: 'DIRECTORY' | 'MENU';
  path?: string;
  children: NavigationMenu[];
};

/**
 * 侧边栏必须由平台菜单表驱动。
 *
 * 此前导航是前端硬编码的分组数组，在权限中心改名称、排序、分组都不生效。
 * 这条用例锁住契约：接口返回的名称就是页面上显示的名称。
 */
test.describe('导航菜单来自平台菜单表', () => {
  test.beforeAll(requireAdminCredentials);

  test('接口返回分组树，且侧边栏文案与之一致', async ({ page, request }) => {
    const api = await createAdminApiContext(request);
    const response = await api.get('/api/auth/menus');
    expect(response.ok(), await response.text()).toBeTruthy();
    const body = (await response.json()) as Envelope<NavigationMenu[]>;
    const menus = body.data;

    // 至少要有分组节点，否则说明 V24 的目录 seed 没生效。
    const directories = menus.filter((menu) => menu.type === 'DIRECTORY');
    expect(directories.length).toBeGreaterThan(0);
    // 目录必须带子节点：空目录在服务端就该被剔除。
    for (const directory of directories) {
      expect(directory.children.length).toBeGreaterThan(0);
      expect(directory.path).toBeFalsy();
    }

    await loginAsAdmin(page);
    const sider = page.locator('.ant-layout-sider');
    // 后端给什么名字，侧边栏就显示什么名字。
    for (const directory of directories) {
      await expect(sider.getByText(directory.name, { exact: true }).first()).toBeVisible();
    }
    const firstLeaf = menus.find((menu) => menu.type === 'MENU' && menu.path);
    if (firstLeaf) {
      await expect(sider.getByText(firstLeaf.name, { exact: true }).first()).toBeVisible();
    }
  });

  test('未登录时不下发菜单', async ({ request }) => {
    const response = await request.get(`${e2e.baseURL}/api/auth/menus`);
    expect(response.status()).toBe(401);
  });
});
