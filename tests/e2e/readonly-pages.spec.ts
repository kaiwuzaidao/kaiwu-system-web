import { expect, test } from '@playwright/test';
import { loginAsAdmin } from './support/auth';
import { requireAdminCredentials } from './support/env';

const pages = [
  ['工作台', '/', '我参与的项目'],
  ['消息中心', '/notifications', '消息中心'],
  ['个人设置', '/profile', '账号信息'],
  ['用户管理', '/users', '用户管理'],
  ['安全运营', '/security', '安全运营中心'],
  ['组织架构', '/organization', '组织架构'],
  ['项目管理', '/projects', '项目管理'],
  ['项目开通', '/project-onboarding', '项目开通向导'],
  ['参数配置', '/configs', '参数配置'],
  ['字典管理', '/dictionaries', '字典管理'],
  ['定时任务', '/scheduler', '项目定时任务'],
  ['大模型配置', '/ai-provider', '大模型配置'],
  ['对象存储', '/storage', '存储账号'],
  ['项目工厂', '/project-factory', '项目工厂'],
] as const;

test.describe('已上线页面：管理员只读验收', () => {
  test.beforeAll(requireAdminCredentials);

  test.beforeEach(async ({ page }) => {
    // 这些用例验收传统后台，与首次登录时是否自动展示助手的账号偏好无关。
    await page.addInitScript(() => sessionStorage.setItem('kaiwu.agent.autoOpened', '1'));
    await loginAsAdmin(page);
  });

  for (const [name, path, expectedText] of pages) {
    test(`${name} 页面能加载`, async ({ page }) => {
      await page.goto(path);
      await expect(page.getByText(expectedText, { exact: true }).first()).toBeVisible();
    });
  }

  test('用户菜单可进入个人设置并退出登录', async ({ page }) => {
    await page
      .locator('#root .kaiwu-header-user')
      .getByRole('button', { name: '个人设置' })
      .click();
    await page.getByRole('menuitem', { name: '个人设置' }).click();
    await expect(page).toHaveURL(/\/profile$/);
    await page
      .locator('#root .kaiwu-header-user')
      .getByRole('button', { name: '个人设置' })
      .click();
    await page.getByRole('menuitem', { name: '退出登录' }).click();
    await expect(page).toHaveURL(/\/login$/);
  });

  test('项目开通不再占用一级菜单', async ({ page }) => {
    await page.goto('/projects');
    await expect(page.getByRole('link', { name: /用户管理/ })).toBeVisible();
    await expect(page.getByRole('link', { name: /项目开通/ })).toHaveCount(0);
  });

  test('侧边导航按平台管理和研发交付分组', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('menuitem', { name: /工作台/ })).toBeVisible();
    await expect(page.getByRole('link', { name: /消息中心/ })).toBeVisible();

    const groups = page.getByRole('menu').locator('.ant-menu-item-group');
    const platformGroup = groups.filter({ has: page.getByText('平台管理', { exact: true }) });
    await expect(platformGroup.getByRole('link', { name: '用户管理' })).toBeVisible();
    await expect(platformGroup.getByRole('link', { name: '字典管理' })).toBeVisible();
    await expect(platformGroup.getByRole('link', { name: '定时任务' })).toBeVisible();

    const deliveryGroup = groups.filter({ has: page.getByText('研发交付', { exact: true }) });
    await expect(deliveryGroup.getByRole('link', { name: '大模型配置' })).toBeVisible();
    await expect(deliveryGroup.getByRole('link', { name: '项目工厂' })).toBeVisible();
    await expect(page.getByRole('link', { name: /交付中心/ })).toHaveCount(0);
  });

  test('旧交付中心地址重定向到项目工厂', async ({ page }) => {
    await page.goto('/deliveries');
    await expect(page).toHaveURL(/\/project-factory$/);
    await expect(page.getByText('项目工厂', { exact: true }).first()).toBeVisible();
  });

  test('无子菜单权限时不显示空分组', async ({ page }) => {
    await page.route('**/api/auth/menus', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          code: 0,
          message: 'success',
          data: [
            {
              id: 'dashboard',
              name: '工作台',
              type: 'MENU',
              path: '/',
              children: [],
            },
          ],
        }),
      });
    });
    await page.goto('/');

    await expect(page.getByRole('menuitem', { name: /工作台/ })).toBeVisible();
    await expect(page.getByRole('menu').getByText('平台管理', { exact: true })).toHaveCount(0);
    await expect(page.getByRole('menu').getByText('研发交付', { exact: true })).toHaveCount(0);
  });

  test('项目管理中的开通项目按钮进入向导', async ({ page }) => {
    await page.goto('/projects');
    await page.getByRole('button', { name: '开通项目' }).click();
    await expect(page).toHaveURL(/\/project-onboarding$/);
    await expect(page.getByText('项目开通向导', { exact: true })).toBeVisible();
  });

  test('全局搜索入口可用并返回权限范围内结果', async ({ page }) => {
    // Ctrl/Cmd+K 在 headless Chromium 中属于浏览器保留键，端到端测试走同一组件的
    // 可访问按钮入口，继续覆盖弹窗、接口和结果跳转数据。
    await page.getByRole('button', { name: '全局搜索' }).click();
    await expect(page.getByText('全局搜索', { exact: true })).toBeVisible();
    await page.getByPlaceholder('搜索项目、用户、交付任务（至少 2 个字符）').fill('system');
    await expect(page.getByText('system', { exact: true }).first()).toBeVisible();
  });
});
