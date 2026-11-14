import { expect, test, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

/** 已登录会话 + 平台语言字典；文案取后端 schema 快照，与线上同源。 */
async function mockLocaleDictionary(page: Page) {
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
    if (url.pathname === '/api/auth/menus')
      data = [{ id: 'dictionaries', name: '字典', type: 'MENU', path: '/dictionaries' }];
    if (url.pathname === '/api/current/notifications/summary')
      data = { unreadCount: 0, recent: [] };
    if (url.pathname === '/api/projects') data = { current: 1, size: 100, total: 0, records: [] };
    if (url.pathname.startsWith('/api/metadata/dicts/effective/')) {
      data = { dictCode: url.pathname.split('/').pop(), dictName: '', items: [] };
    }
    if (url.pathname === '/api/metadata/dicts') {
      data = [
        {
          id: '100',
          scopeId: '0',
          dictCode: 'platform.locale',
          dictName: '平台语言',
          inheritGlobal: false,
          status: 'ENABLED',
        },
      ];
    }
    await route.fulfill({ json: { code: 0, data } });
  });
}

test('语言代码旁可打开 BCP 47 规范弹窗并点选常用标签回填', async ({ page }) => {
  await mockLocaleDictionary(page);
  await page.goto('/dictionaries');
  await page.getByRole('button', { name: '新增字典项' }).click();

  const value = page.getByLabel('字典值');
  await value.fill('zh_CN');
  await value.blur();
  await expect(page.getByText('语言代码必须是规范 BCP 47 标签，例如 ko-KR')).toBeVisible();

  await page.getByRole('button', { name: '查看 BCP 47 规范' }).click();
  const help = page.getByRole('dialog', { name: 'BCP 47 语言标签规范' });
  await expect(help.getByText('语言[-文字][-地区]')).toBeVisible();
  await expect(help.getByText('子标签之间用连字符 -，不能用下划线 _')).toBeVisible();

  await help.getByRole('row', { name: /ko-KR/ }).getByRole('button', { name: '使用' }).click();
  await expect(help).toBeHidden();
  await expect(value).toHaveValue('ko-KR');
  await expect(page.getByText('语言代码必须是规范 BCP 47 标签，例如 ko-KR')).toBeHidden();
});
