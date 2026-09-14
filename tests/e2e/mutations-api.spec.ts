import { expect, test, type APIResponse } from '@playwright/test';
import { createAdminApiContext } from './support/auth';
import { e2e, requireMutationPermission, runSuffix } from './support/env';

type ApiEnvelope<T> = { code: number; data: T; message?: string };

async function json<T>(response: APIResponse) {
  expect(response.ok(), await response.text()).toBeTruthy();
  const body = (await response.json()) as ApiEnvelope<T>;
  expect(body.code).toBe(0);
  return body.data;
}

test.describe('隔离环境：用户、项目、权限和元数据变更验收', () => {
  test.beforeAll(requireMutationPermission);

  test('用户可创建、更新、重置密码和停用，停用后不能继续登录', async ({ request }) => {
    const suffix = runSuffix();
    const username = `e2e_user_${suffix}`;
    const initialPassword = `E2e!${suffix}a`;
    const resetPassword = `E2e!${suffix}b`;
    const api = await createAdminApiContext(request);
    try {
      const user = await json<{ id: string }>(
        await api.post('/api/users', {
          data: { username, displayName: `E2E 用户 ${suffix}`, password: initialPassword },
        }),
      );
      const userLogin = await request.post(`${e2e.baseURL}/api/auth/login`, {
        data: { username, password: initialPassword },
      });
      const userSession = (await userLogin.json()) as ApiEnvelope<{ accessToken: string }>;
      expect(userLogin.ok()).toBeTruthy();
      const permissionDenied = await request.get(`${e2e.baseURL}/api/users?current=1&size=10`, {
        headers: { Authorization: `Bearer ${userSession.data.accessToken}` },
      });
      expect(permissionDenied.status()).toBe(403);
      await json(
        await api.put(`/api/users/${user.id}`, {
          data: { displayName: `E2E 已更新 ${suffix}` },
        }),
      );
      await json(
        await api.post(`/api/users/${user.id}/reset-password`, {
          data: { newPassword: resetPassword },
        }),
      );
      await json(await api.put(`/api/users/${user.id}/status`, { data: { status: 'DISABLED' } }));

      const revoked = await request.get(`${e2e.baseURL}/api/auth/me`, {
        headers: { Authorization: `Bearer ${userSession.data.accessToken}` },
      });
      expect(revoked.status()).toBe(401);

      const denied = await request.post(`${e2e.baseURL}/api/auth/login`, {
        data: { username, password: resetPassword },
      });
      expect(denied.ok()).toBeFalsy();
    } finally {
    }
  });

  test('项目、成员、角色和菜单的授权边界可验证', async ({ request }) => {
    const suffix = runSuffix();
    const username = `e2e_member_${suffix}`;
    const password = `E2e!${suffix}m`;
    const api = await createAdminApiContext(request);
    let userId: string | undefined;
    let projectId: string | undefined;
    try {
      const user = await json<{ id: string }>(
        await api.post('/api/users', {
          data: { username, displayName: `E2E 成员 ${suffix}`, password },
        }),
      );
      userId = user.id;
      const project = await json<{ id: string }>(
        await api.post('/api/projects', {
          data: {
            projectCode: `e2ep${suffix}`.slice(0, 32),
            projectName: `E2E 项目 ${suffix}`,
            packageName: `com.kaiwu.e2e${suffix}`,
          },
        }),
      );
      projectId = project.id;
      const nonMemberLogin = await request.post(`${e2e.baseURL}/api/auth/login`, {
        data: { username, password },
      });
      const nonMember = (await nonMemberLogin.json()) as ApiEnvelope<{ accessToken: string }>;
      expect(nonMemberLogin.ok()).toBeTruthy();
      const nonMemberAccess = await request.get(
        `${e2e.baseURL}/api/current/projects/${project.id}/access`,
        {
          headers: { Authorization: `Bearer ${nonMember.data.accessToken}` },
        },
      );
      expect(nonMemberAccess.status()).toBe(403);
      const role = await json<{ id: string }>(
        await api.post(`/api/projects/${project.id}/roles`, {
          data: { roleCode: `e2e-role-${suffix}`, roleName: `E2E 角色 ${suffix}` },
        }),
      );
      const rootMenu = await json<{ id: string }>(
        await api.post(`/api/projects/${project.id}/menus`, {
          data: {
            menuName: `E2E 菜单 ${suffix}`,
            menuType: 'MENU',
            routePath: `/e2e-${suffix}`,
            permissionCode: 'e2e:dashboard:view',
            sortNo: 1,
            visible: true,
          },
        }),
      );
      const menu = await json<{ id: string }>(
        await api.post(`/api/projects/${project.id}/menus`, {
          data: {
            parentId: rootMenu.id,
            menuName: `E2E 查询 ${suffix}`,
            menuType: 'BUTTON',
            permissionCode: 'e2e:order:list',
            sortNo: 1,
            visible: true,
          },
        }),
      );
      await json(
        await api.put(`/api/projects/${project.id}/roles/${role.id}/menus`, {
          data: { menuIds: [menu.id] },
        }),
      );
      await json(
        await api.put(`/api/projects/${project.id}/members/${user.id}`, {
          data: { roleIds: [role.id], status: 'ACTIVE' },
        }),
      );

      const memberLogin = await request.post(`${e2e.baseURL}/api/auth/login`, {
        data: { username, password },
      });
      const member = (await memberLogin.json()) as ApiEnvelope<{ accessToken: string }>;
      expect(memberLogin.ok()).toBeTruthy();
      const access = await request.get(`${e2e.baseURL}/api/current/projects/${project.id}/access`, {
        headers: { Authorization: `Bearer ${member.data.accessToken}` },
      });
      const payload = await json<{ permissions: string[] }>(access);
      expect(payload.permissions).toEqual(
        expect.arrayContaining(['e2e:dashboard:view', 'e2e:order:list']),
      );

      await json(
        await api.put(`/api/projects/${project.id}/members/${user.id}`, {
          data: { roleIds: [role.id], status: 'DISABLED' },
        }),
      );
      const disabledAccess = await request.get(
        `${e2e.baseURL}/api/current/projects/${project.id}/access`,
        {
          headers: { Authorization: `Bearer ${member.data.accessToken}` },
        },
      );
      expect(disabledAccess.status()).toBe(403);
    } finally {
      if (userId) {
        await api.put(`/api/users/${userId}/status`, { data: { status: 'DISABLED' } });
      }
      if (projectId) {
        await api.put(`/api/projects/${projectId}/status`, { data: { status: 'ARCHIVED' } });
      }
    }
  });

  test('全局配置和字典可创建并删除，敏感值不会被读取', async ({ request }) => {
    const suffix = runSuffix();
    const api = await createAdminApiContext(request);
    try {
      const config = await json<{ id: string; configValue: string }>(
        await api.post('/api/metadata/configs?scopeId=0', {
          data: {
            configKey: `e2e.${suffix}`,
            configValue: 'visible-value',
            valueType: 'STRING',
            secret: false,
            status: 'ENABLED',
            sortNo: 1,
          },
        }),
      );
      expect(config.configValue).toBe('visible-value');
      const secretConfig = await json<{ id: string; configValue: string }>(
        await api.post('/api/metadata/configs?scopeId=0', {
          data: {
            configKey: `e2e.secret.${suffix}`,
            configValue: 'never-return-this',
            valueType: 'STRING',
            secret: true,
            status: 'ENABLED',
            sortNo: 2,
          },
        }),
      );
      expect(secretConfig.configValue).toBe('******');

      const dict = await json<{ id: string }>(
        await api.post('/api/metadata/dicts?scopeId=0', {
          data: {
            dictCode: `e2e_${suffix}`,
            dictName: `E2E 字典 ${suffix}`,
            inheritGlobal: false,
            status: 'ENABLED',
          },
        }),
      );
      const item = await json<{ id: string }>(
        await api.post(`/api/metadata/dicts/${dict.id}/items?scopeId=0`, {
          data: {
            itemLabel: 'E2E 项',
            itemValue: `value_${suffix}`,
            defaultItem: true,
            status: 'ENABLED',
            sortNo: 1,
          },
        }),
      );

      await json(await api.delete(`/api/metadata/dicts/${dict.id}/items/${item.id}?scopeId=0`));
      await json(await api.delete(`/api/metadata/dicts/${dict.id}?scopeId=0`));
      await json(await api.delete(`/api/metadata/configs/${secretConfig.id}?scopeId=0`));
      await json(await api.delete(`/api/metadata/configs/${config.id}?scopeId=0`));
    } finally {
    }
  });

  test('部门可维护、用户可分配部门并批量停用', async ({ request }) => {
    const suffix = runSuffix();
    const api = await createAdminApiContext(request);
    let userId: string | undefined;
    let departmentId: string | undefined;
    try {
      const department = await json<{ id: string }>(
        await api.post('/api/org/departments', {
          data: {
            name: `E2E 部门 ${suffix}`,
            code: `e2e-dept-${suffix}`.slice(0, 64),
            sortNo: 10,
            status: 'ENABLED',
          },
        }),
      );
      departmentId = department.id;
      const user = await json<{ id: string }>(
        await api.post('/api/users', {
          data: {
            username: `e2e_org_${suffix}`,
            displayName: `E2E 组织用户 ${suffix}`,
            password: `E2e!${suffix}Organization`,
          },
        }),
      );
      userId = user.id;
      const assigned = await json<string[]>(
        await api.post(`/api/org/users/${user.id}/departments`, {
          data: { departmentIds: [department.id] },
        }),
      );
      expect(assigned).toEqual([department.id]);
      expect(await json<string[]>(await api.get(`/api/org/users/${user.id}/departments`))).toEqual([
        department.id,
      ]);

      await json(
        await api.put('/api/users/batch-status', {
          data: { userIds: [user.id], status: 'DISABLED' },
        }),
      );
      await json(
        await api.post(`/api/org/users/${user.id}/departments`, {
          data: { departmentIds: [] },
        }),
      );
      await json(await api.delete(`/api/org/departments/${department.id}`));
      departmentId = undefined;
    } finally {
      if (userId) {
        await api.put('/api/users/batch-status', {
          data: { userIds: [userId], status: 'DISABLED' },
        });
      }
      if (departmentId && userId) {
        await api.post(`/api/org/users/${userId}/departments`, {
          data: { departmentIds: [] },
        });
        await api.delete(`/api/org/departments/${departmentId}`);
      }
    }
  });
});
