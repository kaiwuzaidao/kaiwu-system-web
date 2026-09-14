import { expect, test } from '@playwright/test';
import { createAdminApiContext, loginAsAdmin } from './support/auth';
import { e2e, requireGenerationPermission, runSuffix } from './support/env';

type Envelope<T> = { code: number; data: T };

test.describe.serial('项目开通失败恢复', () => {
  test.beforeAll(requireGenerationPermission);

  test('创建人不会出现在初始普通成员候选中', async ({ page }) => {
    const suffix = runSuffix();
    const session = await loginAsAdmin(page);
    const currentUser = session.user;
    await page.route('**/api/users?**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          code: 0,
          message: 'success',
          data: {
            current: 1,
            size: 100,
            total: 1,
            records: [
              {
                ...currentUser,
                status: 'ENABLED',
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              },
            ],
          },
        }),
      });
    });
    const usersLoaded = page.waitForResponse(
      (response) => response.url().includes('/api/users?') && response.ok(),
    );
    await page.goto('/project-onboarding');
    await usersLoaded;

    await page.getByLabel('项目编码').fill(`owner-safe-${suffix}`.slice(0, 64));
    await page.getByLabel('项目名称').fill(`创建人保护 ${suffix}`);
    await page.getByRole('button', { name: '下一步' }).click();
    await page.locator('.ant-select-selector').click();
    await page.getByRole('combobox').fill(e2e.adminUsername);

    const dropdown = page.locator('.ant-select-dropdown:visible');
    await expect(dropdown).toBeVisible();
    await expect(
      dropdown.getByText(`${currentUser.displayName}（${currentUser.username}）`, { exact: true }),
    ).toHaveCount(0);
  });

  test('本人创建但未生成的同编码项目可以继续开通', async ({ page, request }) => {
    test.setTimeout(120_000);
    const suffix = runSuffix();
    const projectCode = `resume-${suffix}`.slice(0, 64);
    const projectName = `续办项目 ${suffix}`;
    const packageName = `com.kaiwu.resume${suffix}`;
    const api = await createAdminApiContext(request);
    let projectId = '';

    try {
      const created = await api.post('/api/projects', {
        data: { projectCode, projectName, packageName },
      });
      expect(created.ok(), await created.text()).toBeTruthy();
      projectId = ((await created.json()) as Envelope<{ id: string }>).data.id;

      const role = await api.post(`/api/projects/${projectId}/roles`, {
        data: {
          roleCode: 'project-member',
          roleName: '项目成员',
          description: '由项目开通向导创建的基础成员角色',
        },
      });
      expect(role.ok(), await role.text()).toBeTruthy();

      await loginAsAdmin(page);
      await page.goto('/project-onboarding');
      await page.getByLabel('项目编码').fill(projectCode);
      await page.getByLabel('项目名称').fill(projectName);
      await page.getByLabel('Java 包名').fill(packageName);
      await page.getByRole('button', { name: '下一步' }).click();
      await page.getByRole('button', { name: '下一步' }).click();
      await page.getByText('基础脚手架', { exact: true }).click();
      await page.getByRole('button', { name: '下一步' }).click();
      await page.getByRole('button', { name: '创建并生成' }).click();

      await expect(page.getByText('项目开通流程已提交', { exact: true })).toBeVisible();
      const tasks = await api.get(`/api/project-generations?projectId=${projectId}`);
      expect(tasks.ok(), await tasks.text()).toBeTruthy();
      const task = ((await tasks.json()) as Envelope<Array<{ taskNo: string }>>).data[0];
      expect(task?.taskNo).toBeTruthy();

      let status = 'PENDING';
      for (let attempt = 0; attempt < 24 && ['PENDING', 'RUNNING'].includes(status); attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 2_000));
        const taskResponse = await api.get(`/api/project-generations/${task.taskNo}`);
        const taskBody = (await taskResponse.json()) as Envelope<{ status: string }>;
        status = taskBody.data.status;
      }
      expect(status).toBe('SUCCESS');
    } finally {
      if (projectId) {
        await api.put(`/api/projects/${projectId}/status`, {
          data: { status: 'ARCHIVED' },
        });
      }
    }
  });
});
