import { expect, test } from '@playwright/test';

test('登录表单不预填账号，提交失败可重试并成功进入项目选择', async ({ page }) => {
  const user = {
    id: '1789248125900000001',
    username: 'member',
    displayName: 'Member',
    locale: 'zh-CN',
    permissions: [],
    mustChangePassword: false,
  };
  let attempts = 0;
  await page.route('**/api/**', async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname === '/api/auth/refresh')
      return route.fulfill({ status: 401, json: { code: 401, message: 'unauthorized' } });
    if (pathname === '/api/auth/login') {
      attempts += 1;
      expect(route.request().postDataJSON()).toEqual({
        username: 'member',
        password: 'test-password',
      });
      if (attempts === 1)
        return route.fulfill({ status: 401, json: { code: 401, message: 'Login failed' } });
      return route.fulfill({
        json: { code: 0, data: { accessToken: 'fixture', expiresIn: 3600, user } },
      });
    }
    let data: unknown = [];
    if (pathname.endsWith('/i18n/catalog')) data = { locale: 'zh-CN', revision: 1, messages: {} };
    if (pathname === '/api/current/projects') data = [];
    if (pathname === '/api/auth/me') data = user;
    return route.fulfill({ json: { code: 0, data } });
  });
  await page.goto('/login');
  const username = page.locator('input#username');
  await expect(username).toHaveValue('');
  await username.fill('member');
  await page.locator('input#password').fill('test-password');
  await page.getByRole('button', { name: /登\s*录/ }).click();
  await expect(page.getByText('Login failed')).toBeVisible();
  await page.getByRole('button', { name: /登\s*录/ }).click();
  await expect(page).toHaveURL(/\/select-project$/);
  expect(attempts).toBe(2);
});
