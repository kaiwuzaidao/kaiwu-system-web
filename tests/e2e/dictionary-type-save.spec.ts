import { expect, test, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

/** 已登录会话 + 空的全局字典列表；文案取后端 schema 快照，与线上同源。 */
async function mockGlobalDictionaries(page: Page, savedBodies: unknown[]) {
  const messages: Record<string, string> = {};
  const schema = path.resolve(
    process.env.KAIWU_SERVICE_DIR ?? '../kaiwu-system-service',
    'sql/schema.sql',
  );
  for (const line of fs.readFileSync(schema, 'utf8').split('\n')) {
    const match = /^\s*\(\d{15,},\s*'([^']+)',\s*'((?:''|[^'])*)',\s*JSON_OBJECT/.exec(line);
    if (match) messages[match[1]] = match[2].replaceAll("''", "'");
  }
  const user = {
    id: '1',
    username: 'admin',
    displayName: '管理员',
    locale: 'zh-CN',
    agentAutoOpen: false,
    mustChangePassword: false,
    permissions: ['system:dict:save'],
  };
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url());
    let data: unknown = [];
    if (url.pathname.endsWith('/i18n/catalog')) data = { locale: 'zh-CN', revision: 1, messages };
    if (url.pathname.endsWith('/i18n/locales'))
      data = [{ locale: 'zh-CN', label: '简体中文', selectable: true }];
    if (url.pathname === '/api/auth/refresh')
      data = { accessToken: 'fixture', expiresIn: 3600, user };
    if (url.pathname === '/api/auth/me') data = user;
    if (url.pathname === '/api/current/notifications/summary')
      data = { unreadCount: 0, recent: [] };
    if (url.pathname === '/api/projects') data = { current: 1, size: 100, total: 0, records: [] };
    if (url.pathname.startsWith('/api/metadata/dicts/effective/')) {
      data = { dictCode: url.pathname.split('/').pop(), dictName: '', items: [] };
    }
    if (url.pathname === '/api/metadata/dicts' && route.request().method() === 'POST') {
      const body = route.request().postDataJSON() as Record<string, unknown>;
      savedBodies.push(body);
      data = { ...body, id: '100', scopeId: '0' };
    }
    await route.fulfill({ json: { code: 0, data } });
  });
}

test('全局作用域新增字典会提交后端必填的 inheritGlobal', async ({ page }) => {
  const savedBodies: unknown[] = [];
  await mockGlobalDictionaries(page, savedBodies);
  await page.goto('/dictionaries');
  await page.getByRole('button', { name: /新增字典$/ }).click();

  const dialog = page.getByRole('dialog');
  await dialog.getByRole('textbox').first().fill('示例字典');
  await dialog.getByRole('textbox').nth(1).fill('erfgeger');
  await dialog.getByRole('button', { name: /确\s*定/ }).click();

  await expect.poll(() => savedBodies).toHaveLength(1);
  expect(savedBodies[0]).toMatchObject({ dictCode: 'erfgeger', inheritGlobal: false });
});
