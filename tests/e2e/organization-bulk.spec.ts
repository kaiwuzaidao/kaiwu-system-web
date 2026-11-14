import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

test('batch addition preserves selected users across pages and submits the department', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const messages: Record<string, string> = {};
  for (const line of fs
    .readFileSync(
      path.resolve(process.env.KAIWU_SERVICE_DIR ?? '../kaiwu-system-org-bulk', 'sql/schema.sql'),
      'utf8',
    )
    .split('\n')) {
    const match = /^\s*\(\d{15,},\s*'([^']+)',\s*'((?:''|[^'])*)',\s*JSON_OBJECT/.exec(line);
    if (match) messages[match[1]] = match[2].replaceAll("''", "'");
  }
  const user = {
    id: '1',
    username: 'admin',
    displayName: '管理员',
    locale: 'zh-CN',
    mustChangePassword: false,
    permissions: [
      'system:org:list',
      'system:org:assign',
      'system:org:save',
      'system:org:delete',
      'system:user:list',
    ],
  };
  let submitted: unknown;
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url());
    let data: unknown = [];
    if (url.pathname.endsWith('/i18n/catalog')) data = { locale: 'zh-CN', revision: 1, messages };
    if (url.pathname.endsWith('/i18n/locales'))
      data = [{ locale: 'zh-CN', label: '简体中文', selectable: true }];
    if (url.pathname === '/api/auth/me') data = user;
    if (url.pathname === '/api/auth/refresh')
      data = { accessToken: 'e2e-access', expiresIn: 3600, user };
    if (url.pathname === '/api/auth/menus')
      data = [{ id: 'org', name: '组织架构', type: 'MENU', path: '/organization', children: [] }];
    if (url.pathname === '/api/org/departments')
      data = [
        {
          id: '9',
          name: '技术部',
          code: 'tech',
          status: 'ENABLED',
          children: [{ id: '10', name: '开发部', code: 'dev', status: 'ENABLED', children: [] }],
        },
      ];
    if (url.pathname === '/api/users') {
      const current = Number(url.searchParams.get('current') ?? 1);
      const size = Number(url.searchParams.get('size') ?? 10);
      const all = Array.from({ length: 11 }, (_, i) => ({
        id: String(i + 1),
        username: `user${i + 1}`,
        displayName: `用户${i + 1}`,
        status: 'ENABLED',
      })).filter((item) => item.username.includes(url.searchParams.get('keyword') ?? ''));
      data = {
        current,
        size,
        total: all.length,
        records: all.slice((current - 1) * size, current * size),
      };
    }
    if (url.pathname === '/api/org/user-departments')
      data = { '1': ['10'], '2': ['10'], '3': ['10'] };
    if (url.pathname === '/api/org/departments/10/members') {
      submitted = route.request().postDataJSON();
      data = 2;
    }
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ code: 0, data, message: 'ok' }),
    });
  });
  await page.goto('/organization');
  await expect(page.getByRole('tree').getByText('开发部')).toBeVisible();
  await page.getByRole('tree').getByText('开发部').click();
  await expect(page.locator('.kaiwu-organization-table tbody .ant-avatar')).toHaveCount(3);
  await expect(page.getByText('用户归属 · 开发部')).toBeVisible();
  await page.screenshot({
    animations: 'disabled',
    path: testInfo.outputPath('organization-desktop.png'),
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole('button', { name: '批量添加人员' })).toBeVisible();
  await expect(page.locator('.kaiwu-organization-tree')).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth))
    .toBeLessThanOrEqual(0);
  await page.screenshot({
    animations: 'disabled',
    path: testInfo.outputPath('organization-mobile.png'),
  });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByRole('button', { name: '批量添加人员' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('row').filter({ hasText: /@user1$/ })).toBeVisible();
  await page.waitForTimeout(350);
  const headerBox = await dialog.locator('thead .ant-checkbox-inner').boundingBox();
  const rowBox = await dialog.locator('tbody .ant-checkbox-inner').first().boundingBox();
  expect(Math.abs(headerBox!.x - rowBox!.x)).toBeLessThan(2);
  await expect(dialog.locator('tbody .ant-checkbox-inner').first()).toHaveCSS(
    'border-color',
    'rgb(100, 116, 139)',
  );
  await dialog.screenshot({
    animations: 'disabled',
    path: testInfo.outputPath('bulk-readable.png'),
  });
  await dialog
    .getByRole('row')
    .filter({ hasText: /@user1$/ })
    .getByRole('checkbox')
    .check();
  await dialog.locator('.ant-pagination-item-2').click();
  await dialog.getByRole('row').filter({ hasText: '@user11' }).getByRole('checkbox').check();
  await expect(dialog.getByText('已选择 2 人（最多 100 人）')).toBeVisible();
  const search = dialog.getByRole('searchbox');
  await search.fill('user11');
  await search.press('Enter');
  await expect(
    dialog.getByRole('row').filter({ hasText: '@user11' }).getByRole('checkbox'),
  ).toBeChecked();
  await search.fill('');
  await search.press('Enter');
  await expect(dialog.getByText('已选择 2 人（最多 100 人）')).toBeVisible();
  await expect(
    dialog
      .getByRole('row')
      .filter({ hasText: /@user1$/ })
      .getByRole('checkbox'),
  ).toBeChecked();
  await dialog.getByRole('button', { name: '确 定' }).click();
  await expect.poll(() => submitted).toEqual({ userIds: ['1', '11'] });
  await expect(page.getByText('已添加 2 人')).toBeVisible();
});

test('批量添加上限为 100 人，取消后重新打开不保留未提交选择', async ({ page }) => {
  const messages: Record<string, string> = {};
  for (const line of fs
    .readFileSync(
      path.resolve(process.env.KAIWU_SERVICE_DIR ?? '../kaiwu-system-org-bulk', 'sql/schema.sql'),
      'utf8',
    )
    .split('\n')) {
    const match = /^\s*\(\d{15,},\s*'([^']+)',\s*'((?:''|[^'])*)',\s*JSON_OBJECT/.exec(line);
    if (match) messages[match[1]] = match[2].replaceAll("''", "'");
  }
  const user = {
    id: '999',
    username: 'admin',
    displayName: '管理员',
    locale: 'zh-CN',
    permissions: ['system:org:list', 'system:org:assign', 'system:user:list'],
  };
  let writes = 0;
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url());
    let data: unknown = [];
    if (url.pathname.endsWith('/i18n/catalog')) data = { locale: 'zh-CN', revision: 1, messages };
    if (url.pathname.endsWith('/i18n/locales'))
      data = [{ locale: 'zh-CN', label: '简体中文', selectable: true }];
    if (url.pathname === '/api/auth/me') data = user;
    if (url.pathname === '/api/auth/refresh')
      data = { accessToken: 'fixture', expiresIn: 3600, user };
    if (url.pathname === '/api/auth/menus')
      data = [{ id: 'org', name: '组织架构', type: 'MENU', path: '/organization', children: [] }];
    if (url.pathname === '/api/org/departments')
      data = [{ id: '10', name: '开发部', code: 'dev', status: 'ENABLED', children: [] }];
    if (url.pathname === '/api/users') {
      const current = Number(url.searchParams.get('current') ?? 1);
      const size = Number(url.searchParams.get('size') ?? 10);
      const all = Array.from({ length: 101 }, (_, i) => ({
        id: String(i + 1),
        username: `user${i + 1}`,
        displayName: `用户${i + 1}`,
        status: 'ENABLED',
      }));
      data = {
        current,
        size,
        total: all.length,
        records: all.slice((current - 1) * size, current * size),
      };
    }
    if (url.pathname === '/api/org/user-departments') data = {};
    if (url.pathname === '/api/org/departments/10/members') {
      writes += 1;
      data = 0;
    }
    await route.fulfill({ json: { code: 0, data } });
  });
  await page.goto('/organization');
  await page.getByRole('tree').getByText('开发部').click();
  await page.getByRole('button', { name: '批量添加人员' }).click();
  const dialog = page.getByRole('dialog');
  for (let index = 0; index < 10; index += 1) {
    await expect(
      dialog
        .getByRole('row')
        .filter({ hasText: `@user${index * 10 + 1}` })
        .first(),
    ).toBeVisible();
    await dialog.locator('thead input[type=checkbox]').check();
    if (index < 9) await dialog.locator('.ant-pagination-next button').click();
  }
  await expect(dialog.getByText('已选择 100 人（最多 100 人）')).toBeVisible();
  await dialog.locator('.ant-pagination-next button').click();
  await expect(dialog.locator('tbody input[type=checkbox]').first()).toBeDisabled();
  await dialog.getByRole('button', { name: '取 消' }).click();
  expect(writes).toBe(0);
  await page.getByRole('button', { name: '批量添加人员' }).click();
  await expect(dialog.getByText('已选择 0 人（最多 100 人）')).toBeVisible();
  await expect(dialog.getByRole('button', { name: '确 定' })).toBeDisabled();
});
