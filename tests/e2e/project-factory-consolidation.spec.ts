import { expect, test, type Page } from '@playwright/test';
import { loginAsAdmin } from './support/auth';
import { requireAdminCredentials } from './support/env';

const PROJECT_ID = '1785241323838000999';

/**
 * 一个 ACTIVE 且当前用户没有任何生成任务的项目。
 *
 * 「生成第一版」的出现条件就是"项目存在但没有生成任务"，所以生成任务列表必须返回空数组。
 */
async function mockProjectWithoutGeneration(page: Page, currentUserId: string) {
  const project = {
    id: PROJECT_ID,
    projectCode: 'pending-generation',
    projectName: '待生成项目',
    description: '验证项目上的生成第一版入口',
    status: 'ACTIVE',
    builtIn: false,
    createdBy: currentUserId,
    packageName: 'com.kaiwu.pending',
    defaultBranch: 'main',
    createdAt: '2026-07-29T01:00:00',
    updatedAt: '2026-07-29T01:00:00',
  };

  await page.route('**/api/projects?**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        code: 0,
        message: 'success',
        data: { current: 1, size: 20, total: 1, records: [project] },
      }),
    });
  });
  await page.route('**/api/current/projects', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ code: 0, message: 'success', data: [project] }),
    });
  });
  await page.route('**/api/project-generations', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ code: 0, message: 'success', data: [] }),
    });
  });
}

test.beforeAll(requireAdminCredentials);

test('项目工厂只做任务管理，不再提供补生成表单', async ({ page }) => {
  const session = await loginAsAdmin(page);
  await mockProjectWithoutGeneration(page, session.user.id);
  await page.goto('/project-factory');

  await expect(page.getByText('我的项目生成', { exact: true })).toBeVisible();
  await expect(page.getByText('存量项目补生成', { exact: true })).toHaveCount(0);
  await expect(page.getByLabel('目标项目')).toHaveCount(0);
  await expect(page.getByLabel('业务描述')).toHaveCount(0);
});

test('已废弃的 legacy 深链不再展开任何表单', async ({ page }) => {
  const session = await loginAsAdmin(page);
  await mockProjectWithoutGeneration(page, session.user.id);
  await page.goto('/project-factory?legacy=1');

  await expect(page.getByText('我的项目生成', { exact: true })).toBeVisible();
  await expect(page.getByLabel('目标项目')).toHaveCount(0);
  await expect(page.getByLabel('业务描述')).toHaveCount(0);
});

test('项目管理为尚未生成的项目提供「生成第一版」', async ({ page }) => {
  const session = await loginAsAdmin(page);
  await mockProjectWithoutGeneration(page, session.user.id);
  await page.goto('/projects');

  const projectRow = page.getByRole('row').filter({ hasText: '待生成项目' });
  await projectRow.getByRole('button', { name: '操作' }).click();
  await page.getByRole('button', { name: '生成第一版' }).click();

  await expect(page.getByText('生成第一版：待生成项目', { exact: true })).toBeVisible();
  await expect(page.getByLabel('生成方式')).toHaveCount(0);
  await expect(page.getByLabel('MySQL DDL')).toHaveCount(0);
  await expect(page.getByRole('button', { name: '从 MySQL 只读导入结构' })).toHaveCount(0);
  await expect(page.getByText('基础空脚手架', { exact: false }).first()).toBeVisible();
});
