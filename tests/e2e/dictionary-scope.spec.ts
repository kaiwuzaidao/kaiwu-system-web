import { expect, test, type Page } from '@playwright/test';

const systemScopeId = '900000000000000001';

const user = {
  id: '1',
  username: 'admin',
  displayName: 'Administrator',
  permissions: [],
  locale: 'en-US',
  mustChangePassword: false,
};

async function bootstrapSession(page: Page) {
  await page.addInitScript((bootstrapUser) => {
    (window as Window & { __KAIWU_SESSION_BOOTSTRAP__?: unknown }).__KAIWU_SESSION_BOOTSTRAP__ = {
      accessToken: 'e2e-access',
      expiresIn: 3600,
      user: bootstrapUser,
    };
  }, user);
}

test('切换字典作用范围不会用旧 typeId 请求新 scope', async ({ page }) => {
  await bootstrapSession(page);
  const invalidItemRequests: string[] = [];

  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url());
    const scopeId = url.searchParams.get('scopeId');
    let data: unknown = [];

    if (url.pathname === '/api/auth/me') data = user;
    if (url.pathname === '/api/auth/menus') {
      data = [
        {
          id: 'dictionaries',
          name: 'Dictionaries',
          type: 'MENU',
          path: '/dictionaries',
          children: [],
        },
      ];
    }
    if (url.pathname === '/api/i18n/locales') {
      data = [{ locale: 'en-US', label: 'English (US)', selectable: true }];
    }
    if (url.pathname === '/api/i18n/catalog') {
      data = { locale: 'en-US', revision: 1, messages: {} };
    }
    if (url.pathname === '/api/current/notifications/summary') {
      data = { unreadCount: 0, recent: [] };
    }
    if (url.pathname === '/api/projects') {
      data = {
        current: 1,
        size: 100,
        total: 1,
        records: [
          {
            id: systemScopeId,
            projectCode: 'system',
            projectName: 'Kaiwu System',
            status: 'ACTIVE',
            builtIn: true,
            createdBy: '1',
            packageName: 'com.kaiwu.system',
            defaultBranch: 'main',
            createdAt: '2026-08-10T00:00:00',
            updatedAt: '2026-08-10T00:00:00',
          },
        ],
      };
    }
    if (url.pathname === '/api/metadata/dicts/effective/platform.locale') {
      data = { dictCode: 'platform.locale', dictName: 'Languages', items: [] };
    }
    if (url.pathname === '/api/metadata/dicts/effective/common.status') {
      data = { dictCode: 'common.status', dictName: 'Status', items: [] };
    }
    if (url.pathname === '/api/metadata/dicts') {
      data =
        scopeId === systemScopeId
          ? [
              {
                id: '200',
                scopeId: systemScopeId,
                dictCode: 'system.status',
                dictName: 'System dictionary',
                inheritGlobal: false,
                status: 'ENABLED',
              },
            ]
          : [
              {
                id: '100',
                scopeId: '0',
                dictCode: 'global.status',
                dictName: 'Global dictionary',
                inheritGlobal: false,
                status: 'ENABLED',
              },
            ];
    }
    if (url.pathname.startsWith('/api/metadata/dicts/') && url.pathname.endsWith('/items')) {
      const typeId = url.pathname.split('/')[4];
      const valid =
        (scopeId === '0' && typeId === '100') || (scopeId === systemScopeId && typeId === '200');
      if (!valid) {
        invalidItemRequests.push(`${scopeId}:${typeId}`);
        await route.fulfill({
          status: 404,
          contentType: 'application/json',
          body: JSON.stringify({
            code: 404,
            message: 'Requested resource does not exist',
            data: null,
          }),
        });
        return;
      }
      data = [];
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ code: 0, message: 'success', data }),
    });
  });

  await page.goto('/dictionaries');
  await expect(page.getByRole('heading', { name: 'Global dictionary' })).toBeVisible();

  await page.locator('.ant-select').first().click();
  await page
    .locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option')
    .nth(1)
    .click();

  await expect(page.getByRole('heading', { name: 'System dictionary' })).toBeVisible();
  await expect.poll(() => invalidItemRequests).toEqual([]);
});
