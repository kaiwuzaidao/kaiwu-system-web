import { expect, test } from '@playwright/test';
import { e2e, requireMutationPermission, runSuffix } from './support/env';

type Envelope<T> = { code: number; data: T };

test.describe('Gateway 与平台权限安全边界', () => {
  test.beforeAll(requireMutationPermission);

  test('伪造 Context 被拒绝，登出后原 Token 立即失效', async ({ request }) => {
    const loginResponse = await request.post(`${e2e.baseURL}/api/auth/login`, {
      data: { username: e2e.adminUsername, password: e2e.adminPassword },
    });
    const session = (await loginResponse.json()) as Envelope<{ accessToken: string }>;
    expect(loginResponse.ok()).toBeTruthy();

    const forged = await request.get(`${e2e.baseURL}/api/platform/probe`, {
      headers: { 'X-Kaiwu-Context': 'forged' },
    });
    expect(forged.status()).toBe(401);

    const authorized = await request.get(`${e2e.baseURL}/api/platform/probe`, {
      headers: { Authorization: `Bearer ${session.data.accessToken}` },
    });
    expect(authorized.ok()).toBeTruthy();

    const logout = await request.post(`${e2e.baseURL}/api/auth/logout`, {
      headers: { Authorization: `Bearer ${session.data.accessToken}` },
    });
    expect(logout.ok()).toBeTruthy();
    const revoked = await request.get(`${e2e.baseURL}/api/platform/probe`, {
      headers: { Authorization: `Bearer ${session.data.accessToken}` },
    });
    expect(revoked.status()).toBe(401);
  });

  test('平台角色授权后可访问，撤权与停用会立即撤销会话', async ({ request }) => {
    const suffix = runSuffix();
    const password = `E2e!${suffix}r`;
    const adminLogin = await request.post(`${e2e.baseURL}/api/auth/login`, {
      data: { username: e2e.adminUsername, password: e2e.adminPassword },
    });
    const admin = (await adminLogin.json()) as Envelope<{ accessToken: string }>;
    const headers = { Authorization: `Bearer ${admin.data.accessToken}` };
    expect(adminLogin.ok()).toBeTruthy();

    let systemProjectId: string | undefined;
    let roleId: string | undefined;
    let userId: string | undefined;
    try {
      const projectsResponse = await request.get(`${e2e.baseURL}/api/projects?current=1&size=100`, {
        headers,
      });
      const projects = (await projectsResponse.json()) as Envelope<{
        records: Array<{ id: string; builtIn: boolean }>;
      }>;
      systemProjectId = projects.data.records.find((item) => item.builtIn)?.id;
      expect(systemProjectId).toBeTruthy();
      const menusResponse = await request.get(
        `${e2e.baseURL}/api/projects/${systemProjectId}/menus`,
        { headers },
      );
      const menus = (await menusResponse.json()) as Envelope<Array<MenuNode>>;
      const userListMenu = flattenMenus(menus.data).find(
        (item) => item.permissionCode === 'system:user:list',
      );
      expect(userListMenu).toBeTruthy();

      const roleResponse = await request.post(
        `${e2e.baseURL}/api/projects/${systemProjectId}/roles`,
        {
          headers,
          data: { roleCode: `e2e-role-${suffix}`, roleName: `E2E 角色 ${suffix}` },
        },
      );
      const role = (await roleResponse.json()) as Envelope<{ id: string }>;
      expect(roleResponse.ok()).toBeTruthy();
      roleId = role.data.id;
      const grant = await request.put(
        `${e2e.baseURL}/api/projects/${systemProjectId}/roles/${roleId}/menus`,
        {
          headers,
          data: { menuIds: [userListMenu?.id] },
        },
      );
      expect(grant.ok()).toBeTruthy();

      const username = `e2e_role_${suffix}`;
      const userResponse = await request.post(`${e2e.baseURL}/api/users`, {
        headers,
        data: { username, displayName: `E2E 角色用户 ${suffix}`, password },
      });
      const user = (await userResponse.json()) as Envelope<{ id: string }>;
      expect(userResponse.ok()).toBeTruthy();
      userId = user.data.id;
      const assign = await request.put(
        `${e2e.baseURL}/api/projects/${systemProjectId}/members/${userId}`,
        {
          headers,
          data: { roleIds: [roleId], status: 'ACTIVE' },
        },
      );
      expect(assign.ok()).toBeTruthy();

      const memberLogin = await request.post(`${e2e.baseURL}/api/auth/login`, {
        data: { username, password },
      });
      const member = (await memberLogin.json()) as Envelope<{ accessToken: string }>;
      const memberHeaders = { Authorization: `Bearer ${member.data.accessToken}` };
      expect(
        (
          await request.get(`${e2e.baseURL}/api/users?current=1&size=10`, {
            headers: memberHeaders,
          })
        ).status(),
      ).toBe(200);

      const revoke = await request.put(
        `${e2e.baseURL}/api/projects/${systemProjectId}/roles/${roleId}/menus`,
        {
          headers,
          data: { menuIds: [] },
        },
      );
      expect(revoke.ok()).toBeTruthy();
      expect(
        (await request.get(`${e2e.baseURL}/api/auth/me`, { headers: memberHeaders })).status(),
      ).toBe(401);
    } finally {
      if (userId)
        await request.put(`${e2e.baseURL}/api/users/${userId}/status`, {
          headers,
          data: { status: 'DISABLED' },
        });
      if (roleId && systemProjectId) {
        await request.put(`${e2e.baseURL}/api/projects/${systemProjectId}/roles/${roleId}/status`, {
          headers,
          data: { status: 'DISABLED' },
        });
      }
    }
  });
});

type MenuNode = { id: string; permissionCode?: string; children?: MenuNode[] };

function flattenMenus(items: MenuNode[]): MenuNode[] {
  return items.flatMap((item) => [item, ...flattenMenus(item.children ?? [])]);
}
