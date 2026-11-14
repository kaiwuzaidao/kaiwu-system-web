import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

for (const canSave of [true, false]) {
  test(`存储账号空态入口遵守权限：${canSave}`, async ({ page }) => {
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
    const user = {
      id: '1789248125900000001',
      username: 'member',
      displayName: 'Member',
      locale: 'zh-CN',
      permissions: canSave
        ? ['system:storage:list', 'system:storage:save']
        : ['system:storage:list'],
    };
    let writes = 0;
    await page.route('**/api/**', async (route) => {
      const url = new URL(route.request().url());
      let data: unknown = [];
      if (url.pathname.endsWith('/i18n/catalog')) data = { locale: 'zh-CN', revision: 1, messages };
      if (url.pathname.endsWith('/i18n/locales'))
        data = [{ locale: 'zh-CN', label: '简体中文', selectable: true }];
      if (url.pathname === '/api/auth/refresh')
        data = { accessToken: 'fixture', expiresIn: 3600, user };
      if (url.pathname === '/api/auth/me') data = user;
      if (url.pathname === '/api/auth/menus')
        data = [{ id: 'storage', name: '对象存储', type: 'MENU', path: '/storage', children: [] }];
      if (url.pathname === '/api/storage/accounts' && route.request().method() !== 'GET') writes++;
      await route.fulfill({ json: { code: 0, data } });
    });
    await page.goto('/storage');
    await expect(page.getByText(/还没有存储账号/)).toBeVisible();
    const create = page.getByRole('button', { name: '新增账号' });
    await expect(create).toHaveCount(canSave ? 1 : 0);
    if (canSave) {
      await create.click();
      await expect(page.getByRole('dialog')).toBeVisible();
      await page.getByRole('dialog').getByRole('button', { name: /取 消/ }).click();
    }
    expect(writes).toBe(0);
  });
}
