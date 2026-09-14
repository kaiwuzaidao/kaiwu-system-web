import { expect, type APIRequestContext, type APIResponse, type Page } from '@playwright/test';
import { e2e } from './env';

type LoginResult = {
  code: number;
  data: {
    accessToken: string;
    expiresIn: number;
    user: {
      id: string;
      username: string;
      displayName: string;
      locale: 'zh-CN' | 'en-US';
      permissions?: string[];
      mustChangePassword?: boolean;
    };
  };
};

export async function loginAsAdmin(page: Page) {
  if (!e2e.adminPassword) throw new Error('缺少 E2E_ADMIN_PASSWORD');
  const response = await page.request.post(`${e2e.baseURL}/api/auth/login`, {
    data: { username: e2e.adminUsername, password: e2e.adminPassword },
  });
  expect(response.ok(), await response.text()).toBeTruthy();
  const body = (await response.json()) as LoginResult;
  expect(body.code).toBe(0);
  const session = {
    ...body.data,
    // admin 的引导密码带强制改密标记，会把页面挡在个人中心。这里的夹具是为了测别的功能，
    // 所以跳过该引导；强制改密本身由 force-password-change 用例单独覆盖。
    user: { ...body.data.user, mustChangePassword: false },
  };
  await page.addInitScript((bootstrap) => {
    (
      window as Window & {
        __KAIWU_SESSION_BOOTSTRAP__?: unknown;
      }
    ).__KAIWU_SESSION_BOOTSTRAP__ = bootstrap;
  }, session);
  await page.goto('/');
  await expect(page).toHaveURL(/\/$/);
  return session;
}

type ApiOptions = { data?: unknown };

export type AdminApi = {
  get: (path: string) => Promise<APIResponse>;
  post: (path: string, options?: ApiOptions) => Promise<APIResponse>;
  put: (path: string, options?: ApiOptions) => Promise<APIResponse>;
  delete: (path: string) => Promise<APIResponse>;
};

export async function createAdminApiContext(request: APIRequestContext): Promise<AdminApi> {
  if (!e2e.adminPassword) throw new Error('缺少 E2E_ADMIN_PASSWORD');
  const response = await request.post(`${e2e.baseURL}/api/auth/login`, {
    data: { username: e2e.adminUsername, password: e2e.adminPassword },
  });
  expect(response.ok(), await response.text()).toBeTruthy();
  const body = (await response.json()) as LoginResult;
  expect(body.code).toBe(0);

  const headers = { Authorization: `Bearer ${body.data.accessToken}` };
  const call =
    (method: 'GET' | 'POST' | 'PUT' | 'DELETE') =>
    (path: string, options: ApiOptions = {}) =>
      request.fetch(`${e2e.baseURL}${path}`, { method, headers, data: options.data });
  return { get: call('GET'), post: call('POST'), put: call('PUT'), delete: call('DELETE') };
}
