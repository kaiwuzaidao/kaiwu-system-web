import { expect, test, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const project = {
  id: 'p-order',
  projectCode: 'order-center',
  projectName: '订单中心',
  status: 'ACTIVE',
  builtIn: false,
  createdBy: '1',
  packageName: 'com.example.order',
  defaultBranch: 'main',
  createdAt: '2026-10-01T00:00:00',
  updatedAt: '2026-10-01T00:00:00',
};

const permissions = [
  'system:project:list',
  'system:project:member',
  'system:project:role',
  'system:project:menu',
  'system:project-factory:generate',
];

type Calls = { applied: Record<string, unknown>[] };

/** 移交包：一个字典、一个配置，来源信息齐全。 */
const handoverPackage = {
  formatVersion: 1,
  projectCode: 'order-center',
  source: { host: 'kaiwu-test.example.com', exportedBy: '7', exportedAt: '2026-10-30T01:00:00Z' },
  digest: 'digest-1',
  stats: { dicts: 1, configs: 1, menus: 0, roles: 1, jobs: 2, i18n: 5 },
  warnings: ['配置 order.token 是敏感项，未导出'],
  files: {
    'dicts.yml':
      '- dictCode: order.status\n  name: 订单状态\n  items:\n    - { value: PAID, label: 已支付 }\n',
    'configs.yml': '- { key: order.max, type: NUMBER, default: 50 }\n',
  },
};

/** 预览：新增、授权、源环境已删除、仅目标有四类各一条。 */
const plan = {
  planHash: 'plan-1',
  hasBaseline: true,
  missingPermissions: [],
  alreadyApplied: null,
  changes: [
    {
      resource: 'DICT',
      key: 'order.status',
      action: 'CREATE',
      detail: '新增字典类型「订单状态」',
      category: 'NORMAL',
    },
    {
      resource: 'JOB',
      key: '日结',
      action: 'CREATE',
      detail: '新增定时任务（默认停用）',
      category: 'NORMAL',
    },
    {
      resource: 'ROLE',
      key: 'finance',
      action: 'CREATE',
      detail: '新增角色「财务」',
      category: 'ACCESS',
    },
    {
      resource: 'CONFIG',
      key: 'order.old',
      action: 'REMOVED_AT_SOURCE',
      detail: '上次移交时存在',
      category: 'DELETE',
    },
    {
      resource: 'CONFIG',
      key: 'order.mine',
      action: 'DRIFT',
      detail: '平台上存在、清单未声明',
      category: 'NORMAL',
    },
  ],
};

/** 已登录会话与移交接口；文案取后端 schema 快照，与线上同源。 */
async function mockHandover(page: Page, calls: Calls, handoverPlan: typeof plan = plan) {
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
    // 成员页签是抽屉默认页签，它读取用户分页；缺少 records 会触发开发态错误遮罩。
    if (url.pathname === '/api/users') data = { current: 1, size: 100, total: 0, records: [] };
    if (url.pathname.startsWith('/api/metadata/dicts/effective/')) {
      data = { dictCode: url.pathname.split('/').pop(), dictName: '', items: [] };
    }
    if (url.pathname === '/api/projects/p-order/manifest/export') data = handoverPackage;
    if (url.pathname === '/api/projects/p-order/manifest/plan' && method === 'POST')
      data = handoverPlan;
    if (url.pathname === '/api/projects/p-order/manifest/apply' && method === 'POST') {
      calls.applied.push(route.request().postDataJSON() as Record<string, unknown>);
      data = { ...handoverPlan, changes: [] };
    }
    if (url.pathname === '/api/projects/p-order/manifest/handovers') {
      data = [
        {
          id: 'h1',
          status: 'SUCCESS',
          operatorId: '7',
          sourceHost: 'kaiwu-test.example.com',
          appliedAccess: false,
          changeCount: 3,
          deleteCount: 0,
          createdAt: '2026-10-29T10:00:00',
          changes: [],
        },
      ];
    }
    await route.fulfill({ json: { code: 0, data } });
  });
}

async function openHandoverTab(page: Page) {
  await page.goto('/projects');
  await page.getByRole('button', { name: '权限中心' }).click();
  await page.getByRole('tab', { name: '配置移交' }).click();
}

test('导出移交包：下载文件并显示统计与警告', async ({ page }) => {
  await mockHandover(page, { applied: [] });
  await openHandoverTab(page);

  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: /导出并下载/ }).click();

  expect((await download).suggestedFilename()).toMatch(/^handover-order-center-\d{8}\.json$/);
  await expect(
    page.getByText('字典 1 · 配置 1 · 菜单 0 · 角色 1 · 定时任务 2 · 国际化 5'),
  ).toBeVisible();
  await expect(page.getByText('配置 order.token 是敏感项，未导出')).toBeVisible();
  await expect(page.getByText('kaiwu-test.example.com').first()).toBeVisible();
});

test('导入移交包：授权与删除默认不执行，勾选后才随请求提交', async ({ page }) => {
  const calls: Calls = { applied: [] };
  await mockHandover(page, calls);
  await openHandoverTab(page);

  await page.locator('input[type=file]').setInputFiles({
    name: 'package.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(handoverPackage)),
  });

  await expect(page.getByText(/新增与更新（2）/)).toBeVisible();
  await expect(page.getByRole('row', { name: /日结/ })).toContainText('定时任务');
  await expect(page.getByText(/授权（1）/)).toBeVisible();
  await expect(page.getByText(/源环境已删除（1）/)).toBeVisible();
  await expect(page.getByText(/仅目标环境有（1）/)).toBeVisible();

  // 先只执行普通变更：授权与删除都没有勾选。
  await page.getByRole('button', { name: /执行导入/ }).click();
  await page.getByRole('button', { name: /确\s*定/ }).click();
  await expect.poll(() => calls.applied).toHaveLength(1);
  expect(calls.applied[0]).toMatchObject({
    planHash: 'plan-1',
    applyAccess: false,
    deleteKeys: [],
    packageDigest: 'digest-1',
    sourceHost: 'kaiwu-test.example.com',
  });
});

test('导入移交包：勾选导入授权与一项删除后提交对应标识', async ({ page }) => {
  const calls: Calls = { applied: [] };
  await mockHandover(page, calls);
  await openHandoverTab(page);
  await page.locator('input[type=file]').setInputFiles({
    name: 'package.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(handoverPackage)),
  });
  await expect(page.getByText(/源环境已删除（1）/)).toBeVisible();

  await page.getByRole('checkbox', { name: '同时导入授权' }).check();
  const removedRow = page.getByRole('row', { name: /order\.old/ });
  await removedRow.getByRole('checkbox').check();
  await page.getByRole('button', { name: /执行导入/ }).click();
  await page.getByRole('button', { name: /确\s*定/ }).click();

  await expect.poll(() => calls.applied).toHaveLength(1);
  expect(calls.applied[0]).toMatchObject({
    applyAccess: true,
    deleteKeys: ['CONFIG|order.old'],
  });
});

test('导入移交包：项目编码不一致时拒绝并不发起预览', async ({ page }) => {
  await mockHandover(page, { applied: [] });
  await openHandoverTab(page);
  let planned = false;
  page.on('request', (request) => {
    if (request.url().endsWith('/manifest/plan')) planned = true;
  });

  await page.locator('input[type=file]').setInputFiles({
    name: 'other.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({ ...handoverPackage, projectCode: 'other-project' })),
  });

  await expect(page.getByText(/移交包属于项目 other-project/)).toBeVisible();
  expect(planned).toBe(false);
});

/** 数据范围（ADR 0044）：受控资源随普通变更，角色数据范围属于授权，默认不执行。 */
const dataScopePlan = {
  ...plan,
  changes: [
    {
      resource: 'DATA_SCOPE',
      key: 'crm:customer',
      action: 'CREATE',
      detail: '新增受控资源「客户」',
      category: 'NORMAL' as const,
    },
    {
      resource: 'DATA_SCOPE',
      key: 'crm:followup',
      action: 'REENABLE',
      detail: '重新启用受控资源「跟进记录」',
      category: 'NORMAL' as const,
    },
    {
      resource: 'ROLE_DATA_SCOPE',
      key: 'sales-manager:crm:customer',
      action: 'UPDATE',
      detail: '销售经理在「客户」上的范围：仅本人 → 本部门及下级',
      category: 'ACCESS' as const,
    },
  ],
};

test('导入移交包：数据范围按字典文案展示，角色数据范围默认不随计划执行', async ({ page }) => {
  const calls: Calls = { applied: [] };
  await mockHandover(page, calls, dataScopePlan);
  await openHandoverTab(page);
  await page.locator('input[type=file]').setInputFiles({
    name: 'package.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(handoverPackage)),
  });

  await expect(page.getByText(/新增与更新（2）/)).toBeVisible();
  await expect(page.getByRole('row', { name: /crm:followup/ })).toContainText('受控资源');
  await expect(page.getByRole('row', { name: /crm:followup/ })).toContainText('重新启用');
  await expect(page.getByText(/授权（1）/)).toBeVisible();
  await expect(page.getByRole('row', { name: /sales-manager:crm:customer/ })).toContainText(
    '角色数据范围',
  );

  await page.getByRole('button', { name: /执行导入/ }).click();
  await page.getByRole('button', { name: /确\s*定/ }).click();
  await expect.poll(() => calls.applied).toHaveLength(1);
  expect(calls.applied[0]).toMatchObject({ planHash: 'plan-1', applyAccess: false });
});
