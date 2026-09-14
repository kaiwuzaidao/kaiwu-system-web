import { expect, test, type Page } from '@playwright/test';
import { loginAsAdmin } from './support/auth';
import { requireAdminCredentials } from './support/env';

type TaskStatus = 'SUCCESS' | 'FAILED';

async function mockProjectWithGeneration(
  page: Page,
  status: TaskStatus,
  currentUserId: string,
  pushed = false,
) {
  const projectId = '1785241323838000888';
  const project = {
    id: projectId,
    projectCode: 'dual-repository',
    projectName: '双仓交付项目',
    description: '验证项目管理仓库入口',
    status: 'ACTIVE',
    builtIn: false,
    createdBy: currentUserId,
    packageName: 'com.kaiwu.dual',
    defaultBranch: 'main',
    createdAt: '2026-07-29T01:00:00',
    updatedAt: '2026-07-29T01:00:00',
  };
  const lastError = status === 'FAILED' ? 'AI 项目生成需要先配置并启用大模型 Provider' : undefined;

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
  await page.route('**/api/project-generations?projectId=*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        code: 0,
        message: 'success',
        data: [
          {
            taskNo: `PG-E2E-REPOSITORY-${status}`,
            projectId,
            projectCode: project.projectCode,
            projectName: project.projectName,
            generationMode: 'AI_PROJECT',
            status,
            templateVersion: 'e2e',
            backendFiles:
              status === 'SUCCESS' ? ['pom.xml', ...(pushed ? ['scripts/dev.sh'] : [])] : [],
            frontendFiles:
              status === 'SUCCESS' ? ['package.json', ...(pushed ? ['scripts/dev.sh'] : [])] : [],
            backendPushStatus: pushed ? 'PUSHED' : 'NOT_CONFIGURED',
            frontendPushStatus: pushed ? 'PUSHED' : 'NOT_CONFIGURED',
            backendRepositoryUrl: pushed
              ? 'https://gitlab.example/team/kaiwu-dual-repository-service'
              : undefined,
            frontendRepositoryUrl: pushed
              ? 'https://gitlab.example/team/kaiwu-dual-repository-web'
              : undefined,
            backendHttpCloneUrl: pushed
              ? 'https://gitlab.example/team/kaiwu-dual-repository-service.git'
              : undefined,
            frontendHttpCloneUrl: pushed
              ? 'https://gitlab.example/team/kaiwu-dual-repository-web.git'
              : undefined,
            backendSshCloneUrl: pushed
              ? 'git@gitlab.example:team/kaiwu-dual-repository-service.git'
              : undefined,
            frontendSshCloneUrl: pushed
              ? 'git@gitlab.example:team/kaiwu-dual-repository-web.git'
              : undefined,
            lastError,
            createdAt: '2026-07-29T01:01:00',
            updatedAt: '2026-07-29T01:02:00',
          },
        ],
      }),
    });
  });
}

test.beforeAll(requireAdminCredentials);

test('项目管理提供前后端仓库交付入口', async ({ page }) => {
  const session = await loginAsAdmin(page);
  await mockProjectWithGeneration(page, 'SUCCESS', session.user.id);
  await page.goto('/projects');

  await expect(page.getByRole('columnheader', { name: '单仓代码生成' })).toBeVisible();
  const projectRow = page.getByRole('row').filter({ hasText: '双仓交付项目' });
  await projectRow.getByRole('button', { name: '仓库交付' }).click();

  await expect(page.getByText('仓库交付：双仓交付项目', { exact: true })).toBeVisible();
  await expect(page.getByLabel('后端空仓库 URL')).toBeVisible();
  await expect(page.getByLabel('前端空仓库 URL')).toBeVisible();
});

test('生成失败时仓库入口展示阻塞原因', async ({ page }) => {
  const session = await loginAsAdmin(page);
  await mockProjectWithGeneration(page, 'FAILED', session.user.id);
  await page.goto('/projects');

  const projectRow = page.getByRole('row').filter({ hasText: '双仓交付项目' });
  await projectRow.getByRole('button', { name: '仓库交付' }).click();

  await expect(page.getByText('项目生成失败，暂时不能配置仓库', { exact: true })).toBeVisible();
  await expect(
    page.getByText('AI 项目生成需要先配置并启用大模型 Provider', { exact: true }),
  ).toBeVisible();
});

test('双仓推送成功后直接给出本地 AI Coding 初始化命令', async ({ page }) => {
  const session = await loginAsAdmin(page);
  await mockProjectWithGeneration(page, 'SUCCESS', session.user.id, true);
  await page.goto('/projects');

  const projectRow = page.getByRole('row').filter({ hasText: '双仓交付项目' });
  await projectRow.getByRole('button', { name: '仓库交付' }).click();
  await page.getByRole('button', { name: '开始本地 AI Coding' }).click();

  await expect(page.getByText('本地 AI Coding：双仓交付项目', { exact: true })).toBeVisible();
  await expect(page.getByText('创建同级工作区并克隆两个独立仓库', { exact: true })).toBeVisible();
  await expect(
    page.getByText(
      "git clone 'git@gitlab.example:team/kaiwu-dual-repository-service.git' 'kaiwu-dual-repository-service'",
      { exact: false },
    ),
  ).toBeVisible();
  await page.getByText('HTTPS', { exact: true }).click();
  await expect(
    page.getByText('https://gitlab.example/team/kaiwu-dual-repository-web.git', { exact: false }),
  ).toBeVisible();
});
