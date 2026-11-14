import { expect, test, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

type Options = { projects?: unknown[]; mustChangePassword?: boolean };

const systemProject = {
  id: 'p-system',
  projectCode: 'system',
  projectName: 'Kaiwu 平台',
  status: 'ACTIVE',
  builtIn: true,
};
const crm = {
  id: 'p-crm',
  projectCode: 'crm',
  projectName: '客户管理后台',
  status: 'ACTIVE',
  builtIn: false,
  backendUrl: '/apps/crm/',
  backendLabel: 'CRM 后台',
};
// 成员但还没配置后台入口：无处可去，不应出现在选择页。
const noEntry = {
  id: 'p-noentry',
  projectCode: 'noentry',
  projectName: '未配置入口项目',
  status: 'ACTIVE',
  builtIn: false,
};

/** 已登录会话 + 当前用户的项目清单；文案取后端 schema 快照，与线上同源。 */
async function mockSession(page: Page, options: Options = {}) {
  const messages: Record<string, string> = {};
  const schema = path.resolve(
    process.env.KAIWU_SERVICE_DIR ?? '../kaiwu-system-service',
    'sql/schema.sql',
  );
  for (const line of fs.readFileSync(schema, 'utf8').split('\n')) {
    const match = /^\s*\(\d{15,},\s*'([^']+)',\s*'((?:''|[^'])*)',\s*JSON_OBJECT/.exec(line);
    if (match) messages[match[1]] = match[2].replaceAll("''", "'");
  }
  const user = {
    id: '1789248125900000001',
    username: 'member',
    displayName: '项目成员',
    locale: 'zh-CN',
    agentAutoOpen: false,
    mustChangePassword: Boolean(options.mustChangePassword),
    permissions: [],
  };
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url());
    let data: unknown = [];
    if (url.pathname.endsWith('/i18n/catalog')) data = { locale: 'zh-CN', revision: 1, messages };
    if (url.pathname.endsWith('/i18n/locales'))
      data = [{ locale: 'zh-CN', label: '简体中文', selectable: true }];
    if (url.pathname === '/api/auth/refresh')
      data = { accessToken: 'fixture', expiresIn: 3600, user };
    if (url.pathname === '/api/auth/me') data = user;
    if (url.pathname === '/api/current/projects')
      data = options.projects ?? [systemProject, crm, noEntry];
    await route.fulfill({ json: { code: 0, data } });
  });
  // 业务前端由平台同源托管；这里只需要让 iframe 有页面可加载。
  await page.route('**/apps/crm/**', (route) =>
    route.fulfill({ contentType: 'text/html', body: '<title>crm</title>' }),
  );
}

test.describe('登录后的项目选择', () => {
  test('默认进入项目选择页，只列出有权限且有入口的项目', async ({ page }) => {
    await mockSession(page);
    await page.goto('/login');

    await expect(page).toHaveURL(/\/select-project$/);
    await expect(page.getByRole('heading', { name: '选择要进入的项目' })).toBeVisible();
    await expect(page.locator('.kaiwu-select-card')).toHaveCount(2);
    await expect(page.locator('.kaiwu-select-card').first()).toContainText('Kaiwu 平台');
    await expect(page.locator('.kaiwu-select-card').nth(1)).toContainText('客户管理后台');
    await expect(page.getByText('未配置入口项目')).toHaveCount(0);
  });

  test('点击业务项目进入其宿主页，点击平台进入工作台', async ({ page }) => {
    await mockSession(page);
    await page.goto('/select-project');
    await page.locator('.kaiwu-select-card', { hasText: '客户管理后台' }).click();
    await expect(page).toHaveURL(/\/workspace\/p-crm$/);

    await page.goto('/select-project');
    await page.locator('.kaiwu-select-card', { hasText: 'Kaiwu 平台' }).click();
    await expect(page).toHaveURL(/\/$/);
  });

  test('其他项目带 ?project=<编码> 跳来登录，直接进入对应项目', async ({ page }) => {
    await mockSession(page);
    await page.goto('/login?project=crm');

    await expect(page).toHaveURL(/\/workspace\/p-crm$/);
  });

  test('目标项目不可访问时回到选择页并提示，不会越权跳转', async ({ page }) => {
    await mockSession(page);
    await page.goto('/login?project=forbidden-project');

    await expect(page).toHaveURL(/\/select-project\?denied=forbidden-project$/);
    await expect(page.getByRole('alert')).toContainText('forbidden-project');
    // 没有入口的项目同样视为不可进入。
    await page.goto('/login?project=noentry');
    await expect(page).toHaveURL(/\/select-project\?denied=noentry$/);
  });

  test('需要强制改密的用户不能经 ?project= 绕过改密直达业务后台', async ({ page }) => {
    await mockSession(page, { mustChangePassword: true });
    await page.goto('/login?project=crm');

    await expect(page).toHaveURL(/\/select-project/);
    await expect(page.locator('.ant-modal')).toBeVisible();
  });

  test('没有任何可访问项目时显示引导', async ({ page }) => {
    await mockSession(page, { projects: [] });
    await page.goto('/select-project');

    await expect(page.getByText('还没有可访问的项目')).toBeVisible();
    await expect(page.locator('.kaiwu-select-card')).toHaveCount(0);
  });
  test('只有一个可进入的项目时登录后自动进入', async ({ page }) => {
    await mockSession(page, { projects: [crm, noEntry] });
    await page.goto('/login');
    await expect(page).toHaveURL(/\/workspace\/p-crm$/);
  });

  test('只有平台一个项目时自动进入工作台', async ({ page }) => {
    await mockSession(page, { projects: [systemProject] });
    await page.goto('/login');
    await expect(page).toHaveURL(/\/$/);
  });

  test('打开方式偏好为新标签页时，自动进入仍在当前页（不会被浏览器拦截）', async ({ page }) => {
    await page.addInitScript(() => window.localStorage.setItem('kaiwu.projectOpenMode', 'newTab'));
    await mockSession(page, { projects: [crm] });
    await page.goto('/login?project=crm');
    await expect(page).toHaveURL(/\/workspace\/p-crm$/);
  });

  test('只有一个项目但需要强制改密时，先落在选择页', async ({ page }) => {
    await mockSession(page, { projects: [crm], mustChangePassword: true });
    await page.goto('/login');
    await expect(page).toHaveURL(/\/select-project/);
    await expect(page.locator('.ant-modal')).toBeVisible();
  });

  test('直接访问选择页不会自动进入：后退与手动回来都能看到清单', async ({ page }) => {
    await mockSession(page, { projects: [crm] });
    await page.goto('/select-project');
    await expect(page.locator('.kaiwu-select-card')).toHaveCount(1);
    await expect(page).toHaveURL(/\/select-project$/);
  });
});
