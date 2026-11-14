import { expect, test, type APIResponse } from '@playwright/test';
import { createAdminApiContext } from './support/auth';
import { requireAdminCredentials } from './support/env';

async function expectSuccess(response: APIResponse) {
  expect(response.ok(), await response.text()).toBeTruthy();
  expect(((await response.json()) as { code: number }).code).toBe(0);
}

test.describe('已上线能力：管理员只读 API 验收', () => {
  test.beforeAll(requireAdminCredentials);

  test('当前用户、项目、配置、字典和消息接口可读取', async ({ request }) => {
    const api = await createAdminApiContext(request);
    try {
      for (const path of [
        '/api/auth/me',
        '/api/current/projects',
        '/api/projects?current=1&size=100',
        '/api/metadata/configs?scopeId=0',
        '/api/metadata/dicts?scopeId=0',
        '/api/current/notifications?current=1&size=10',
        '/api/current/notifications/summary',
        '/api/project-generations',
        '/api/logs/operations?current=1&size=10',
        '/api/logs/logins?current=1&size=10',
        '/api/logs/sessions?current=1&size=10',
        '/api/org/departments',
        '/api/scheduler/jobs?current=1&size=10',
        '/api/scheduler/executions?current=1&size=10',
        '/api/search?q=system',
      ]) {
        await expectSuccess(await api.get(path));
      }
    } finally {
    }
  });

  test('用户 Excel 模板与导出接口返回有效工作簿', async ({ request }) => {
    const api = await createAdminApiContext(request);
    for (const path of ['/api/users/import-template', '/api/users/export']) {
      const response = await api.get(path);
      expect(response.ok(), await response.text()).toBeTruthy();
      expect(response.headers()['content-type']).toContain(
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );
      expect((await response.body()).byteLength).toBeGreaterThan(1000);
    }
  });

  test('system 内置项目不可被隐藏，AI 密钥不回传', async ({ request }) => {
    const api = await createAdminApiContext(request);
    try {
      const projectsResponse = await api.get('/api/projects?current=1&size=100');
      await expectSuccess(projectsResponse);
      const projects = (await projectsResponse.json()) as {
        data: {
          records: Array<{ id: string; builtIn: boolean; projectCode: string; status: string }>;
        };
      };
      const system = projects.data.records.find(
        (item) => item.builtIn || item.projectCode === 'system',
      );
      expect(system).toBeTruthy();
      expect(system?.status).toBe('ACTIVE');

      for (const path of ['/api/ai/provider']) {
        const response = await api.get(path);
        await expectSuccess(response);
        const serialized = JSON.stringify(await response.json());
        expect(serialized).not.toMatch(/"(?:apiKey|token)"\s*:/i);
      }
    } finally {
    }
  });
});
