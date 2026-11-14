import { expect, test, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

async function setup(page: Page, canAsk: boolean) {
  const user = {
    id: '1',
    username: 'admin',
    displayName: '管理员',
    locale: 'zh-CN',
    mustChangePassword: false,
    permissions: [
      'system:project:list',
      'system:project:member',
      ...(canAsk ? ['system:agent:ask'] : []),
    ],
  };
  const messages: Record<string, string> = {};
  for (const line of fs
    .readFileSync(
      path.resolve(process.env.KAIWU_SERVICE_DIR ?? '../kaiwu-system-service', 'sql/schema.sql'),
      'utf8',
    )
    .split('\n')) {
    const match = /^\s*\(\d{15,},\s*'([^']+)',\s*'((?:''|[^'])*)',\s*JSON_OBJECT/.exec(line);
    if (match) messages[match[1]] = match[2].replaceAll("''", "'");
  }
  let catalogCalls = 0;
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url());
    let data: unknown = [];
    if (url.pathname.endsWith('/i18n/catalog')) data = { locale: 'zh-CN', revision: 55, messages };
    if (url.pathname.endsWith('/i18n/locales'))
      data = [{ locale: 'zh-CN', label: '简体中文', selectable: true }];
    if (url.pathname === '/api/auth/me') data = user;
    if (url.pathname === '/api/auth/refresh')
      data = { accessToken: 'e2e-access', expiresIn: 3600, user };
    if (url.pathname === '/api/auth/menus')
      data = [{ id: 'projects', name: '项目管理', type: 'MENU', path: '/projects', children: [] }];
    if (url.pathname === '/api/projects')
      data = {
        current: 1,
        size: 20,
        total: 1,
        records: [
          {
            id: '9000000000000000001',
            projectCode: 'system',
            projectName: 'Kaiwu System',
            status: 'ACTIVE',
            builtIn: true,
            createdBy: '1',
          },
        ],
      };
    if (url.pathname === '/api/agent/local-capabilities') {
      catalogCalls++;
      data = [
        {
          code: 'system.project.list',
          version: '1',
          description: '查询平台项目',
          permission: 'system:project:list',
          readOnly: true,
          available: true,
        },
        {
          code: 'system.project.create',
          version: '1',
          description: '创建平台项目',
          permission: 'system:project:create',
          readOnly: false,
          available: false,
        },
      ];
    }
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ code: 0, data, message: 'ok' }),
    });
  });
  await page.goto('/projects');
  return () => catalogCalls;
}

test('System shows code-defined Agent capabilities and current permission', async ({ page }) => {
  const catalogCalls = await setup(page, true);
  await page.getByRole('button', { name: 'Agent 能力', exact: true }).click();
  await expect(page.getByText('System 是内置项目')).toBeVisible();
  await expect(page.getByRole('row').filter({ hasText: 'system.project.list' })).toContainText(
    '有权限',
  );
  await expect(page.getByRole('row').filter({ hasText: 'system.project.create' })).toContainText(
    '无权限',
  );
  expect(catalogCalls()).toBe(1);
});

test('System Agent entry is hidden without ask permission', async ({ page }) => {
  const catalogCalls = await setup(page, false);
  await expect(page.getByText('Kaiwu System')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Agent 能力', exact: true })).toHaveCount(0);
  expect(catalogCalls()).toBe(0);
});

test('project actions remain visible at wide and narrow viewport widths', async ({ page }) => {
  await setup(page, true);
  for (const width of [1920, 1024]) {
    await page.setViewportSize({ width, height: 900 });
    const row = page.getByRole('row').filter({ hasText: 'Kaiwu System' });
    const cell = row.locator('td').last();
    const access = cell.getByRole('button', { name: '权限中心' });
    const more = cell.locator('.kaiwu-more-trigger');
    await expect(access).toBeVisible();
    await expect(more).toBeVisible();
    const bounds = await cell.evaluate((element) => {
      const cellRect = element.getBoundingClientRect();
      const buttons = Array.from(element.querySelectorAll('button')).map((button) =>
        button.getBoundingClientRect(),
      );
      const tableRect = element.closest('.ant-table-container')!.getBoundingClientRect();
      return {
        cellRight: cellRect.right,
        tableRight: tableRect.right,
        buttonRight: buttons.at(-1)!.right,
      };
    });
    expect(bounds.buttonRight).toBeLessThanOrEqual(bounds.cellRight);
    expect(bounds.buttonRight).toBeLessThanOrEqual(bounds.tableRight);
  }
});
