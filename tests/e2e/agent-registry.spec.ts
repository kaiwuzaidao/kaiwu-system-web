import { expect, test, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const projectId = '1789248125900000001';
const hash = 'a'.repeat(64);
const manifest = {
  projectCode: 'crm',
  code: 'crm.record.list',
  version: '1',
  description: '查询记录',
  permission: 'record:record:list',
  dataScope: 'SELF',
  readOnly: true,
  idempotent: true,
  confirmation: 'NONE',
  params: {},
  outboundFields: ['id', 'title'],
  redact: {},
  timeoutMs: 5000,
};
const initial = {
  id: '1789248125900000002',
  projectId,
  capabilityCode: manifest.code,
  description: manifest.description,
  version: '1',
  manifestHash: hash,
  status: 'PENDING',
  online: true,
  lastSeenAt: '2026-09-23T10:00:00',
};
const prefix = `/api/projects/${projectId}/agent`;

async function setup(
  page: Page,
  options: {
    readOnly?: boolean;
    writeManifest?: boolean;
    conflict?: boolean;
    forbidden?: boolean;
    offline?: boolean;
    batch?: boolean;
  } = {},
) {
  const user = {
    id: '1',
    username: 'admin',
    displayName: '管理员',
    locale: 'zh-CN',
    mustChangePassword: false,
    permissions: ['system:project:list', ...(options.readOnly ? [] : ['system:project:update'])],
  };
  await page.addInitScript((value) => {
    (window as Window & { __KAIWU_SESSION_BOOTSTRAP__?: unknown }).__KAIWU_SESSION_BOOTSTRAP__ = {
      accessToken: 'e2e-access',
      expiresIn: 3600,
      user: value,
    };
  }, user);
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
    registration: { ...initial, online: !options.offline },
    reviews: [] as unknown[],
    batchReviews: [] as unknown[],
    rotations: 0,
  };
  const second = {
    ...initial,
    id: '1789248125900000003',
    capabilityCode: 'crm.contact.list',
  };
  const write = {
    ...initial,
    id: '1789248125900000004',
    capabilityCode: 'crm.record.write',
    readOnly: false,
  };
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    let status = 200;
    let data: unknown = [];
    if (url.pathname.endsWith('/i18n/catalog')) data = { locale: 'zh-CN', revision: 48, messages };
    if (url.pathname.endsWith('/i18n/locales'))
      data = [{ locale: 'zh-CN', label: '简体中文', selectable: true }];
    if (url.pathname === '/api/auth/me') data = user;
    if (url.pathname === '/api/auth/refresh')
      data = { accessToken: 'e2e-access', expiresIn: 3600, user };
    if (url.pathname === '/api/auth/menus')
      data = [{ id: 'projects', name: '项目管理', type: 'MENU', path: '/projects', children: [] }];
    if (url.pathname === '/api/projects')
      data = {
        current: 1,
        size: 20,
        total: 1,
        records: [
          {
            id: projectId,
            projectCode: 'crm',
            projectName: '测试客户项目',
            status: 'ACTIVE',
            builtIn: false,
            createdBy: '1',
          },
        ],
      };
    if (url.pathname === `${prefix}/capabilities`) {
      data = options.batch
        ? [{ ...state.registration, readOnly: true }, { ...second, readOnly: true }, write]
        : [{ ...state.registration, readOnly: !options.writeManifest }];
      if (options.forbidden) status = 403;
    }
    if (url.pathname.startsWith(`${prefix}/capabilities/`) && request.method() === 'GET') {
      const code = decodeURIComponent(url.pathname.split('/').at(-1) ?? '');
      const registration =
        code === second.capabilityCode
          ? second
          : code === write.capabilityCode
            ? write
            : state.registration;
      data = {
        registration: {
          ...registration,
          readOnly: code !== write.capabilityCode && !options.writeManifest,
        },
        manifestJson: JSON.stringify({
          ...manifest,
          code,
          readOnly: code !== write.capabilityCode && !options.writeManifest,
          confirmation: options.writeManifest ? 'STRONG' : 'NONE',
        }),
      };
    }
    if (url.pathname === `${prefix}/capabilities/review`) {
      state.reviews.push(request.postDataJSON());
      if (options.conflict) {
        state.registration.version = '2';
        status = 409;
      } else state.registration.status = request.postDataJSON().status;
      data = state.registration;
    }
    if (url.pathname === `${prefix}/capabilities/review-batch`) {
      state.batchReviews.push(request.postDataJSON());
      if (options.conflict) status = 409;
      else state.registration.status = 'APPROVED';
      data = [];
    }
    if (url.pathname === `${prefix}/credential` && request.method() === 'POST') {
      state.rotations += 1;
      data = { projectId, credentialId: 'test-credential', token: 'one-time-test-credential' };
    }
    await route.fulfill({
      status,
      contentType: 'application/json',
      body: JSON.stringify({
        code: status === 200 ? 0 : status,
        data,
        message:
          status === 409
            ? '版本已变化，请重新获取后操作'
            : status === 403
              ? '无权管理该项目的 Agent 能力'
              : 'ok',
      }),
    });
  });
  await page.goto('/projects');
  await page.getByRole('button', { name: 'Agent 能力', exact: true }).click();
  await expect(page.getByText('Agent 能力：测试客户项目', { exact: true })).toBeVisible();
  return state;
}

test('中文清单与逐版确认，提交实际展示的版本摘要', async ({ page }) => {
  const state = await setup(page);
  await expect(page.getByText('待审核', { exact: true })).toBeVisible();
  await expect(page.getByRole('row').filter({ hasText: manifest.code })).toContainText('查询记录');
  await page.getByRole('button', { name: '查看清单 / 审核' }).click();
  await expect(page.getByText(hash, { exact: true })).toBeVisible();
  await expect(
    page.getByRole('dialog').last().getByText('查询记录', { exact: true }),
  ).toBeVisible();
  await expect(page.locator('pre')).toContainText('record:record:list');
  await page.getByRole('button', { name: '批准只读能力', exact: true }).click();
  expect(state.reviews).toHaveLength(0);
  await page.getByRole('button', { name: /^确\s*定$/ }).click();
  await expect(page.getByText('已批准', { exact: true })).toBeVisible();
  expect(state.reviews).toEqual([
    {
      revision: { capabilityCode: manifest.code, version: '1', manifestHash: hash },
      status: 'APPROVED',
    },
  ]);
});

test('批量只选在线待审只读能力，逐项核对后一次提交版本摘要', async ({ page }) => {
  const state = await setup(page, { batch: true });
  await page.getByRole('row').filter({ hasText: manifest.code }).getByRole('checkbox').check();
  await page.getByRole('row').filter({ hasText: 'crm.contact.list' }).getByRole('checkbox').check();
  await expect(
    page.getByRole('row').filter({ hasText: 'crm.record.write' }).getByRole('checkbox'),
  ).toBeDisabled();
  await page.getByRole('button', { name: '批量批准只读能力（2）' }).first().click();
  const dialog = page.getByRole('dialog', { name: '批量审核 2 项能力' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText('查询记录', { exact: true })).toHaveCount(2);
  await expect(dialog.getByRole('button', { name: '批量批准只读能力（2）' })).toBeDisabled();
  await dialog.getByRole('checkbox').check();
  await dialog.getByRole('button', { name: '批量批准只读能力（2）' }).click();
  await expect(dialog).toHaveCount(0);
  expect(state.batchReviews).toEqual([
    {
      revisions: [
        { capabilityCode: manifest.code, version: '1', manifestHash: hash },
        { capabilityCode: 'crm.contact.list', version: '1', manifestHash: hash },
      ],
    },
  ]);
});

test('批量版本冲突不重放请求并刷新状态', async ({ page }) => {
  const state = await setup(page, { batch: true, conflict: true });
  await page.getByRole('row').filter({ hasText: manifest.code }).getByRole('checkbox').check();
  await page.getByRole('button', { name: '批量批准只读能力（1）' }).click();
  const dialog = page.getByRole('dialog', { name: '批量审核 1 项能力' });
  await dialog.getByRole('checkbox').check();
  await dialog.getByRole('button', { name: '批量批准只读能力（1）' }).click();
  await expect(page.getByText('版本已变化，请重新获取后操作')).toBeVisible();
  await expect(dialog).toHaveCount(0);
  expect(state.batchReviews).toHaveLength(1);
});

test('写能力显示单独的风险提示，审批仍绑定展示版本和摘要', async ({ page }) => {
  const state = await setup(page, { writeManifest: true });
  await page.getByRole('button', { name: '查看清单 / 审核' }).click();
  await expect(page.getByText('批准写能力前，须核对业务 Handler')).toBeVisible();
  await page.getByRole('button', { name: '批准写能力' }).click();
  expect(state.reviews).toHaveLength(0);
  await page.getByRole('button', { name: /^确\s*定$/ }).click();
  expect(state.reviews).toEqual([
    {
      revision: { capabilityCode: manifest.code, version: '1', manifestHash: hash },
      status: 'APPROVED',
    },
  ]);
});

test('凭据仅内存一次展示，关闭后不再留在界面或浏览器存储', async ({ page }) => {
  const state = await setup(page);
  await page.getByRole('button', { name: '签发 / 轮换凭据' }).click();
  expect(state.rotations).toBe(0);
  await page.getByRole('button', { name: /^确\s*定$/ }).click();
  const input = page.getByLabel('Agent 注册凭据', { exact: true });
  await expect(input).toHaveValue('one-time-test-credential');
  await expect(input).toHaveAttribute('type', 'password');
  await page
    .getByRole('dialog', { name: '保存注册凭据', exact: true })
    .getByRole('button', { name: /^关\s*闭$/ })
    .click();
  await expect(input).toHaveCount(0);
  expect(state.rotations).toBe(1);
  const storage = await page.evaluate(() =>
    JSON.stringify([Object.entries(localStorage), Object.entries(sessionStorage)]),
  );
  expect(storage).not.toContain('one-time-test-credential');
});

test('版本冲突不会自动重放审批，重新加载最新版本', async ({ page }) => {
  const state = await setup(page, { conflict: true });
  await page.getByRole('button', { name: '查看清单 / 审核' }).click();
  await page.getByRole('button', { name: '批准只读能力', exact: true }).click();
  await page.getByRole('button', { name: /^确\s*定$/ }).click();
  await expect(page.getByText('版本已变化，请重新获取后操作')).toBeVisible();
  await expect(page.getByRole('dialog', { name: '完整能力清单' })).toHaveCount(0);
  expect(state.reviews).toHaveLength(1);
  await expect(page.getByRole('row').filter({ hasText: manifest.code })).toContainText('2');
});

test('只有查看权限时隐藏写按钮，服务端403有明确提示', async ({ page }) => {
  await setup(page, { readOnly: true, forbidden: true });
  await expect(page.getByRole('button', { name: '签发 / 轮换凭据' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /批量批准只读能力/ })).toHaveCount(0);
  await expect(page.getByText('无权管理该项目的 Agent 能力', { exact: true })).toBeVisible();
});

test('离线能力不能在页面批准', async ({ page }) => {
  await setup(page, { offline: true });
  await page.getByRole('button', { name: '查看清单 / 审核' }).click();
  await expect(page.getByRole('button', { name: '批准只读能力', exact: true })).toBeDisabled();
});
