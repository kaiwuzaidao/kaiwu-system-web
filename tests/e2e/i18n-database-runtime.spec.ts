import { expect, test, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const user = {
  id: '1',
  username: 'admin',
  displayName: 'Administrator',
  permissions: [],
  locale: 'en-US',
  mustChangePassword: false,
};

/**
 * 匿名 catalog 只返回 public_visible=1 的资源。以前这里无条件返回全部资源，
 * 于是无论真实实现开放了几条，用例都是绿的——登录页文案长期只由静态救援包渲染，
 * 而测试看不出来。public_visible 的最终状态只有累积快照能读出（V15 用 UPDATE 翻转），
 * 快照与增量的 key 集合一致性由 `pnpm check:i18n` 保证。
 */
const SCHEMA_PATH = path.resolve(process.cwd(), '../kaiwu-system-service/sql/schema.sql');

/** 按 SQL 词法切分 VALUES 行的顶层参数，跳过引号内逗号与 JSON_OBJECT 的嵌套括号。 */
function splitSqlRow(line: string): string[] | undefined {
  const start = line.indexOf('(');
  if (start < 0) return undefined;
  const args: string[] = [];
  let current = '';
  let depth = 0;
  let quoted = false;
  for (let index = start; index < line.length; index += 1) {
    const char = line[index];
    if (quoted) {
      if (char === "'" && line[index + 1] === "'") {
        current += "''";
        index += 1;
      } else {
        if (char === "'") quoted = false;
        current += char;
      }
      continue;
    }
    if (char === "'") {
      quoted = true;
      current += char;
      continue;
    }
    if (char === '(') {
      depth += 1;
      if (depth === 1) continue;
    }
    if (char === ')') {
      depth -= 1;
      if (depth === 0) {
        args.push(current.trim());
        return args;
      }
    }
    if (char === ',' && depth === 1) {
      args.push(current.trim());
      current = '';
      continue;
    }
    current += char;
  }
  return undefined;
}

const unescapeSql = (value: string) => value.replaceAll("''", "'");

function databaseCatalog(locale: 'zh-CN' | 'en-US', options: { publicOnly?: boolean } = {}) {
  const messages: Record<string, string> = {};
  for (const line of fs.readFileSync(SCHEMA_PATH, 'utf8').split(/\r?\n/u)) {
    if (!/^\s*\(\d{15,}\s*,/u.test(line)) continue;
    const args = splitSqlRow(line);
    if (!args || args.length < 8) continue;
    const literal = (value: string) =>
      /^'(?:''|[^'])*'$/su.test(value) ? unescapeSql(value.slice(1, -1)) : undefined;
    const key = literal(args[1]);
    const defaultText = literal(args[2]);
    if (key === undefined || defaultText === undefined) continue;
    if (options.publicOnly && args[5] !== '1') continue;
    if (locale === 'zh-CN') {
      messages[key] = defaultText;
      continue;
    }
    const pairs = [...(args[3].match(/'((?:''|[^'])*)'/gu) ?? [])].map((part) =>
      unescapeSql(part.slice(1, -1)),
    );
    const index = pairs.indexOf(locale);
    if (index >= 0 && index % 2 === 0) messages[key] = pairs[index + 1];
  }
  return { locale, revision: 15, messages };
}

async function bootstrapEnglishSession(page: Page) {
  await page.addInitScript((bootstrapUser) => {
    (window as Window & { __KAIWU_SESSION_BOOTSTRAP__?: unknown }).__KAIWU_SESSION_BOOTSTRAP__ = {
      accessToken: 'e2e-access',
      expiresIn: 3600,
      user: bootstrapUser,
    };
  }, user);
}

test('登录页同一 locale 只加载一次匿名 catalog', async ({ page }) => {
  let catalogRequests = 0;
  await page.route('**/api/public/i18n/catalog**', async (route) => {
    catalogRequests += 1;
    const catalog = databaseCatalog('zh-CN', { publicOnly: true });
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ code: 0, data: catalog }),
    });
  });

  await page.goto('/login');
  await expect(page.getByRole('button', { name: /登\s*录/u })).toBeVisible();
  await page.waitForTimeout(300);

  expect(catalogRequests).toBe(1);
});

test('匿名语言切换从 PUBLIC 数据库 catalog 装载登录文案', async ({ page }) => {
  // 救援包与数据库对同一 key 的文案本来完全相同，断言原文无法区分渲染来源。
  // 加一个只可能来自接口响应的标记，才能证明登录页确实吃的是数据库 catalog。
  const marker = ' [from-db]';
  const publicCatalog = databaseCatalog('en-US', { publicOnly: true });
  expect(publicCatalog.messages['login.form.title']).toBeTruthy();
  expect(publicCatalog.messages['ai.model']).toBeUndefined();

  await page.route('**/api/public/i18n/catalog**', async (route) => {
    const locale =
      new URL(route.request().url()).searchParams.get('locale') === 'en-US' ? 'en-US' : 'zh-CN';
    const catalog = databaseCatalog(locale, { publicOnly: true });
    catalog.messages['login.form.title'] += marker;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ code: 0, data: catalog }),
    });
  });

  await page.goto('/login');
  await page.getByLabel('语言').click();
  await page.getByText('English', { exact: true }).click();

  await expect(
    page.getByText(`${publicCatalog.messages['login.form.title']}${marker}`, { exact: true }),
  ).toBeVisible();
  await expect(page).toHaveURL(/\/login$/);
});

test('账户语言、数据库 catalog 与服务端菜单名称使用同一 locale', async ({ page }) => {
  await bootstrapEnglishSession(page);
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url());
    let data: unknown = [];
    if (url.pathname === '/api/auth/me') data = user;
    if (url.pathname === '/api/auth/menus') {
      data = [{ id: 'users', name: 'Users', type: 'MENU', path: '/users', children: [] }];
    }
    if (url.pathname === '/api/i18n/locales') {
      data = [
        { locale: 'zh-CN', label: 'Simplified Chinese', selectable: true },
        { locale: 'en-US', label: 'English (US)', selectable: true },
      ];
    }
    if (url.pathname === '/api/i18n/catalog') data = databaseCatalog('en-US');
    if (url.pathname === '/api/current/notifications/summary') {
      data = { unreadCount: 0, recent: [] };
    }
    if (url.pathname === '/api/projects') {
      data = { records: [], total: 0, current: 1, pageSize: 100 };
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ code: 0, message: 'success', data }),
    });
  });

  await page.goto('/profile');

  await expect(page.getByLabel('Language').first()).toBeVisible();
  await expect(page.getByText('Users', { exact: true })).toBeVisible();
});

test('切换账户语言同步更新菜单、字典与引用式配置', async ({ page }) => {
  await bootstrapEnglishSession(page);
  let selectedLocale = 'en-US';
  let menuRequests = 0;
  let valueTypeRequests = 0;
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url());
    let data: unknown = [];
    if (url.pathname === '/api/auth/me') data = { ...user, locale: selectedLocale };
    if (url.pathname === '/api/auth/menus') {
      menuRequests += 1;
      data = [
        {
          id: 'users',
          name: selectedLocale === 'ja-JP' ? 'ユーザー' : 'Users',
          type: 'MENU',
          path: '/users',
          children: [],
        },
      ];
    }
    if (url.pathname === '/api/i18n/locales') {
      data = [
        { locale: 'zh-CN', label: 'Simplified Chinese', selectable: true },
        { locale: 'en-US', label: 'English (US)', selectable: true },
        { locale: 'ja-JP', label: 'Japanese', selectable: true },
      ];
    }
    if (url.pathname === '/api/i18n/catalog') {
      const locale = url.searchParams.get('locale');
      data = {
        locale,
        revision: 1,
        messages:
          locale === 'ja-JP'
            ? {
                'dict.project.status': 'プロジェクト状態',
                'dict.project.status.ENABLED': '有効',
                'config.welcome': 'ようこそ',
              }
            : {
                'dict.project.status': 'Project status',
                'dict.project.status.ENABLED': 'Enabled project',
                'config.welcome': 'Welcome',
              },
      };
    }
    if (url.pathname === '/api/auth/me/locale') {
      selectedLocale = 'ja-JP';
      data = { ...user, locale: selectedLocale };
    }
    if (url.pathname === '/api/current/notifications/summary') {
      data = { unreadCount: 0, recent: [] };
    }
    if (url.pathname === '/api/projects') {
      data = { records: [], total: 0, current: 1, pageSize: 100 };
    }
    if (url.pathname === '/api/metadata/dicts') {
      data = [
        {
          id: '100',
          scopeId: '0',
          dictCode: 'project.status',
          dictName: '业务项目状态',
          dictNameKey: 'dict.project.status',
          inheritGlobal: false,
          status: 'ENABLED',
          updatedAt: '2026-08-10T00:00:00',
        },
      ];
    }
    if (url.pathname === '/api/metadata/dicts/100/items') {
      data = [
        {
          id: '101',
          itemLabel: '启用',
          itemValue: 'ENABLED',
          sortNo: 10,
          defaultItem: true,
          labelI18nKey: 'dict.project.status.ENABLED',
          status: 'ENABLED',
        },
      ];
    }
    if (url.pathname === '/api/metadata/dicts/effective/platform.locale') {
      data = {
        dictCode: 'platform.locale',
        dictName: 'Languages',
        items: [
          {
            id: '1',
            itemLabel: 'English',
            itemValue: 'en-US',
            sortNo: 10,
            defaultItem: false,
            status: 'ENABLED',
          },
          {
            id: '2',
            itemLabel: 'Japanese',
            itemValue: 'ja-JP',
            sortNo: 20,
            defaultItem: false,
            status: 'ENABLED',
          },
        ],
      };
    }
    if (url.pathname === '/api/metadata/dicts/effective/common.status') {
      data = {
        dictCode: 'common.status',
        dictName: 'Status',
        items: [
          {
            id: '3',
            itemLabel: selectedLocale === 'ja-JP' ? '有効' : 'Enabled',
            itemValue: 'ENABLED',
            sortNo: 10,
            defaultItem: true,
            status: 'ENABLED',
          },
        ],
      };
    }
    if (url.pathname === '/api/metadata/dicts/effective/config.value.type') {
      valueTypeRequests += 1;
      data = {
        dictCode: 'config.value.type',
        dictName: 'Value type',
        items: [
          {
            id: '4',
            itemLabel: selectedLocale === 'ja-JP' ? '文字列' : 'String',
            itemValue: 'STRING',
            sortNo: 10,
            defaultItem: true,
            status: 'ENABLED',
          },
        ],
      };
    }
    if (url.pathname === '/api/metadata/configs') {
      data = [
        {
          id: '200',
          scopeId: '0',
          configKey: 'welcome',
          configValue: '欢迎',
          valueI18nKey: 'config.welcome',
          valueType: 'STRING',
          secret: false,
          status: 'ENABLED',
          sortNo: 10,
          createdAt: '2026-08-10T00:00:00',
          updatedAt: '2026-08-10T00:00:00',
        },
      ];
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ code: 0, message: 'success', data }),
    });
  });

  await page.goto('/dictionaries');
  await expect(page.getByText('Users', { exact: true })).toBeVisible();
  await expect(page.getByText('业务项目状态', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('启用', { exact: true })).toBeVisible();

  await page.getByLabel('Language').first().click();
  await page.getByText('Japanese', { exact: true }).click();

  await expect(page.getByText('ユーザー', { exact: true })).toBeVisible();
  await expect(page.getByText('プロジェクト状態', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('有効', { exact: true }).first()).toBeVisible();
  await expect.poll(() => menuRequests).toBeGreaterThan(1);

  await page.goto('/configs');
  await expect(page.getByText('ようこそ', { exact: true })).toBeVisible();
  await expect(page.getByText('文字列', { exact: true })).toBeVisible();
  expect(valueTypeRequests).toBeGreaterThan(0);
});

test('页面刷新通过 HttpOnly Cookie 恢复会话、语言和菜单', async ({ page }) => {
  let refreshRequests = 0;
  const japaneseUser = { ...user, locale: 'ja-JP' };
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url());
    const hasRefreshCookie = (await route.request().allHeaders()).cookie?.includes(
      'kaiwu_refresh=e2e-refresh',
    );
    if (url.pathname === '/api/auth/refresh' && !hasRefreshCookie) {
      await route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ code: 401, message: 'refresh cookie missing', data: null }),
      });
      return;
    }
    let data: unknown = [];
    if (url.pathname === '/api/auth/refresh') {
      refreshRequests += 1;
      data = {
        accessToken: `restored-access-${refreshRequests}`,
        expiresIn: 900,
        user: japaneseUser,
      };
    }
    if (url.pathname === '/api/auth/me') data = japaneseUser;
    if (url.pathname === '/api/auth/menus') {
      data = [{ id: 'users', name: 'ユーザー', type: 'MENU', path: '/users', children: [] }];
    }
    if (url.pathname === '/api/i18n/locales') {
      data = [{ locale: 'ja-JP', label: '日本語', selectable: true }];
    }
    if (url.pathname === '/api/i18n/catalog') {
      data = { locale: 'ja-JP', revision: 1, messages: {} };
    }
    if (url.pathname === '/api/current/notifications/summary') {
      data = { unreadCount: 0, recent: [] };
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ code: 0, message: 'success', data }),
    });
  });

  await page.goto('/login');
  await page.context().addCookies([
    {
      name: 'kaiwu_refresh',
      value: 'e2e-refresh',
      url: new URL(page.url()).origin,
      httpOnly: true,
      sameSite: 'Strict',
    },
  ]);

  await page.goto('/profile');
  await expect(page).toHaveURL(/\/profile$/);
  await expect(page.getByText('ユーザー', { exact: true })).toBeVisible();

  await page.reload();
  await expect(page).toHaveURL(/\/profile$/);
  await expect(page.getByText('ユーザー', { exact: true })).toBeVisible();
  await expect.poll(() => refreshRequests).toBe(2);
});

test('目标 catalog 加载失败时不写入用户语言偏好', async ({ page }) => {
  await bootstrapEnglishSession(page);
  let localeWrites = 0;
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url());
    let data: unknown = [];
    if (url.pathname === '/api/auth/me') data = user;
    if (url.pathname === '/api/auth/menus') data = [];
    if (url.pathname === '/api/i18n/locales') {
      data = [
        { locale: 'zh-CN', label: 'Simplified Chinese', selectable: true },
        { locale: 'en-US', label: 'English (US)', selectable: true },
      ];
    }
    if (url.pathname === '/api/i18n/catalog') {
      if (url.searchParams.get('locale') === 'zh-CN') {
        await route.fulfill({ status: 503, body: '{}' });
        return;
      }
      data = databaseCatalog('en-US');
    }
    if (url.pathname === '/api/auth/me/locale') localeWrites += 1;
    if (url.pathname === '/api/current/notifications/summary') {
      data = { unreadCount: 0, recent: [] };
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ code: 0, message: 'success', data }),
    });
  });

  await page.goto('/profile');
  await page.getByLabel('Language').first().click();
  await page.getByText('Simplified Chinese', { exact: true }).click();

  await expect.poll(() => localeWrites).toBe(0);
  await expect(page.getByLabel('Language').first()).toBeVisible();
});
