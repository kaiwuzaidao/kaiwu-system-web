import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

test('项目生成只提交基础脚手架', async ({ page }) => {
  const messages: Record<string, string> = {};
  const sql = fs.readFileSync(
    path.resolve(process.env.KAIWU_SERVICE_DIR ?? '../kaiwu-system-service', 'sql/schema.sql'),
    'utf8',
  );
  for (const line of sql.split('\n')) {
    const match = /^\s*\(\d{15,},\s*'([^']+)',\s*'((?:''|[^'])*)',\s*JSON_OBJECT/.exec(line);
    if (match) messages[match[1]] = match[2].replaceAll("''", "'");
  }
  const user = {
    id: '1',
    username: 'admin',
    displayName: '管理员',
    locale: 'zh-CN',
    mustChangePassword: false,
    permissions: [
      'system:project:list',
      'system:project-factory:list',
      'system:project-factory:generate',
    ],
  };
  const project = {
    id: '1785241323838000999',
    projectCode: 'demo',
    projectName: '测试项目',
    status: 'ACTIVE',
    builtIn: false,
    createdBy: '1',
    packageName: 'com.example.demo',
    defaultBranch: 'main',
  };
  const submitted: unknown[] = [];
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    let data: unknown = [];
    if (url.pathname.endsWith('/i18n/catalog')) data = { locale: 'zh-CN', revision: 1, messages };
    if (url.pathname.endsWith('/i18n/locales'))
      data = [{ locale: 'zh-CN', label: '简体中文', selectable: true }];
    if (url.pathname === '/api/auth/me') data = user;
    if (url.pathname === '/api/auth/refresh')
      data = { accessToken: 'e2e-access', expiresIn: 3600, user };
    if (url.pathname === '/api/auth/menus')
      data = [{ id: 'projects', name: '项目管理', type: 'MENU', path: '/projects', children: [] }];
    if (url.pathname === '/api/current/projects') data = [project];
    if (url.pathname === '/api/projects')
      data = { current: 1, size: 20, total: 1, records: [project] };
    if (url.pathname === '/api/project-generations' && request.method() === 'POST') {
      submitted.push(request.postDataJSON());
      data = {
        taskNo: 'PG-test',
        projectId: project.id,
        generationMode: 'BASIC_SCAFFOLD',
        status: 'PENDING',
      };
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ code: 0, message: 'ok', data }),
    });
  });
  await page.goto('/projects');
  const row = page.getByRole('row').filter({ hasText: '测试项目' });
  await row.getByRole('button', { name: '操作' }).click();
  await page.getByRole('button', { name: '生成第一版' }).click();
  await expect(page.getByLabel('MySQL DDL')).toHaveCount(0);
  await expect(page.getByRole('button', { name: '从 MySQL 只读导入结构' })).toHaveCount(0);
  await page.getByRole('button', { name: '提交生成' }).click();
  await expect.poll(() => submitted.length).toBe(1);
  expect(submitted[0]).toEqual({ projectId: project.id, generationMode: 'BASIC_SCAFFOLD' });
});
