import { expect, test, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const project = {
  id: 'p-crm',
  projectCode: 'crm',
  projectName: '客户管理',
  status: 'ACTIVE',
  builtIn: false,
  createdBy: '1',
  packageName: 'com.example.crm',
  defaultBranch: 'main',
  createdAt: '2026-10-01T00:00:00',
  updatedAt: '2026-10-01T00:00:00',
};

const roles = [
  {
    id: 'r-sales',
    projectId: 'p-crm',
    roleCode: 'sales-manager',
    roleName: '销售经理',
    status: 'ACTIVE',
    builtIn: false,
    menuIds: [],
    createdAt: '2026-10-01T00:00:00',
    updatedAt: '2026-10-01T00:00:00',
  },
  {
    id: 'r-admin',
    projectId: 'p-crm',
    roleCode: 'project-admin',
    roleName: '项目管理员',
    status: 'ACTIVE',
    builtIn: true,
    menuIds: [],
    createdAt: '2026-10-01T00:00:00',
    updatedAt: '2026-10-01T00:00:00',
  },
];

/** 销售经理：客户=本部门及下级、跟进记录=未配置、合同=指定部门（含下级）。 */
function salesScopes() {
  return {
    roleId: 'r-sales',
    roleCode: 'sales-manager',
    readOnly: false,
    items: [
      {
        resourceCode: 'crm:contract',
        resourceName: '合同',
        allowedScopes: ['CUSTOM_DEPT', 'SELF'],
        scope: 'CUSTOM_DEPT',
        configured: true,
        includeChild: true,
        deptIds: ['7001'],
      },
      {
        resourceCode: 'crm:customer',
        resourceName: '客户',
        allowedScopes: ['ALL', 'DEPT_AND_CHILD', 'SELF', 'CUSTOM_DEPT'],
        scope: 'DEPT_AND_CHILD',
        configured: true,
        includeChild: false,
        deptIds: [],
      },
      {
        resourceCode: 'crm:followup',
        resourceName: '跟进记录',
        allowedScopes: ['ALL', 'DEPT', 'SELF'],
        scope: 'SELF',
        configured: false,
        includeChild: false,
        deptIds: [],
      },
    ],
  };
}

const adminScopes = {
  roleId: 'r-admin',
  roleCode: 'project-admin',
  readOnly: true,
  items: salesScopes().items.map((item) => ({ ...item, scope: 'ALL', configured: false })),
};

const departments = [
  {
    id: '7001',
    name: '华东销售部',
    code: 'SALES-EAST',
    sortNo: 1,
    status: 'ENABLED',
    createdAt: '',
    updatedAt: '',
    children: [
      {
        id: '7003',
        parentId: '7001',
        name: '上海组',
        code: 'SALES-SH',
        sortNo: 1,
        status: 'ENABLED',
        createdAt: '',
        updatedAt: '',
        children: [],
      },
    ],
  },
  {
    id: '7002',
    name: '华北销售部',
    code: 'SALES-NORTH',
    sortNo: 2,
    status: 'ENABLED',
    createdAt: '',
    updatedAt: '',
    children: [],
  },
];

type Calls = { saved: Record<string, unknown>[] };

/** 已登录会话与角色、数据范围接口；文案取后端 schema 快照，与线上同源。 */
async function mockRoles(page: Page, calls: Calls, permissions: string[]) {
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
    id: '1',
    username: 'admin',
    displayName: '管理员',
    locale: 'zh-CN',
    agentAutoOpen: false,
    mustChangePassword: false,
    permissions,
  };
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url());
    const method = route.request().method();
    let data: unknown = [];
    if (url.pathname.endsWith('/i18n/catalog')) data = { locale: 'zh-CN', revision: 1, messages };
    if (url.pathname.endsWith('/i18n/locales'))
      data = [{ locale: 'zh-CN', label: '简体中文', selectable: true }];
    if (url.pathname === '/api/auth/refresh')
      data = { accessToken: 'fixture', expiresIn: 3600, user };
    if (url.pathname === '/api/auth/me') data = user;
    if (url.pathname === '/api/current/notifications/summary')
      data = { unreadCount: 0, recent: [] };
    if (url.pathname === '/api/projects')
      data = { current: 1, size: 100, total: 1, records: [project] };
    if (url.pathname === '/api/users') data = { current: 1, size: 100, total: 0, records: [] };
    if (url.pathname.startsWith('/api/metadata/dicts/effective/')) {
      data = { dictCode: url.pathname.split('/').pop(), dictName: '', items: [] };
    }
    if (url.pathname === '/api/projects/p-crm/roles') data = roles;
    if (url.pathname === '/api/projects/p-crm/menus') data = [];
    if (url.pathname === '/api/org/departments') data = departments;
    if (url.pathname === '/api/projects/p-crm/roles/r-sales/data-scopes') {
      if (method === 'PUT') {
        calls.saved.push(route.request().postDataJSON() as Record<string, unknown>);
      }
      data = salesScopes();
    }
    if (url.pathname === '/api/projects/p-crm/roles/r-admin/data-scopes') data = adminScopes;
    await route.fulfill({ json: { code: 0, data } });
  });
}

/** 角色授权弹窗；项目抽屉本身也是 dialog，必须按标题区分。 */
function grantDialog(page: Page) {
  return page.getByRole('dialog', { name: /角色授权：/ });
}

/** 按无障碍名称找到下拉/树选择的可点击外框；combobox 输入框本身会被已选项遮挡。 */
function selectOf(page: Page, name: string) {
  return grantDialog(page)
    .locator('.ant-select')
    .filter({ has: page.getByRole('combobox', { name }) });
}

/** 设置 E2E_SHOTS_DIR 时把当前画面存成验收截图，默认不产生文件。 */
async function shot(page: Page, name: string) {
  const dir = process.env.E2E_SHOTS_DIR;
  // 等弹窗/下拉的进出场动画结束，否则截到半透明帧。
  if (dir) await page.waitForTimeout(600);
  if (dir) await page.screenshot({ path: path.join(dir, `${name}.png`) });
}

const ALL_PERMISSIONS = ['system:project:list', 'system:project:role', 'system:project:menu'];

/** 进入项目的「角色授权」列表并打开某个角色的数据范围页签。 */
async function openDataScope(page: Page, roleName: string) {
  await page.goto('/projects');
  await page.getByRole('button', { name: '权限中心' }).click();
  await page.getByRole('tab', { name: '权限菜单' }).click();
  await page.getByRole('tab', { name: '角色授权' }).click();
  await page
    .getByRole('row', { name: new RegExp(roleName) })
    .getByRole('button', { name: '数据范围' })
    .click();
}

test('加载：已配置的范围按字典文案显示，未配置显示「仅本人（默认）」', async ({ page }) => {
  await mockRoles(page, { saved: [] }, ALL_PERMISSIONS);
  await openDataScope(page, '销售经理');

  const dialog = grantDialog(page);
  await expect(dialog.getByRole('tab', { name: '数据范围', selected: true })).toBeVisible();
  await expect(dialog.getByRole('row', { name: /客户/ })).toContainText('本部门及下级');
  await expect(dialog.getByRole('row', { name: /跟进记录/ })).toContainText('仅本人（默认）');
  const contract = dialog.getByRole('row', { name: /合同/ });
  await expect(contract).toContainText('指定部门');
  await expect(contract).toContainText('华东销售部');
  await expect(contract.getByRole('switch')).toBeChecked();
  await shot(page, '01-loaded');
});

test('下拉只列该资源允许的范围', async ({ page }) => {
  await mockRoles(page, { saved: [] }, ALL_PERMISSIONS);
  await openDataScope(page, '销售经理');

  await selectOf(page, '合同 可见范围').click();
  const options = page.locator('.ant-select-dropdown:visible .ant-select-item-option');
  await expect(options).toHaveCount(2);
  await expect(options.nth(0)).toHaveText('指定部门');
  await expect(options.nth(1)).toHaveText('仅本人');
});

test('修改后保存：只提交非「仅本人」的资源，覆盖语义', async ({ page }) => {
  const calls: Calls = { saved: [] };
  await mockRoles(page, calls, ALL_PERMISSIONS);
  await openDataScope(page, '销售经理');

  await selectOf(page, '跟进记录 可见范围').click();
  await page.locator('.ant-select-dropdown:visible').getByText('本部门', { exact: true }).click();
  await grantDialog(page)
    .getByRole('button', { name: /确\s*定/ })
    .click();

  await expect.poll(() => calls.saved).toHaveLength(1);
  expect(calls.saved[0]).toEqual({
    items: [
      { resourceCode: 'crm:contract', scope: 'CUSTOM_DEPT', includeChild: true, deptIds: ['7001'] },
      { resourceCode: 'crm:customer', scope: 'DEPT_AND_CHILD', includeChild: false, deptIds: [] },
      { resourceCode: 'crm:followup', scope: 'DEPT', includeChild: false, deptIds: [] },
    ],
  });
});

test('指定部门：没选部门不能保存，选了部门并打开「含下级」后提交', async ({ page }) => {
  const calls: Calls = { saved: [] };
  await mockRoles(page, calls, ALL_PERMISSIONS);
  await openDataScope(page, '销售经理');

  await selectOf(page, '客户 可见范围').click();
  await page.locator('.ant-select-dropdown:visible').getByText('指定部门', { exact: true }).click();
  await grantDialog(page)
    .getByRole('button', { name: /确\s*定/ })
    .click();
  await expect(page.getByText('请选择至少一个部门')).toBeVisible();
  await shot(page, '02-custom-dept-required');
  expect(calls.saved).toHaveLength(0);

  await selectOf(page, '客户 部门').click();
  await page.locator('.ant-select-tree-node-content-wrapper', { hasText: '华北销售部' }).click();
  await page.getByRole('switch', { name: '客户 含下级' }).click();
  // Escape 会连弹窗一起关掉，点标题收起树下拉。
  await grantDialog(page).locator('.ant-modal-title').click();
  await grantDialog(page)
    .getByRole('button', { name: /确\s*定/ })
    .click();

  await expect.poll(() => calls.saved).toHaveLength(1);
  expect(calls.saved[0]).toMatchObject({
    items: expect.arrayContaining([
      { resourceCode: 'crm:customer', scope: 'CUSTOM_DEPT', includeChild: true, deptIds: ['7002'] },
    ]),
  });
});

test('选「全部」要二次确认，取消则保持原值', async ({ page }) => {
  await mockRoles(page, { saved: [] }, ALL_PERMISSIONS);
  await openDataScope(page, '销售经理');
  const customer = grantDialog(page).getByRole('row', { name: /客户/ });

  await selectOf(page, '客户 可见范围').click();
  await page.locator('.ant-select-dropdown:visible').getByText('全部', { exact: true }).click();
  await expect(page.getByText('该角色将看到本项目全部客户')).toBeVisible();
  await page
    .locator('.ant-modal-confirm')
    .getByRole('button', { name: /取\s*消/ })
    .click();
  await expect(customer).toContainText('本部门及下级');

  await selectOf(page, '客户 可见范围').click();
  await page.locator('.ant-select-dropdown:visible').getByText('全部', { exact: true }).click();
  await page
    .locator('.ant-modal-confirm')
    .getByRole('button', { name: /确\s*定/ })
    .click();
  await expect(customer).toContainText('全部');
  await shot(page, '03-all-confirmed');
});

test('内置角色：只读，统一显示「全部（内置角色）」，不发起保存', async ({ page }) => {
  const calls: Calls = { saved: [] };
  await mockRoles(page, calls, ALL_PERMISSIONS);
  await openDataScope(page, '项目管理员');

  const dialog = grantDialog(page);
  await expect(dialog.getByText('全部（内置角色）')).toHaveCount(3);
  await expect(dialog.getByRole('combobox')).toHaveCount(0);
  await shot(page, '04-built-in-readonly');
  await dialog.getByRole('button', { name: /确\s*定/ }).click();
  await expect(dialog).toBeHidden();
  expect(calls.saved).toHaveLength(0);
});

test('没有角色授权权限时看不到「数据范围」入口', async ({ page }) => {
  await mockRoles(page, { saved: [] }, ['system:project:list', 'system:project:menu']);
  await page.goto('/projects');
  await page.getByRole('button', { name: '权限中心' }).click();
  await page.getByRole('tab', { name: '权限菜单' }).click();
  await expect(page.getByRole('tab', { name: '角色授权' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '数据范围' })).toHaveCount(0);
});
