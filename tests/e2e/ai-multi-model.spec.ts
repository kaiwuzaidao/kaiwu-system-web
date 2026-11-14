import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

test('多模型配置保留密钥并按用途保存绑定', async ({ page }, testInfo) => {
  const messages: Record<string, string> = {};
  for (const line of fs
    .readFileSync(
      path.resolve(
        process.env.KAIWU_SERVICE_DIR ?? '../kaiwu-system-agent-multimodel',
        'sql/schema.sql',
      ),
      'utf8',
    )
    .split('\n')) {
    const match = /^\s*\(\d{15,},\s*'([^']+)',\s*'((?:''|[^'])*)',\s*JSON_OBJECT/.exec(line);
    if (match) messages[match[1]] = match[2].replaceAll("''", "'");
  }
  Object.assign(messages, {
    'ai.models': '模型配置',
    'ai.addModel': '添加模型',
    'ai.editModel': '编辑模型',
    'ai.modelRoutes': '用途分配',
    'ai.planModel': '任务识别模型',
    'ai.answerModel': '回答模型',
    'ai.saveRoutes': '保存用途',
    'ai.modelsEmpty': '暂无模型',
    'ai.routesSaved': '用途已保存',
    'ai.loadFailed': '加载失败',
    'ai.testModel': '测试',
    'ai.modelSaved': '模型已保存',
    'ai.defaultModel': '默认模型',
    'ai.modelRoutesHint': '留空使用默认配置',
    'ai.addressChangedKeyHint': '修改服务地址时，请重新填写 API Key，或明确清除旧密钥。',
  });
  const user = {
    id: '1',
    username: 'admin',
    displayName: '管理员',
    locale: 'zh-CN',
    mustChangePassword: false,
    permissions: ['system:ai:list', 'system:ai:save', 'system:ai:test'],
  };
  let models = [
    {
      id: '1',
      providerName: '默认服务',
      baseUrl: 'https://example.com',
      apiKeyConfigured: true,
      model: 'default',
      temperature: 0.2,
      timeoutSeconds: 60,
    },
    {
      id: '2',
      providerName: '快速服务',
      baseUrl: 'https://example.org',
      apiKeyConfigured: true,
      model: 'small',
      temperature: 0.2,
      timeoutSeconds: 60,
    },
  ];
  let routes: { planModelId: string | null; answerModelId: string | null } = {
    planModelId: null,
    answerModelId: null,
  };
  let savedModel: Record<string, unknown> | undefined;
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url());
    let data: unknown = [];
    if (url.pathname.endsWith('/i18n/catalog')) data = { locale: 'zh-CN', revision: 1, messages };
    else if (url.pathname.endsWith('/i18n/locales'))
      data = [{ locale: 'zh-CN', label: '简体中文', selectable: true }];
    else if (url.pathname === '/api/auth/me') data = user;
    else if (url.pathname === '/api/auth/refresh')
      data = { accessToken: 'mock-access', expiresIn: 3600, user };
    else if (url.pathname === '/api/auth/menus')
      data = [{ id: 'ai', name: '大模型配置', type: 'MENU', path: '/ai-provider', children: [] }];
    else if (url.pathname === '/api/ai/models') {
      if (route.request().method() === 'POST') {
        savedModel = route.request().postDataJSON();
        models = models.map((model) =>
          model.id === savedModel?.id ? { ...model, model: String(savedModel.model) } : model,
        );
        data = models.find((model) => model.id === savedModel?.id);
      } else data = models;
    } else if (url.pathname === '/api/ai/model-routes') {
      if (route.request().method() === 'POST') routes = route.request().postDataJSON();
      data = routes;
    } else if (url.pathname === '/api/ai/models/2/test')
      data = { success: true, model: 'small', latencyMs: 50, message: '连接成功' };
    await route.fulfill({ json: { code: 0, data, message: 'ok' } });
  });
  await page.goto('/ai-provider');
  await expect(page.getByText('快速服务', { exact: true })).toBeVisible();
  await expect(page.getByText('默认模型').first()).toBeVisible();
  await page.getByLabel('任务识别模型').click();
  await page.getByTitle('快速服务 · small').last().click();
  await page.getByRole('button', { name: '保存用途' }).click();
  await expect.poll(() => routes).toEqual({ planModelId: '2', answerModelId: null });
  const row = page.getByRole('row').filter({ hasText: '快速服务' });
  await row.getByRole('button', { name: '编辑模型' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.locator('input[type="password"]')).toHaveValue('');
  await dialog.getByLabel('API Base URL').fill('https://other.example.org');
  await expect(
    dialog.getByText('修改服务地址时，请重新填写 API Key，或明确清除旧密钥。'),
  ).toBeVisible();
  await dialog.getByLabel('API Base URL').fill('https://example.org');
  await dialog.getByLabel('模型', { exact: true }).fill('small-v2');
  await dialog.getByRole('button', { name: /确\s*定/ }).click();
  await expect.poll(() => savedModel?.model).toBe('small-v2');
  expect(savedModel?.apiKey).toBeUndefined();
  expect(savedModel?.clearApiKey).not.toBe(true);
  await expect(page.getByRole('cell', { name: 'small-v2', exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('models.png'), animations: 'disabled' });
});
