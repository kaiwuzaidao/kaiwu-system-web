import { expect, test } from '@playwright/test';

const user = {
  id: '1',
  username: 'admin',
  displayName: 'Administrator',
  permissions: [],
  locale: 'zh-CN',
  mustChangePassword: false,
};

/**
 * 刷新令牌每次轮换且各标签页共享同一个 Cookie：两个标签页同时恢复会话时，
 * 没有跨标签页串行化的话，后到的那个带着已作废的令牌得到 401，会被登出。
 */
test('两个标签页同时恢复会话不会因令牌轮换被登出', async ({ context }) => {
  let currentToken = 'rt-0';
  let rotations = 0;
  await context.route('**/api/**', async (route) => {
    const url = new URL(route.request().url());
    let data: unknown = [];
    if (url.pathname === '/api/auth/refresh') {
      const cookie = (await route.request().allHeaders()).cookie ?? '';
      // 放宽窗口，让并发请求在未串行化时必然交错。
      await new Promise((resolve) => setTimeout(resolve, 300));
      if (!cookie.includes(`kaiwu_refresh=${currentToken}`)) {
        await route.fulfill({
          status: 401,
          contentType: 'application/json',
          body: JSON.stringify({ code: 401, message: 'stale refresh token', data: null }),
        });
        return;
      }
      rotations += 1;
      currentToken = `rt-${rotations}`;
      // route.fulfill 的 set-cookie 不会及时写进浏览器的 Cookie 罐，直接写罐才能模拟轮换。
      await context.addCookies([
        {
          name: 'kaiwu_refresh',
          value: currentToken,
          url: route.request().url(),
          httpOnly: true,
          sameSite: 'Strict',
        },
      ]);
      data = { accessToken: `access-${rotations}`, expiresIn: 900, user };
    }
    if (url.pathname === '/api/auth/me') data = user;
    if (url.pathname === '/api/auth/menus') {
      data = [{ id: 'users', name: '用户', type: 'MENU', path: '/users', children: [] }];
    }
    if (url.pathname === '/api/i18n/locales') {
      data = [{ locale: 'zh-CN', label: '简体中文', selectable: true }];
    }
    if (url.pathname === '/api/i18n/catalog') {
      data = { locale: 'zh-CN', revision: 1, messages: {} };
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

  const first = await context.newPage();
  await first.goto('/login');
  await context.addCookies([
    {
      name: 'kaiwu_refresh',
      value: currentToken,
      url: new URL(first.url()).origin,
      httpOnly: true,
      sameSite: 'Strict',
    },
  ]);
  const second = await context.newPage();

  await Promise.all([first.goto('/profile'), second.goto('/profile')]);

  // 先等两个标签页都渲染出菜单，再判定结果：登出是异步跳转，只看 URL 会误判通过。
  await expect(first.getByText('用户', { exact: true })).toBeVisible();
  await expect(second.getByText('用户', { exact: true })).toBeVisible();
  await expect(first).toHaveURL(/\/profile$/);
  await expect(second).toHaveURL(/\/profile$/);
  expect(rotations).toBeGreaterThanOrEqual(2);
});
