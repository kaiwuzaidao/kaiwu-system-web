import { expect, test, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
type AiProvider = { apiKeyConfigured: boolean; lastTestStatus?: string };

async function setup(
  page: Page,
  options: {
    agentAutoOpen?: boolean;
    openDock?: boolean;
    permissions?: string[];
    aiProvider?: AiProvider;
    mustChangePassword?: boolean;
    answer?: string;
    extraMenus?: unknown[];
  } = {},
) {
  const catalog: Record<string, string> = {};
  for (const line of fs
    .readFileSync(
      path.resolve(process.env.KAIWU_SERVICE_DIR ?? '../kaiwu-system-service', 'sql/schema.sql'),
      'utf8',
    )
    .split('\n')) {
    const m = /^\s*\(\d{15,},\s*'([^']+)',\s*'((?:''|[^'])*)',\s*JSON_OBJECT/.exec(line);
    if (m) catalog[m[1]] = m[2].replaceAll("''", "'");
  }
  const user = {
    id: '1789248125900000001',
    username: 'admin',
    displayName: '测试管理员',
    locale: 'zh-CN',
    mustChangePassword: options.mustChangePassword ?? false,
    agentAutoOpen: options.agentAutoOpen ?? false,
    permissions: ['system:agent:ask', 'system:project:list', ...(options.permissions ?? [])],
  };
  const preferenceRequests: unknown[] = [];
  const aiSaves: Record<string, unknown>[] = [];
  let aiProvider: AiProvider & Record<string, unknown> = options.aiProvider ?? {
    apiKeyConfigured: true,
  };
  const sessions = [
    {
      id: '1789248125900000002',
      title: '昨日会话',
      useMemory: true,
      updatedAt: '2026-09-25T10:00:00',
    },
  ];
  const memories: { id: string; content: string; enabled: boolean; updatedAt: string }[] = [];
  const records: Record<
    string,
    { id: string; question: string; answer: string; completed: boolean; createdAt: string }[]
  > = {
    '1789248125900000002': Array.from({ length: 32 }, (_, i) => ({
      id: `1789248125900000${100 + i}`,
      question: `历史问题${i}`,
      answer: `历史回答${i}`,
      completed: true,
      createdAt: `2026-09-25T10:${String(i).padStart(2, '0')}:00`,
    })),
  };
  const requests: Record<string, unknown>[] = [];
  const state = { deny: false };
  await page.route('**/api/**', async (route) => {
    const req = route.request();
    const u = new URL(req.url());
    const method = req.method();
    let data: unknown = [];
    let status = 200;
    if (u.pathname.endsWith('/i18n/catalog'))
      data = { locale: 'zh-CN', revision: 58, messages: catalog };
    if (u.pathname.endsWith('/i18n/locales'))
      data = [{ locale: 'zh-CN', label: '简体中文', selectable: true }];
    if (u.pathname === '/api/auth/me') data = user;
    if (u.pathname === '/api/auth/refresh')
      data = { accessToken: 'e2e-access', expiresIn: 3600, user };
    if (u.pathname === '/api/auth/menus')
      data = [
        { id: 'projects', name: '项目管理', type: 'MENU', path: '/projects', children: [] },
        ...(options.extraMenus ?? []),
      ];
    if (u.pathname === '/api/projects') data = { current: 1, size: 20, total: 0, records: [] };
    if (u.pathname === '/api/agent/conversations') {
      if (method === 'POST') {
        const item = {
          id: '1789248125900000003',
          ...req.postDataJSON(),
          updatedAt: new Date().toISOString(),
        };
        sessions.push(item);
        records[item.id] = [];
        data = item;
      } else data = { current: 1, size: 20, total: sessions.length, records: sessions };
    }
    const conversation = /\/conversations\/(\d+)$/.exec(u.pathname);
    if (conversation) {
      const idx = sessions.findIndex((s) => s.id === conversation[1]);
      if (method === 'PATCH') {
        sessions[idx] = { ...sessions[idx], ...req.postDataJSON() };
        data = sessions[idx];
      }
      if (method === 'DELETE') {
        sessions.splice(idx, 1);
        delete records[conversation[1]];
      }
    }
    const message = /\/conversations\/(\d+)\/messages$/.exec(u.pathname);
    if (message) {
      if (state.deny) status = 403;
      else if (method === 'POST') {
        const body = req.postDataJSON();
        requests.push(body);
        const id = '1789248125900000500';
        records[message[1]].push({
          id,
          question: body.question,
          answer: options.answer ?? '本次已回答',
          completed: true,
          createdAt: new Date().toISOString(),
        });
        data = {
          messageId: id,
          answer: {
            answer: options.answer ?? '本次已回答',
            cards: [],
            usedCapabilities: [],
            correlationId: 'test',
          },
        };
      } else {
        const current = Number(u.searchParams.get('current') ?? '1');
        const all = [...records[message[1]]].reverse();
        data = {
          current,
          size: 30,
          total: all.length,
          records: all.slice((current - 1) * 30, current * 30),
        };
      }
    }
    if (u.pathname === '/api/ai/provider') {
      if (method === 'POST') {
        const body = req.postDataJSON();
        aiSaves.push(body);
        aiProvider = { ...body, apiKey: undefined, apiKeyConfigured: Boolean(body.apiKey) };
      }
      data = aiProvider;
    }
    if (u.pathname === '/api/ai/provider/test' && method === 'POST')
      data = {
        success: true,
        model: aiProvider.model,
        latencyMs: 120,
        message: 'ok',
        testedAt: new Date().toISOString(),
      };
    if (u.pathname === '/api/agent/preferences' && method === 'PUT') {
      const body = req.postDataJSON();
      preferenceRequests.push(body);
      user.agentAutoOpen = body.autoOpen;
      data = user;
    }
    if (u.pathname === '/api/agent/memories') {
      if (method === 'POST')
        memories.push({
          id: '1789248125900000600',
          ...req.postDataJSON(),
          updatedAt: new Date().toISOString(),
        });
      data = memories;
    }
    const memory = /\/memories\/(\d+)$/.exec(u.pathname);
    if (memory) {
      const idx = memories.findIndex((m) => m.id === memory[1]);
      if (method === 'PATCH') {
        memories[idx] = { ...memories[idx], ...req.postDataJSON() };
        data = memories[idx];
      }
      if (method === 'DELETE') memories.splice(idx, 1);
    }
    await route.fulfill({
      status,
      contentType: 'application/json',
      body: JSON.stringify({
        code: status === 200 ? 0 : status,
        data,
        message: status === 403 ? '无权限操作' : 'ok',
      }),
    });
  });
  await page.goto('/projects');
  if (options.openDock !== false)
    await page
      .locator('#root .kaiwu-header-actions')
      .getByRole('button', { name: 'AI 助手模式', exact: true })
      .click();
  return { sessions, memories, requests, state, preferenceRequests, aiSaves };
}

test('恢复分页历史、继续会话、刷新持久记录并重命名删除', async ({ page }) => {
  const { sessions, requests } = await setup(page);
  await page.getByRole('button', { name: '昨日会话', exact: true }).click();
  await expect(page.getByText('历史回答31', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '加载更早记录' }).click();
  await expect(page.getByText('历史回答0', { exact: true })).toBeVisible();
  await page.getByPlaceholder('向开物提问，或描述你要完成的任务…').fill('接着查询');
  await page.getByRole('button', { name: /发\s*送/ }).click();
  await expect(page.getByText('本次已回答', { exact: true })).toBeVisible();
  expect(requests[0]).not.toHaveProperty('history');
  expect(requests[0]).not.toHaveProperty('userId');
  await page.reload();
  await page
    .locator('#root .kaiwu-header-actions')
    .getByRole('button', { name: 'AI 助手模式', exact: true })
    .click();
  await page.getByRole('button', { name: '昨日会话', exact: true }).click();
  await expect(page.getByText('本次已回答', { exact: true })).toBeVisible();
  // 名称与记忆开关收在对话头部的编辑浮层里；侧栏会话项随之刷新。
  await page.getByRole('button', { name: '编辑', exact: true }).click();
  await page.getByLabel('会话名称').fill('周报会话');
  await page.getByRole('button', { name: /保\s*存/ }).click();
  await expect(page.getByRole('button', { name: '周报会话', exact: true })).toBeVisible();
  // 侧栏删除按钮是图标按钮，悬停才显示但始终可聚焦、可点击。
  await page.getByRole('button', { name: '周报会话', exact: true }).hover();
  await page.getByRole('button', { name: '删除', exact: true }).click();
  await page.getByRole('button', { name: /确\s*定/ }).click();
  await expect(page.getByText('暂无会话，发送消息即可开始')).toBeVisible();
  expect(sessions).toHaveLength(0);
  await expect(page.getByText('本次已回答', { exact: true })).toHaveCount(0);
});

test('手动记忆新增编辑停用删除及新会话隔离', async ({ page }, testInfo) => {
  const { memories } = await setup(page);
  // 宽屏会话栏常驻（V5），底部说明即个人记忆入口。
  await page.getByRole('button', { name: '个人记忆', exact: true }).click();
  const memoryDialog = page.getByRole('dialog', { name: '个人记忆' });
  await memoryDialog.getByLabel('记忆内容').fill('报表优先按周汇总');
  await memoryDialog.getByRole('button', { name: '添加记忆' }).click();
  await expect(memoryDialog.getByText('报表优先按周汇总', { exact: true })).toBeVisible();
  await memoryDialog.getByRole('button', { name: '编辑', exact: true }).click();
  await memoryDialog.getByLabel('记忆内容').fill('报表优先按月汇总');
  await memoryDialog.getByRole('button', { name: /保\s*存/ }).click();
  await expect(memoryDialog.getByText('报表优先按月汇总', { exact: true })).toBeVisible();
  await memoryDialog.getByRole('switch', { name: '启用记忆' }).last().click();
  await expect.poll(() => memories[0].enabled).toBe(false);
  await expect(memoryDialog.getByRole('switch', { name: '启用记忆' }).last()).not.toBeChecked();
  await page.screenshot({ path: testInfo.outputPath('agent-memory-panel.png') });
  await memoryDialog.getByRole('button', { name: '删除', exact: true }).click();
  await page.getByRole('button', { name: /确\s*定/ }).click();
  await expect(memoryDialog.getByText('暂无个人记忆')).toBeVisible();
  await page.locator('.ant-modal-close').click();
  await expect(memoryDialog).toHaveCount(0);
  await page.getByRole('button', { name: '昨日会话', exact: true }).click();
  await expect(page.getByText('历史回答31', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '新建会话', exact: true }).click();
  await expect(page.getByText('历史回答31', { exact: true })).toHaveCount(0);
});

test('历史访问失败不显示旧记录且阻止发送，可显式刷新恢复', async ({ page }) => {
  const { state } = await setup(page);
  state.deny = true;
  await page.getByRole('button', { name: '昨日会话', exact: true }).click();
  await expect(page.getByText('无权限操作', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /发\s*送/ })).toBeDisabled();
  await expect(page.getByText('历史回答31', { exact: true })).toHaveCount(0);
  state.deny = false;
  await page.getByRole('button', { name: '刷新记录', exact: true }).click();
  await expect(page.getByText('历史回答31', { exact: true })).toBeVisible();
});

test('勾选偏好后登录直接进入全屏聊天，切回传统模式后同一标签页刷新不再打断', async ({ page }) => {
  await setup(page, { agentAutoOpen: true, openDock: false });
  const composer = page.getByPlaceholder('向开物提问，或描述你要完成的任务…');
  await expect(composer).toBeVisible();
  await page.getByRole('button', { name: '助手设置', exact: true }).click();
  await expect(page.getByRole('checkbox', { name: '登录后默认进入 AI 助手' })).toBeChecked();
  // 聊天模式全屏覆盖平台菜单。
  const drawer = page.locator('.agent-dock-drawer .ant-drawer-content-wrapper');
  await expect.poll(async () => (await drawer.boundingBox())?.x).toBe(0);
  await page.locator('.agent-dock-exit').click();
  await expect(composer).toBeHidden();
  await expect(
    page
      .locator('#root .kaiwu-header-actions')
      .getByRole('button', { name: 'AI 助手模式', exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page
      .locator('#root .kaiwu-header-actions')
      .getByRole('button', { name: 'AI 助手模式', exact: true }),
  ).toBeVisible();
  await expect(composer).toBeHidden();
});

test('默认进入聊天模式的勾选按当前用户保存，请求体只带偏好值', async ({ page }) => {
  const { preferenceRequests } = await setup(page);
  // 偏好放在右侧上下文栏的设置浮层里。
  await page.getByRole('button', { name: '助手设置', exact: true }).click();
  const checkbox = page.getByRole('checkbox', { name: '登录后默认进入 AI 助手' });
  await expect(checkbox).not.toBeChecked();
  await checkbox.check();
  await expect.poll(() => preferenceRequests).toEqual([{ autoOpen: true }]);
  await expect(checkbox).toBeChecked();
  await checkbox.uncheck();
  await expect.poll(() => preferenceRequests).toEqual([{ autoOpen: true }, { autoOpen: false }]);
  await expect(checkbox).not.toBeChecked();
});

test('首次进入直接在对话里接入大模型，密钥不进入聊天，完成后给出示例问题', async ({ page }) => {
  const { aiSaves, requests } = await setup(page, {
    agentAutoOpen: true,
    openDock: false,
    permissions: ['system:ai:list', 'system:ai:save', 'system:ai:test'],
    aiProvider: { apiKeyConfigured: false },
  });
  await expect(page.getByText(/^你好，我是 Kaiwu AI 助手。/)).toBeVisible();
  const baseUrl = page.getByLabel('API Base URL');
  await expect(baseUrl).toHaveValue('https://api.deepseek.com/v1');
  await page.getByText('通义千问', { exact: true }).click();
  await expect(baseUrl).toHaveValue('https://dashscope.aliyuncs.com/compatible-mode/v1');
  await expect(page.getByLabel('模型', { exact: true })).toHaveValue('qwen-plus');
  await page.getByLabel('API Key').fill('sk-test-secret');
  await page.getByRole('button', { name: '保存并测试连接', exact: true }).click();
  await expect(
    page.getByText('已接入 qwen-plus，连接正常。现在可以直接提问，或者试试下面的问题。'),
  ).toBeVisible();
  expect(aiSaves).toEqual([
    expect.objectContaining({
      providerName: '通义千问',
      baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
      model: 'qwen-plus',
      apiKey: 'sk-test-secret',
    }),
  ]);
  // 起始卡片显示标题与说明，点击后发送「平台上现在有哪些项目？」。
  await page.getByRole('button', { name: /了解我的项目/ }).click();
  await expect(page.getByText('本次已回答', { exact: true })).toBeVisible();
  expect(JSON.stringify(requests)).not.toContain('sk-test-secret');
  const storage = await page.evaluate(() =>
    JSON.stringify([Object.entries(localStorage), Object.entries(sessionStorage)]),
  );
  expect(storage).not.toContain('sk-test-secret');
});

test('无配置权限时提示联系管理员，不展示接入表单', async ({ page }) => {
  await setup(page, {
    permissions: ['system:ai:list'],
    aiProvider: { apiKeyConfigured: false },
  });
  await expect(page.getByText(/^平台还没有接入大模型，AI 助手暂时无法回答。/)).toBeVisible();
  await expect(page.getByRole('button', { name: '保存并测试连接' })).toHaveCount(0);
});

test('传统模式与 AI 助手模式可随时互切', async ({ page }) => {
  await setup(page);
  const composer = page.getByPlaceholder('向开物提问，或描述你要完成的任务…');
  await expect(composer).toBeVisible();
  await page.locator('.agent-dock-exit').click();
  await expect(composer).toBeHidden();
  await expect(page.getByText(/^已切换到传统模式/)).toBeVisible();
  await page
    .locator('.kaiwu-header-actions')
    .getByRole('button', { name: 'AI 助手模式', exact: true })
    .click();
  await expect(composer).toBeVisible();
});

test('首个管理员改完初始密码后自动进入 AI 助手并看到接入表单', async ({ page }) => {
  await setup(page, {
    agentAutoOpen: true,
    openDock: false,
    mustChangePassword: true,
    permissions: ['system:ai:list', 'system:ai:save', 'system:ai:test'],
    aiProvider: { apiKeyConfigured: false },
  });
  const composer = page.getByPlaceholder('向开物提问，或描述你要完成的任务…');
  // 强制改密期间不自动进入，避免遮挡改密弹窗。
  await expect(page.getByLabel('当前密码')).toBeVisible();
  await expect(composer).toBeHidden();
  await page.getByLabel('当前密码').fill('Initial#Pass1');
  await page.getByLabel('新密码', { exact: true }).fill('Changed#Pass2');
  await page.getByLabel('确认新密码').fill('Changed#Pass2');
  await page.getByRole('button', { name: '设置新密码' }).click();
  await expect(composer).toBeVisible();
  await expect(page.getByRole('button', { name: '保存并测试连接', exact: true })).toBeVisible();
});

test('回答按受限 Markdown 渲染：代码块可复制，模型给出的链接不可点击', async ({ page }) => {
  await setup(page, {
    answer: [
      '## 本机运行',
      '1. 进入入口目录',
      '2. 执行下面的命令：',
      '```bash',
      './kaiwu up',
      '```',
      '3. 从工作台进入项目',
      '**注意**：项目编码用 `order-center`，详见 [快速开始](https://example.test/quickstart)。',
    ].join('\n'),
  });
  await page.getByPlaceholder('向开物提问，或描述你要完成的任务…').fill('怎么在本机跑起来');
  await page.getByRole('button', { name: /发\s*送/ }).click();
  const code = page.locator('.agent-dock-code pre');
  await expect(code).toHaveText('./kaiwu up');
  await expect(page.locator('.agent-dock-code .ant-typography-copy')).toBeVisible();
  await expect(page.locator('.agent-dock-answer').getByRole('listitem')).toHaveCount(3);
  // 代码块把有序列表切成两段，第二段沿用原编号。
  await expect(page.locator('.agent-dock-answer ol').nth(1)).toHaveAttribute('start', '3');
  await expect(page.locator('.agent-dock-answer strong')).toHaveText('注意');
  await expect(page.locator('.agent-dock-answer code')).toHaveText('order-center');
  await expect(page.getByText(/快速开始（https:\/\/example\.test\/quickstart）/)).toBeVisible();
  await expect(page.locator('.agent-dock-answer a')).toHaveCount(0);
});

test('做不到时给出本人有权限的相关页面，点击切到传统模式并打开', async ({ page }) => {
  await setup(page, {
    answer: '当前可用能力中没有创建字典的操作。',
    extraMenus: [
      {
        id: 'platform',
        name: '平台管理',
        type: 'DIRECTORY',
        children: [{ id: 'dicts', name: '字典管理', type: 'MENU', path: '/dicts', children: [] }],
      },
    ],
  });
  const composer = page.getByPlaceholder('向开物提问，或描述你要完成的任务…');
  await composer.fill('帮我创建一个字典');
  await page.getByRole('button', { name: /发\s*送/ }).click();
  await expect(page.getByText('可以在这些页面里操作：')).toBeVisible();
  await expect(
    page.locator('.agent-dock-related').getByRole('button', { name: /项目管理/ }),
  ).toHaveCount(0);
  await page
    .locator('.agent-dock-related')
    .getByRole('button', { name: /字典管理/ })
    .click();
  await expect(page).toHaveURL(/\/dicts$/);
  await expect(composer).toBeHidden();
  await expect(page.getByText(/^已切换到传统模式/)).toBeVisible();
});
