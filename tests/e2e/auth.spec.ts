import { expect, test } from '@playwright/test';

test('未登录访问受保护页面会跳转到登录页', async ({ page }) => {
  await page.goto('/users');

  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByText('登录管理后台', { exact: true })).toBeVisible();
});

test('登录页拒绝缺失密码的提交', async ({ page }) => {
  await page.goto('/login');

  await page.getByRole('button', { name: /登\s*录/ }).click();

  await expect(page.getByText('请输入密码', { exact: true })).toBeVisible();
});
