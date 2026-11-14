import { expect, test, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const projectId = '9223372036854775807';
const project = {
  id: projectId,
  projectCode: 'c1probe',
  projectName: 'C1 项目',
  status: 'ACTIVE',
  builtIn: false,
  packageName: 'com.example.c1',
  defaultBranch: 'main',
  createdBy: '1',
};

/** 只模拟本地浏览器API；状态与请求保持在当前测试内，不调用共享环境。 */
async function fixture(
  page: Page,
  options: { canUpdate?: boolean; denied?: boolean; saveFailure?: boolean; builtIn?: boolean } = {},
) {
  const messages: Record<string, string> = {};
  for (const line of fs
    .readFileSync(
      path.resolve(process.env.KAIWU_SERVICE_DIR ?? '../kaiwu-system-service', 'sql/schema.sql'),
      'utf8',
    )
    .split('\n')) {
    const match = /^\s*\(\d{15,},\s*'([^']+)',\s*'((?:''|[^'])*)',\s*JSON_OBJECT/.exec(line);
    if (match) messages[match[1]] = match[2].replaceAll("''", "'");
  }
  const state = {
    mutations: [] as { method: string; pathname: string; body: unknown }[],
    rows: [
      { serviceCode: 'default', serviceUrl: 'http://default:8080', status: 'ENABLED' },
      { serviceCode: 'worker', serviceUrl: 'http://worker:8080', status: 'DISABLED' },
    ],
  };
  const user = {
    id: '1',
    username: 'admin',
    displayName: '本地C1管理员',
    locale: 'zh-CN',
    mustChangePassword: false,
    agentAutoOpen: false,
    permissions: [
      'system:project:list',
      ...(options.canUpdate === false ? [] : ['system:project:update']),
    ],
  };
  await page.route('**/api/**', async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    let data: unknown = [];
    let status = 200;
    if (url.pathname.endsWith('/i18n/catalog')) data = { locale: 'zh-CN', revision: 1, messages };
    if (url.pathname.endsWith('/i18n/locales'))
      data = [{ locale: 'zh-CN', label: '简体中文', selectable: true }];
    if (url.pathname === '/api/auth/refresh')
      data = { accessToken: 'fixture', expiresIn: 3600, user };
    if (url.pathname === '/api/auth/me') data = user;
    if (url.pathname === '/api/auth/menus')
      data = [{ id: 'projects', name: '项目管理', type: 'MENU', path: '/projects', children: [] }];
    if (url.pathname === '/api/current/projects')
      data = [{ id: 'system', projectCode: 'system', projectName: '平台', builtIn: true }];
    if (url.pathname === '/api/projects')
      data = {
        current: 1,
        size: 20,
        total: 1,
        records: [{ ...project, builtIn: Boolean(options.builtIn) }],
      };
    if (url.pathname === `/api/projects/${projectId}/backend-services`) {
      if (req.method() === 'GET') {
        if (options.denied) status = 403;
        else data = state.rows;
      } else {
        const body = req.postDataJSON() as { serviceCode: string; serviceUrl: string };
        state.mutations.push({ method: req.method(), pathname: url.pathname, body });
        if (options.saveFailure) status = 400;
        else {
          state.rows.push({ ...body, status: 'ENABLED' });
          data = state.rows.at(-1);
        }
      }
    }
    if (url.pathname.endsWith('/backend-services/worker/status')) {
      const body = req.postDataJSON() as { status: string };
      state.mutations.push({ method: req.method(), pathname: url.pathname, body });
      state.rows[1].status = body.status;
      data = state.rows[1];
    }
    if (url.pathname.endsWith('/gateway-routes'))
      data = {
        fragments: [
          {
            serviceCode: 'default',
            fragment: 'id: c1probe-project\naudience: kaiwu-c1probe-service',
          },
          {
            serviceCode: 'worker',
            fragment: 'id: c1probe.worker-project\naudience: kaiwu-c1probe.worker-service',
          },
        ],
      };
    await route.fulfill({
      status,
      json: {
        code: status === 200 ? 0 : status,
        message:
          status === 403 ? '不是目标项目管理员' : status === 400 ? '测试拒绝非法上游' : 'success',
        data: status === 200 ? data : null,
      },
    });
  });
  await page.goto('/projects');
  await page.getByRole('button', { name: 'C1 项目', exact: true }).click();
  return state;
}

test('目标项目管理员可登记并启用服务，19位项目ID不丢精度', async ({ page }) => {
  const state = await fixture(page);
  const panel = page.getByRole('region', { name: '后端服务' });
  await panel.getByRole('button', { name: '新增服务', exact: true }).click();
  const modal = page.getByRole('dialog', { name: '新增服务' });
  await modal.getByLabel('服务编码').fill('report');
  await modal.getByLabel('上游地址').fill('http://report:8080');
  await modal.getByRole('button', { name: /确\s*定/ }).click();
  await expect(panel.getByText('report', { exact: true })).toBeVisible();
  await panel.getByRole('button', { name: /启\s*用/, exact: true }).click();
  await page.getByRole('button', { name: /确\s*定/ }).click();
  await expect.poll(() => state.mutations.length).toBe(2);
  expect(state.mutations[0].pathname).toBe(`/api/projects/${projectId}/backend-services`);
  expect(state.mutations[1].body).toEqual({ status: 'ENABLED' });
});

test('目标项目授权失败时不展示写操作，刷新也不能绕过', async ({ page }) => {
  const state = await fixture(page, { denied: true });
  const panel = page.getByRole('region', { name: '后端服务' });
  await expect(panel.getByRole('alert')).toContainText('不是目标项目管理员');
  await expect(panel.getByRole('button', { name: '新增服务' })).toHaveCount(0);
  await panel.getByRole('button', { name: /刷\s*新/ }).click();
  await expect(panel.getByRole('alert')).toContainText('不是目标项目管理员');
  expect(state.mutations).toHaveLength(0);
});

test('只有平台查看权限时服务元数据可见但所有写按钮隐藏', async ({ page }) => {
  const state = await fixture(page, { canUpdate: false });
  const panel = page.getByRole('region', { name: '后端服务' });
  await expect(panel.getByText('http://worker:8080')).toBeVisible();
  for (const name of ['新增服务', '修改地址', /启\s*用/, /停\s*用/])
    await expect(panel.getByRole('button', { name, exact: true })).toHaveCount(0);
  expect(state.mutations).toHaveLength(0);
});

test('服务保存失败保留表单并显示真实错误，不伪造成功', async ({ page }) => {
  const state = await fixture(page, { saveFailure: true });
  const panel = page.getByRole('region', { name: '后端服务' });
  await panel.getByRole('button', { name: '新增服务', exact: true }).click();
  const modal = page.getByRole('dialog', { name: '新增服务' });
  await modal.getByLabel('服务编码').fill('report');
  await modal.getByLabel('上游地址').fill('http://invalid:8080');
  await modal.getByRole('button', { name: /确\s*定/ }).click();
  await expect(page.getByText('测试拒绝非法上游', { exact: true }).last()).toBeVisible();
  await expect(modal).toBeVisible();
  expect(state.rows).toHaveLength(2);
});

test('多服务片段按独立audience显示，旧default片段仍可审查', async ({ page }) => {
  await fixture(page);
  await page.locator('.ant-drawer-close').click();
  await page.locator('.kaiwu-more-trigger').click();
  await page.getByRole('button', { name: '网关路由', exact: true }).click();
  const modal = page.getByRole('dialog', { name: '网关路由' });
  await expect(modal).toContainText('kaiwu-c1probe-service');
  await expect(modal).toContainText('kaiwu-c1probe.worker-service');
  await expect(modal.locator('pre')).toHaveCount(2);
});

test('内置平台项目不展示业务后端服务登记面板', async ({ page }) => {
  await fixture(page, { builtIn: true });
  await expect(page.getByRole('region', { name: '后端服务' })).toHaveCount(0);
});
