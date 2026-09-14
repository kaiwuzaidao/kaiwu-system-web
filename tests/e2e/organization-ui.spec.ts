import { expect, test } from '@playwright/test';
import { createAdminApiContext, loginAsAdmin } from './support/auth';
import { requireMutationPermission, runSuffix } from './support/env';

test.describe('组织架构表单错误处理', () => {
  test.beforeAll(requireMutationPermission);

  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/organization');
  });

  test('部门编码校验与后端契约一致', async ({ page }) => {
    await page.getByRole('button', { name: '新建部门' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('部门名称').fill('前端校验复现');
    await dialog.getByLabel('部门编码').fill('R_D');
    await dialog.getByRole('button', { name: '确 定' }).click();

    await expect(
      dialog.getByText('小写字母开头，仅小写字母、数字和连字符', { exact: true }),
    ).toBeVisible();
    await expect(page.getByText('Unhandled Rejection', { exact: false })).toHaveCount(0);
  });

  test('后端业务错误在页面内提示而不是触发开发错误覆盖层', async ({ page, request }) => {
    const api = await createAdminApiContext(request);
    const suffix = runSuffix();
    const code = `duplicate-${suffix}`.slice(0, 64);
    const created = await api.post('/api/org/departments', {
      data: { name: `重复编码种子 ${suffix}`, code, sortNo: 0, status: 'ENABLED' },
    });
    expect(created.ok(), await created.text()).toBeTruthy();
    const body = (await created.json()) as { data: { id: string } };

    try {
      await page.getByRole('button', { name: '新建部门' }).click();
      const dialog = page.getByRole('dialog');
      await dialog.getByLabel('部门名称').fill('重复编码验证');
      await dialog.getByLabel('部门编码').fill(code);
      await dialog.getByRole('button', { name: '确 定' }).click();

      await expect(page.getByText('部门编码已存在', { exact: true })).toBeVisible();
      await expect(page.getByText('Unhandled Rejection', { exact: false })).toHaveCount(0);
    } finally {
      await api.delete(`/api/org/departments/${body.data.id}`);
    }
  });
});

test.describe.serial('组织架构归属可视化与分配交互', () => {
  test.beforeAll(requireMutationPermission);

  let adminId = '';
  let primaryDepartmentId = '';
  let secondaryDepartmentId = '';
  let originalDepartmentIds: string[] = [];
  const suffix = runSuffix();
  const primaryName = `研发中心 ${suffix}`;
  const secondaryName = `产品中心 ${suffix}`;

  test.beforeAll(async ({ request }) => {
    const api = await createAdminApiContext(request);
    const users = await api.get('/api/users?current=1&size=100');
    expect(users.ok(), await users.text()).toBeTruthy();
    const usersBody = (await users.json()) as {
      data: { records: Array<{ id: string; username: string }> };
    };
    const admin = usersBody.data.records.find((item) => item.username.toLowerCase() === 'admin');
    expect(admin).toBeTruthy();
    adminId = admin!.id;

    const original = await api.get(`/api/org/users/${adminId}/departments`);
    expect(original.ok(), await original.text()).toBeTruthy();
    originalDepartmentIds = ((await original.json()) as { data: string[] }).data;

    const primary = await api.post('/api/org/departments', {
      data: {
        name: primaryName,
        code: `rd-${suffix}`.slice(0, 64),
        sortNo: 0,
        status: 'ENABLED',
      },
    });
    expect(primary.ok(), await primary.text()).toBeTruthy();
    primaryDepartmentId = ((await primary.json()) as { data: { id: string } }).data.id;

    const secondary = await api.post('/api/org/departments', {
      data: {
        name: secondaryName,
        code: `product-${suffix}`.slice(0, 64),
        sortNo: 1,
        status: 'ENABLED',
      },
    });
    expect(secondary.ok(), await secondary.text()).toBeTruthy();
    secondaryDepartmentId = ((await secondary.json()) as { data: { id: string } }).data.id;

    const assigned = await api.post(`/api/org/users/${adminId}/departments`, {
      data: { departmentIds: [primaryDepartmentId, secondaryDepartmentId] },
    });
    expect(assigned.ok(), await assigned.text()).toBeTruthy();
  });

  test.afterAll(async ({ request }) => {
    const api = await createAdminApiContext(request);
    if (adminId) {
      await api.post(`/api/org/users/${adminId}/departments`, {
        data: { departmentIds: originalDepartmentIds },
      });
    }
    if (secondaryDepartmentId) await api.delete(`/api/org/departments/${secondaryDepartmentId}`);
    if (primaryDepartmentId) await api.delete(`/api/org/departments/${primaryDepartmentId}`);
  });

  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/organization');
  });

  test('用户列表显示主部门和兼任部门并支持按部门筛选', async ({ page }) => {
    await page.getByPlaceholder('搜索姓名或账号').fill('admin');
    const adminRow = page.getByRole('row').filter({ hasText: '@admin' });
    await expect(adminRow.getByText(`主部门 · ${primaryName}`, { exact: true })).toBeVisible();
    await expect(adminRow.getByText(secondaryName, { exact: true })).toBeVisible();

    await page.getByRole('tree').getByText(secondaryName, { exact: true }).click();
    await expect(page.getByText(`用户归属 · ${secondaryName}`, { exact: true })).toBeVisible();
    await expect(adminRow).toBeVisible();
    await page.getByRole('button', { name: '查看全部用户' }).click();
    await expect(page.getByText('用户归属 · 全部用户', { exact: true })).toBeVisible();
  });

  test('分配弹窗明确区分主部门和兼任部门并在保存后立即刷新', async ({ page }) => {
    await page.getByPlaceholder('搜索姓名或账号').fill('admin');
    const adminRow = page.getByRole('row').filter({ hasText: '@admin' });
    await adminRow.getByRole('button', { name: '调整归属' }).click();
    const dialog = page.getByRole('dialog');

    await expect(dialog.getByText(primaryName, { exact: false })).toBeVisible();
    await expect(dialog.getByText(secondaryName, { exact: false })).toBeVisible();
    await dialog.getByText(primaryName, { exact: false }).click();
    await page
      .locator('.ant-select-dropdown:visible')
      .getByText(secondaryName, { exact: false })
      .click();
    await dialog.getByRole('button', { name: '确 定' }).click();

    await expect(adminRow.getByText(`主部门 · ${secondaryName}`, { exact: true })).toBeVisible();
  });
});
