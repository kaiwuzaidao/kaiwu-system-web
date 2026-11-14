import { expect, test, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const actionId = '398c978f-8aa9-4d72-b6ed-afcf4709357a';
const token = 'r'.repeat(43);
const phrase = '确认 abcdef12';

async function setup(page: Page, dropped = false) {
  const user = {
    id: '1',
    username: 'admin',
    displayName: '测试管理员',
    locale: 'zh-CN',
    mustChangePassword: false,
    permissions: ['system:agent:ask', 'system:project:list'],
  };
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
  const action = {
    actionId,
    projectId: '1788074432190000001',
    projectCode: 'crm',
    capabilityCode: 'crm.record.update',
    capabilityName: '更新客户记录',
    version: '1',
    status: 'PENDING',
    confirmationMode: 'STRONG',
    displayFields: { recordName: '重点客户', newStatus: '已审核' },
    displayLabels: { recordName: '客户名称', newStatus: '目标状态' },
    affectedCount: 1,
    expiresAt: new Date(Date.now() + 300000).toISOString(),
  };
  const state = { confirms: [] as unknown[], reads: 0, status: 'PENDING' };
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    let data: unknown = [];
    if (url.pathname.endsWith('/i18n/catalog')) data = { locale: 'zh-CN', revision: 51, messages };
    if (url.pathname.endsWith('/i18n/locales'))
      data = [{ locale: 'zh-CN', label: '简体中文', selectable: true }];
    if (url.pathname === '/api/auth/me') data = user;
    if (url.pathname === '/api/auth/refresh')
      data = { accessToken: 'e2e-access', expiresIn: 3600, user };
    if (url.pathname === '/api/auth/menus')
      data = [{ id: 'projects', name: '项目管理', type: 'MENU', path: '/projects', children: [] }];
    if (url.pathname === '/api/current/projects')
      data = [
        {
          id: action.projectId,
          projectCode: action.projectCode,
          projectName: 'CRM 后台',
          status: 'ACTIVE',
          backendUrl: 'http://127.0.0.1:8000/crm',
        },
      ];
    if (url.pathname === '/api/projects') data = { current: 1, size: 20, total: 0, records: [] };
    if (url.pathname.endsWith('/messages') && request.method() === 'POST')
      data = {
        answer: '请核对更新客户记录的预览。',
        cards: [],
        pendingRemoteAction: {
          ...action,
          confirmationToken: token,
          confirmationPhrase: phrase,
        },
      };
    if (url.pathname === `/api/agent/remote-actions/${actionId}/confirm`) {
      state.confirms.push(request.postDataJSON());
      state.status = 'SUCCEEDED';
      if (dropped) {
        await route.abort('failed');
        return;
      }
      data = { ...action, status: state.status, result: { recordId: '123' } };
    }
    if (url.pathname === `/api/agent/remote-actions/${actionId}`) {
      state.reads += 1;
      data = {
        ...action,
        status: state.status,
        ...(state.status === 'SUCCEEDED' ? { result: { recordId: '123' } } : {}),
      };
    }
    if (url.pathname === `/api/agent/remote-actions/${actionId}/cancel`)
      data = { ...action, status: 'CANCELLED' };
    if (url.pathname === '/api/agent/conversations')
      data =
        request.method() === 'POST'
          ? {
              id: '9000000000000000101',
              title: '测试会话',
              useMemory: true,
              updatedAt: new Date().toISOString(),
            }
          : { current: 1, size: 20, total: 0, records: [] };
    if (url.pathname.endsWith('/messages') && request.method() === 'POST')
      data = { messageId: '9000000000000000201', answer: data };
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ code: 0, data, message: 'ok' }),
    });
  });
  await page.goto('/projects');
  await page
    .locator('#root .kaiwu-header-actions')
    .getByRole('button', { name: 'AI 助手模式', exact: true })
    .click();
  await page.getByPlaceholder('向开物提问，或描述你要完成的任务…').fill('把重点客户更新为已审核');
  await page.getByRole('button', { name: /发\s*送/ }).click();
  await expect(
    page.locator('.agent-dock-main').getByText('更新客户记录', { exact: true }),
  ).toBeVisible();
  return state;
}

test('真实业务预览以中文卡片显示，强确认必须手输且只执行一次', async ({ page }) => {
  const state = await setup(page);
  await expect(page.getByText('重点客户', { exact: true })).toBeVisible();
  await expect(page.getByText('客户名称', { exact: true })).toBeVisible();
  await expect(page.getByText('预计影响数量', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '确认执行', exact: true })).toBeDisabled();
  await page.getByRole('textbox', { name: '输入确认语' }).fill(phrase);
  await page.getByRole('button', { name: '确认执行', exact: true }).dblclick();
  await expect(page.getByText('操作已完成。', { exact: true })).toBeVisible();
  await expect(page.getByText('recordId', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '查看项目列表', exact: true })).toBeVisible();
  expect(state.confirms).toEqual([{ confirmationToken: token, typedPhrase: phrase }]);
  const storage = await page.evaluate(() =>
    JSON.stringify([Object.entries(localStorage), Object.entries(sessionStorage)]),
  );
  expect(storage).not.toContain(token);
  expect(storage).not.toContain(phrase);
  await page.getByRole('button', { name: '查看项目列表', exact: true }).click();
  await expect(
    page.getByRole('dialog').getByText('暂无数据', { exact: true }).last(),
  ).toBeVisible();
  await expect(page).toHaveURL(/\/projects$/);
  expect(page.context().pages()).toHaveLength(1);
});

test('确认响应丢失时只查状态，不再次执行', async ({ page }) => {
  const state = await setup(page, true);
  await page.getByRole('textbox', { name: '输入确认语' }).fill(phrase);
  await page.getByRole('button', { name: '确认执行', exact: true }).click();
  await expect(page.getByText('结果待核验', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '查询操作状态', exact: true }).click();
  await expect(page.getByText('操作已完成。', { exact: true })).toBeVisible();
  expect(state.confirms).toHaveLength(1);
  expect(state.reads).toBe(1);
});
