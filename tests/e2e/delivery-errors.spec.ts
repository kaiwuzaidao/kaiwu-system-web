import { expect, test } from '@playwright/test';

async function bootstrapProjectFactory(page: import('@playwright/test').Page) {
  await page.addInitScript(() => {
    (
      window as Window & {
        __KAIWU_SESSION_BOOTSTRAP__?: unknown;
      }
    ).__KAIWU_SESSION_BOOTSTRAP__ = {
      accessToken: 'e2e-access',
      expiresIn: 3600,
      user: {
        id: '1',
        username: 'admin',
        displayName: '管理员',
        permissions: [
          'system:project-factory:list',
          'system:project-factory:generate',
          'system:project-factory:download',
          'system:project-factory:push',
        ],
        mustChangePassword: false,
      },
    };
  });
  await page.route('**/api/**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ code: 0, message: 'success', data: [] }),
    });
  });
  await page.route('**/api/auth/menus', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        code: 0,
        message: 'success',
        data: [
          {
            id: 'factory',
            name: '项目工厂',
            type: 'MENU',
            path: '/project-factory',
            children: [],
          },
        ],
      }),
    });
  });
}

test('项目工厂直接展示生成失败原因', async ({ page }) => {
  const taskNo = 'PG-E2E-FAILED-DETAIL';
  const lastError = 'AI 项目生成需要先配置并启用大模型 Provider';

  await bootstrapProjectFactory(page);
  await page.route('**/api/project-generations', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        code: 0,
        message: 'success',
        data: [
          {
            taskNo,
            projectId: '1785241323838000999',
            projectCode: 'failed-detail',
            projectName: '失败原因展示项目',
            generationMode: 'AI_PROJECT',
            status: 'FAILED',
            templateVersion: 'e2e',
            backendFiles: [],
            frontendFiles: [],
            backendPushStatus: 'NOT_PUSHED',
            frontendPushStatus: 'NOT_PUSHED',
            lastError,
            completedAt: '2026-07-28T06:24:29',
            createdAt: '2026-07-28T06:24:28',
            updatedAt: '2026-07-28T06:24:29',
          },
        ],
      }),
    });
  });

  await page.goto('/project-factory');
  const taskRow = page.getByRole('row').filter({ hasText: '失败原因展示项目' });
  await expect(taskRow).toBeVisible();
  await expect(taskRow.getByText(lastError, { exact: true })).toBeVisible();
});

test('旧交付中心地址兼容跳转到项目工厂', async ({ page }) => {
  await bootstrapProjectFactory(page);

  await page.goto('/deliveries');

  await expect(page).toHaveURL(/\/project-factory$/);
  await expect(page.getByText('项目工厂', { exact: true }).first()).toBeVisible();
});
