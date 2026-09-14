import { expect, test } from '@playwright/test';
import { createAdminApiContext } from './support/auth';
import { e2e, requireMutationPermission, runSuffix } from './support/env';

type Envelope<T> = { code: number; data: T };

/**
 * 新建用户的初始密码由管理员设定，首次登录必须先改掉。
 * 覆盖两点：登录响应带标记，以及前端会把未改密用户挡在个人中心。
 */
test.describe('首次登录强制改密', () => {
  test.beforeAll(requireMutationPermission);

  test('新建用户登录后被要求先修改密码', async ({ page, request }) => {
    const api = await createAdminApiContext(request);
    const suffix = runSuffix();
    const username = `e2e_pwd_${suffix}`;
    const password = `Init-${suffix}-Aa1`;

    const created = await api.post('/api/users', {
      data: {
        username,
        displayName: `E2E 改密用户 ${suffix}`,
        password,
      },
    });
    expect(created.ok(), await created.text()).toBeTruthy();

    const loginResponse = await request.post(`${e2e.baseURL}/api/auth/login`, {
      data: { username, password },
    });
    expect(loginResponse.ok(), await loginResponse.text()).toBeTruthy();
    const body = (await loginResponse.json()) as Envelope<{
      accessToken: string;
      expiresIn: number;
      user: { mustChangePassword?: boolean };
    }>;

    // 后端必须把标记透出来，否则前端无从判断。
    expect(body.data.user.mustChangePassword).toBe(true);

    await page.addInitScript((session) => {
      (
        window as Window & {
          __KAIWU_SESSION_BOOTSTRAP__?: unknown;
        }
      ).__KAIWU_SESSION_BOOTSTRAP__ = session;
    }, body.data);

    // 任意页面都会弹出强制改密弹窗，且不提供关闭入口。
    await page.goto('/users');
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText('请先修改初始密码', { exact: true })).toBeVisible();
    await expect(dialog.getByText('当前密码由管理员设定', { exact: false })).toBeVisible();
    // 没有关闭按钮：留出口等于没做强制。
    await expect(dialog.locator('.ant-modal-close')).toHaveCount(0);
  });
});
