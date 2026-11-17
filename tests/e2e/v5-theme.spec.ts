import { expect, test, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

async function mockPlatform(page: Page, loggedIn = true, extraPermissions: string[] = []) {
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
  const user = {
    id: '1789248125900000001',
    username: 'admin',
    displayName: '平台管理员',
    locale: 'zh-CN',
    agentAutoOpen: false,
    permissions: ['system:agent:ask', 'system:project:list', ...extraPermissions],
  };
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url());
    if (!loggedIn && url.pathname === '/api/auth/refresh') {
      await route.fulfill({ status: 401, json: { code: 401, data: null } });
      return;
    }
    let data: unknown = [];
    if (url.pathname.endsWith('/i18n/catalog')) data = { locale: 'zh-CN', revision: 58, messages };
    if (url.pathname.endsWith('/i18n/locales'))
      data = [{ locale: 'zh-CN', label: '简体中文', selectable: true }];
    if (url.pathname === '/api/auth/refresh')
      data = { accessToken: 'visual-fixture', expiresIn: 3600, user };
    if (url.pathname === '/api/auth/me') data = user;
    if (url.pathname === '/api/auth/menus')
      data = [
        {
          id: 'workspace',
          name: '工作空间',
          type: 'DIRECTORY',
          children: [
            { id: '1', name: '工作台', path: '/', icon: 'DashboardOutlined', children: [] },
            {
              id: '2',
              name: '项目管理',
              path: '/projects',
              icon: 'AppstoreOutlined',
              children: [],
            },
            {
              id: '3',
              name: '消息中心',
              path: '/notifications',
              icon: 'BellOutlined',
              children: [],
            },
          ],
        },
        {
          id: 'platform',
          name: '平台管理',
          type: 'DIRECTORY',
          children: [
            { id: '4', name: '用户管理', path: '/users', icon: 'UserOutlined', children: [] },
            {
              id: '5',
              name: '安全运营',
              path: '/security',
              icon: 'SafetyCertificateOutlined',
              children: [],
            },
            {
              id: '6',
              name: '组织架构',
              path: '/organization',
              icon: 'ApartmentOutlined',
              children: [],
            },
            { id: '7', name: '参数配置', path: '/configs', icon: 'SettingOutlined', children: [] },
            {
              id: '8',
              name: '字典管理',
              path: '/dictionaries',
              icon: 'BookOutlined',
              children: [],
            },
            {
              id: '9',
              name: '定时任务',
              path: '/scheduler',
              icon: 'FieldTimeOutlined',
              children: [],
            },
          ],
        },
        {
          id: 'delivery',
          name: '研发交付',
          type: 'DIRECTORY',
          children: [
            {
              id: '10',
              name: '大模型配置',
              path: '/ai-provider',
              icon: 'ApiOutlined',
              children: [],
            },
            {
              id: '12',
              name: '项目工厂',
              path: '/project-factory',
              icon: 'CodeOutlined',
              children: [],
            },
          ],
        },
      ];
    if (url.pathname === '/api/projects')
      data = {
        records: [
          {
            id: '1789248125900000002',
            projectName: '演示项目',
            projectCode: 'demo-project',
            description: '本地界面测试数据',
            status: 'ACTIVE',
            createdAt: '2026-10-19T10:00:00',
          },
        ],
        total: 1,
        current: 1,
        size: 20,
      };
    if (url.pathname === '/api/current/projects')
      data = [
        {
          id: '1789248125900000002',
          projectCode: 'demo-project',
          projectName: '演示项目',
          status: 'ACTIVE',
          builtIn: false,
        },
      ];
    if (url.pathname === '/api/notifications/summary') data = { unreadCount: 0, recent: [] };
    if (url.pathname === '/api/agent/conversations')
      data = { records: [], total: 0, current: 1, size: 20 };
    if (url.pathname === '/api/ai/provider') data = { apiKeyConfigured: true, model: 'demo-model' };
    if (url.pathname === '/api/auth/menus') {
      const markTypes = (nodes: any[]): any[] =>
        nodes.map((node) => ({
          ...node,
          type: node.children.length ? 'DIRECTORY' : 'MENU',
          children: markTypes(node.children),
        }));
      data = markTypes(data as any[]);
    }
    await route.fulfill({ json: { code: 0, data } });
  });
}

for (const width of [1440, 390]) {
  test(`Ant Pro 登录页 ${width}px 不溢出且可提交校验`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await mockPlatform(page, false);
    await page.goto('/login');
    await expect(page.locator('input[type="password"]')).toBeVisible();
    await expect(page.locator('.kaiwu-login-form')).toBeVisible();
    if (width === 1440) {
      expect((await page.locator('.ant-pro-form-login-main').boundingBox())?.width).toBe(400);
    }
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBeTruthy();
    await page.locator('.kaiwu-login-form .ant-btn-primary').click();
    await expect(page.locator('.ant-form-item-explain-error').first()).toBeVisible();
    await page.screenshot({
      animations: 'disabled',
      path: testInfo.outputPath(`login-${width}.png`),
    });
  });
  test(`Ant Pro 顶栏与 AI 模式 ${width}px 保持可用`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await mockPlatform(page);
    await page.goto('/projects');
    await expect(page.locator('#root .kaiwu-header-actions')).toBeVisible();
    const entry = page
      .locator('#root .kaiwu-header-actions')
      .getByRole('button', { name: 'AI 助手模式', exact: true });
    await expect(entry).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBeTruthy();
    await page.screenshot({
      animations: 'disabled',
      path: testInfo.outputPath(`platform-${width}.png`),
    });
    await entry.click();
    await expect(page.locator('.agent-dock-main')).toBeVisible();
    await expect(page.locator('.agent-dock-composer')).toBeVisible();
    await expect
      .poll(
        async () =>
          (await page.locator('.agent-dock-drawer .ant-drawer-content-wrapper').boundingBox())?.x,
      )
      .toBe(0);
    await page.locator('.agent-dock-exit').click();
    await expect(page.locator('#root .kaiwu-header-actions')).toBeVisible();
  });
}

test('Ant Pro 菜单按后端分组直接展示，收起后保持图标导航', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await mockPlatform(page);
  await page.goto('/projects');
  const sider = page.locator('.ant-pro-sider');
  await expect(sider.locator('.ant-menu-item-group-title')).toHaveCount(3);
  await expect(sider.getByText('工作空间', { exact: true })).toBeVisible();
  await expect(sider.getByText('研发交付', { exact: true })).toBeVisible();
  const selected = sider.locator('.ant-menu-item-selected');
  await expect(selected).toContainText('项目管理');
  expect((await selected.boundingBox())?.x).toBeGreaterThan(0);
  await expect(sider).toHaveCSS('width', '256px');
  await expect(page.locator('.ant-pro-global-header')).toHaveCSS('height', '56px');
  await expect(selected.locator('.anticon')).toBeVisible();
  expect(await selected.evaluate((e) => getComputedStyle(e, '::before').display)).toBe('none');
  await expect(sider.locator('.kaiwu-sidebar-assistant')).toBeVisible();
  await page.screenshot({ animations: 'disabled', path: testInfo.outputPath('menu-expanded.png') });
  await sider.locator('.ant-pro-sider-collapsed-button').click();
  await expect(sider).toHaveClass(/ant-layout-sider-collapsed/);
  await expect(sider).toHaveCSS('width', '64px');
  await expect(sider.locator('.ant-menu-item-group-title')).toHaveCount(0);
  await expect(sider.locator('.ant-menu-item').first()).toBeVisible();
  await page.screenshot({
    animations: 'disabled',
    path: testInfo.outputPath('menu-collapsed.png'),
  });
});

test('手机菜单抽屉保留分组及导航点击', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockPlatform(page);
  await page.goto('/projects');
  await page.locator('.ant-pro-global-header-collapsed-button').click();
  const drawer = page
    .locator('.ant-drawer')
    .filter({ has: page.locator('.ant-menu-item-group-title') });
  await expect(drawer.getByText('工作空间', { exact: true })).toBeVisible();
  await expect(drawer.locator('.ant-menu-item-selected')).toContainText('项目管理');
  await expect
    .poll(async () => (await drawer.locator('.ant-drawer-content-wrapper').boundingBox())?.x)
    .toBe(0);
  await page.screenshot({ animations: 'disabled', path: testInfo.outputPath('menu-mobile.png') });
  await drawer.getByText('工作台', { exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
});

test('Ant Pro 工作台和 AI 页面布局', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await mockPlatform(page, true, ['system:ai:list', 'system:project-factory:list']);
  await page.goto('/');
  // 概览：两张状态卡（项目、AI 服务）+ 待办；工程交付链路与仓库交付卡已移除。
  await expect(page.locator('.kaiwu-home-stats .kaiwu-stat-card')).toHaveCount(2);
  await expect(page.locator('.kaiwu-delivery-pipeline')).toHaveCount(0);
  // mock 环境没有待办：待办卡片固定占位并显示空状态。
  await expect(page.locator('.kaiwu-home-todos .kaiwu-todo-empty')).toBeVisible();
  await expect(page.locator('.kaiwu-project-entry')).toBeVisible();
  await expect(page.locator('.kaiwu-home .ant-spin-spinning')).toHaveCount(0);
  await page.screenshot({
    animations: 'disabled',
    path: testInfo.outputPath('html-dashboard.png'),
  });
  await page
    .locator('#root .kaiwu-header-actions')
    .getByRole('button', { name: 'AI 助手模式', exact: true })
    .click();
  await expect(page.locator('.agent-shell-rail')).toHaveCSS('width', '76px');
  // 当前夹具包含 3 + 6 + 2 个后端菜单项。
  await expect(page.locator('.agent-shell-rail-links .ant-btn')).toHaveCount(11);
  await expect(page.locator('.agent-shell-topbar')).toBeVisible();
  await expect(page.locator('.agent-dock-composer')).toBeVisible();
  await expect
    .poll(
      async () =>
        (await page.locator('.agent-dock-drawer .ant-drawer-content-wrapper').boundingBox())?.x,
    )
    .toBe(0);
  await page.screenshot({ animations: 'disabled', path: testInfo.outputPath('html-ai.png') });
  await page.keyboard.press('ControlOrMeta+k');
  await expect(page.getByRole('dialog', { name: '全局搜索' })).toHaveCount(1);
  await page.getByRole('dialog', { name: '全局搜索' }).locator('.ant-modal-close').click();
});

test('项目详情侧栏与更多操作保留原权限入口', async ({ page }, testInfo) => {
  await mockPlatform(page, true, ['system:project:update', 'system:project:status']);
  await page.goto('/projects');
  await page.locator('.kaiwu-project-name').click();
  await expect(page.locator('.kaiwu-project-detail')).toContainText('本地界面测试数据');
  await expect
    .poll(
      async () =>
        (await page.locator('.kaiwu-project-detail .ant-drawer-content-wrapper').boundingBox())?.x,
    )
    .toBe((page.viewportSize()?.width ?? 1280) - 540);
  await page.screenshot({
    animations: 'disabled',
    path: testInfo.outputPath('html-project-detail.png'),
  });
  await page.locator('.kaiwu-project-detail .ant-drawer-close').click();
  await page.getByRole('button', { name: '操作', exact: true }).click();
  await expect(
    page.locator('.kaiwu-project-more').getByRole('button', { name: /停用/ }),
  ).toBeVisible();
});

test('UI 审查：六个入口在 2048px 的模拟界面', async ({ browser }, testInfo) => {
  const loginPage = await browser.newPage({ viewport: { width: 2048, height: 1100 } });
  await mockPlatform(loginPage, false);
  await loginPage.goto('/login');
  await expect(loginPage.locator('input#password')).toBeVisible();
  await loginPage.screenshot({ animations: 'disabled', path: testInfo.outputPath('login.png') });
  await loginPage.close();

  const page = await browser.newPage({ viewport: { width: 2048, height: 1100 } });
  await mockPlatform(page, true, [
    'system:project:create',
    'system:project-factory:generate',
    'system:ai:list',
  ]);
  await page.route('**/api/current/projects', (route) =>
    route.fulfill({
      json: {
        code: 0,
        data: [
          {
            id: '1789248125900000002',
            projectName: 'Kaiwu System',
            projectCode: 'system',
            status: 'ACTIVE',
            builtIn: true,
          },
          {
            id: '1789248125900000003',
            projectName: '演示项目',
            projectCode: 'demo-project',
            status: 'ACTIVE',
            builtIn: false,
            backendUrl: '/apps/demo/',
          },
          {
            id: '1789248125900000004',
            projectName: '测试项目',
            projectCode: 'test-project',
            status: 'ACTIVE',
            builtIn: false,
            backendUrl: '/apps/test/',
          },
        ],
      },
    }),
  );
  await page.goto('/select-project');
  await expect(page.locator('.kaiwu-select-card')).toHaveCount(3);
  await page.screenshot({ animations: 'disabled', path: testInfo.outputPath('selector.png') });
  await page.goto('/');
  await expect(page.locator('.kaiwu-home .ant-spin-spinning')).toHaveCount(0);
  await expect(page.locator('.kaiwu-project-entry')).toHaveCount(3);
  await page.screenshot({ animations: 'disabled', path: testInfo.outputPath('workbench.png') });
  await page.goto('/projects');
  await expect(page.locator('.kaiwu-project-name')).toBeVisible();
  await page.screenshot({ animations: 'disabled', path: testInfo.outputPath('projects.png') });
  await page.goto('/project-onboarding');
  await expect(page.getByLabel('项目编码')).toBeVisible();
  const formBounds = await page.getByLabel('Java 包名').boundingBox();
  const nextBounds = await page.getByRole('button', { name: '下一步' }).boundingBox();
  expect(formBounds).not.toBeNull();
  expect(nextBounds).not.toBeNull();
  expect(
    Math.abs(formBounds!.x + formBounds!.width - nextBounds!.x - nextBounds!.width),
  ).toBeLessThan(2);
  expect(formBounds!.width).toBeLessThanOrEqual(860);
  await page.screenshot({ animations: 'disabled', path: testInfo.outputPath('onboarding.png') });
  await page.getByLabel('项目编码').fill('review-project');
  await page.getByLabel('项目名称').fill('审查项目');
  await page.getByRole('button', { name: '下一步' }).click();
  await page.getByRole('button', { name: '上一步' }).click();
  await expect(page.getByLabel('项目编码')).toHaveValue('review-project');
  await page.getByRole('button', { name: '下一步' }).click();
  await page.getByRole('button', { name: '下一步' }).click();
  await page.getByRole('button', { name: '下一步' }).click();
  await expect(page.getByRole('button', { name: '创建并生成' })).toBeVisible();
  await page
    .locator('#root .kaiwu-header-actions')
    .getByRole('button', { name: 'AI 助手模式', exact: true })
    .click();
  await expect(page.locator('.agent-dock-composer')).toBeVisible();
  await page.screenshot({ animations: 'disabled', path: testInfo.outputPath('ai-workspace.png') });
  await page.close();
});

for (const width of [1280, 390]) {
  test(`项目选择与向导 ${width}px 保持可用`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await mockPlatform(page, true, ['system:project:create', 'system:project-factory:generate']);
    await page.route('**/api/current/projects', (route) =>
      route.fulfill({
        json: {
          code: 0,
          data: [
            {
              id: '1789248125900000002',
              projectName: 'Kaiwu System',
              projectCode: 'system',
              status: 'ACTIVE',
              builtIn: true,
            },
            {
              id: '1789248125900000003',
              projectName: '测试项目',
              projectCode: 'test-project',
              status: 'ACTIVE',
              builtIn: false,
              backendUrl: '/apps/test/',
            },
          ],
        },
      }),
    );
    await page.goto('/select-project');
    await expect(page.locator('.kaiwu-select-card')).toHaveCount(2);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    ).toBeTruthy();
    const cards = await page
      .locator('.kaiwu-select-card')
      .evaluateAll((nodes) => nodes.map((node) => node.getBoundingClientRect().top));
    expect(width === 390 ? cards[1] > cards[0] : cards[1] === cards[0]).toBeTruthy();
    await page.goto('/project-onboarding');
    await expect(page.getByLabel('项目编码')).toBeVisible();
    await expect(page.getByRole('button', { name: '下一步' })).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    ).toBeTruthy();
  });
}

test('UI 审查：其余管理页面及批量弹窗', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 2048, height: 1100 });
  await mockPlatform(page, true, [
    'system:org:list',
    'system:org:assign',
    'system:org:save',
    'system:user:list',
    'system:storage:list',
    'system:storage:save',
    'system:scheduler:list',
    'system:scheduler:save',
    'system:i18n:list',
  ]);
  await page.route('**/api/**', async (route, request) => {
    const url = new URL(request.url());
    let data: unknown;
    if (url.pathname === '/api/org/departments')
      data = [{ id: '10', name: '开发部', code: 'dev', status: 'ENABLED', children: [] }];
    else if (url.pathname === '/api/org/user-departments') data = {};
    else if (url.pathname === '/api/users')
      data = {
        current: 1,
        size: 10,
        total: 1,
        records: [{ id: '21', username: 'example', displayName: '示例用户', status: 'ENABLED' }],
      };
    else if (url.pathname === '/api/current/notifications')
      data = { current: 1, size: 10, total: 0, records: [] };
    else if (url.pathname === '/api/storage/accounts' || url.pathname === '/api/storage/bindings')
      data = [];
    else if (url.pathname.includes('/scheduler/') && url.pathname.endsWith('/handlers')) data = [];
    else return route.fallback();
    await route.fulfill({ json: { code: 0, data } });
  });
  for (const [route, name] of [
    ['/notifications', 'notifications'],
    ['/users', 'users'],
    ['/scheduler', 'scheduler'],
    ['/storage', 'storage'],
    ['/i18n-resources', 'i18n'],
  ] as const) {
    await page.goto(route);
    await expect(page.locator('.ant-pro-page-container')).toBeVisible();
    if (name === 'users') await expect(page.getByText('示例用户')).toBeVisible();
    if (name === 'storage') await expect(page.getByText(/还没有存储账号/)).toBeVisible();
    if (name === 'scheduler') {
      await expect(page.getByText('当前项目还没有在线任务处理器')).toBeVisible();
      await expect(page.getByRole('button', { name: '新建任务' })).toBeDisabled();
    }
    await page.screenshot({ animations: 'disabled', path: testInfo.outputPath(`${name}.png`) });
    if (name === 'scheduler') {
      await page.getByText('安全执行模型').click();
      await expect(page.getByText(/System 不能下发 Java 类/)).toBeVisible();
    }
  }
  await page.goto('/organization');
  await expect(page.getByRole('tree').getByText('开发部')).toBeVisible();
  await page.screenshot({ animations: 'disabled', path: testInfo.outputPath('organization.png') });
  await page.getByRole('tree').getByText('开发部').click();
  await page.getByRole('button', { name: '批量添加人员' }).click();
  await expect(page.getByRole('dialog').getByText('@example', { exact: false })).toBeVisible();
  await page.waitForTimeout(400);
  await page.screenshot({
    animations: 'disabled',
    path: testInfo.outputPath('organization-modal.png'),
  });
});

test('项目角色删除失败时显示后端原因并保留角色', async ({ page }) => {
  await mockPlatform(page, true, ['system:project:role']);
  await page.route('**/api/projects/*/roles**', async (route) => {
    if (route.request().method() === 'DELETE') {
      await route.fulfill({
        status: 400,
        json: {
          code: 400,
          message: '项目角色仍有成员使用',
          messageKey: 'api.common.badRequest',
          data: null,
        },
      });
      return;
    }
    await route.fulfill({
      json: {
        code: 0,
        data: [
          {
            id: '1792578114246000001',
            roleCode: 'test',
            roleName: '测试角色',
            status: 'ACTIVE',
            menuIds: [],
            builtIn: false,
          },
        ],
      },
    });
  });
  await page.goto('/projects');
  await page.getByRole('button', { name: '权限中心' }).click();
  const row = page.getByRole('row').filter({ hasText: '测试角色' });
  await row.getByRole('button', { name: '删除' }).click();
  await page.getByRole('button', { name: '确 定' }).click();
  await expect(page.locator('.ant-message-error')).toContainText('项目角色仍有成员使用');
  await expect(row).toBeVisible();
});

test('消息中心全部已读失败时显示原因', async ({ page }) => {
  await mockPlatform(page);
  await page.route('**/api/current/notifications**', async (route) => {
    if (route.request().method() === 'PUT') {
      await route.fulfill({
        status: 400,
        json: { code: 400, message: '消息状态更新失败', messageKey: 'api.common.badRequest' },
      });
    } else {
      await route.fulfill({
        json: { code: 0, data: { records: [], total: 0, current: 1, size: 10 } },
      });
    }
  });
  await page.goto('/notifications');
  await page.getByRole('button', { name: '全部已读' }).click();
  await expect(page.locator('.ant-message-error')).toContainText('消息状态更新失败');
});

test('消息铃铛按配置的间隔刷新', async ({ page }) => {
  await page.clock.install();
  await mockPlatform(page);
  let requests = 0;
  await page.route('**/api/current/ui-preferences', (route) =>
    route.fulfill({ json: { code: 0, data: { 'platform.notification.poll_seconds': 15 } } }),
  );
  await page.route('**/api/current/notifications/summary', (route) => {
    requests += 1;
    return route.fulfill({ json: { code: 0, data: { unreadCount: 0, recent: [] } } });
  });
  await page.goto('/projects');
  await expect.poll(() => requests).toBeGreaterThan(0);
  await page.waitForTimeout(100);
  const before = requests;
  await page.clock.fastForward(14_000);
  expect(requests).toBe(before);
  await page.clock.fastForward(1_100);
  await expect.poll(() => requests).toBeGreaterThan(before);
});

for (const [width, height] of [
  [1280, 800],
  [1440, 900],
  [1920, 1080],
  [390, 844],
] as const) {
  test(`弹窗布局及项目编辑保留字段 ${width}x${height}`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height });
    await mockPlatform(page, true, [
      'system:project:update',
      'system:org:list',
      'system:org:assign',
      'system:user:list',
    ]);
    const project = {
      id: '1789248125900000002',
      projectCode: 'demo-project',
      projectName: '演示项目',
      packageName: 'com.example.project',
      description: '用于验证的长描述',
      repositoryUrl: 'https://example.com/legacy.git',
      gitlabProjectId: 'group/project',
      defaultBranch: 'main',
      backendUrl: '/apps/demo/',
      backendLabel: '演示后台',
      serviceUrl: 'http://service:8080',
      status: 'ACTIVE',
      builtIn: false,
    };
    let saved: Record<string, unknown> | undefined;
    let editAttempts = 0;
    let assignmentWrites = 0;
    let assignmentPayload: unknown;
    await page.route('**/api/**', async (route, request) => {
      const url = new URL(request.url());
      let data: unknown;
      if (url.pathname === '/api/projects' && request.method() === 'GET')
        data = { records: [project], total: 1, current: 1, size: 20 };
      else if (url.pathname === `/api/projects/${project.id}` && request.method() === 'PUT') {
        editAttempts += 1;
        if (editAttempts === 1)
          return route.fulfill({ status: 400, json: { code: 400, message: '模拟保存失败' } });
        saved = request.postDataJSON();
        data = project;
      } else if (url.pathname === '/api/org/users/21/departments' && request.method() === 'POST') {
        assignmentWrites += 1;
        assignmentPayload = request.postDataJSON();
        data = [];
      } else if (url.pathname === '/api/org/departments')
        data = [
          { id: '10', name: '开发部', code: 'dev', status: 'ENABLED', children: [] },
          { id: '20', name: '产品部', code: 'product', status: 'ENABLED', children: [] },
        ];
      else if (url.pathname === '/api/org/user-departments') data = { '21': ['10', '20'] };
      else if (url.pathname === '/api/users')
        data = {
          current: 1,
          size: 10,
          total: 1,
          records: [{ id: '21', username: 'example', displayName: '示例用户', status: 'ENABLED' }],
        };
      else return route.fallback();
      await route.fulfill({ json: { code: 0, data } });
    });
    await page.goto('/projects');
    await page.getByRole('button', { name: '操作', exact: true }).click();
    await page
      .locator('.kaiwu-project-more')
      .getByRole('button', { name: '编辑', exact: true })
      .click();
    const dialog = page.getByRole('dialog');
    await expect(page.locator('.kaiwu-project-more:visible')).toHaveCount(0);
    await expect(dialog.getByLabel('项目名称', { exact: true })).toHaveValue('演示项目');
    await expect(dialog.getByLabel('项目描述')).toHaveValue('用于验证的长描述');
    await expect(dialog.getByLabel('单仓代码生成仓库地址')).toHaveValue(
      'https://example.com/legacy.git',
    );
    await expect(dialog.getByLabel('GitLab 项目标识')).toHaveValue('group/project');
    await expect(dialog.getByLabel('服务地址')).toHaveValue('http://service:8080');
    await page.waitForTimeout(350);
    await page.screenshot({
      animations: 'disabled',
      path: testInfo.outputPath(`edit-${width}.png`),
    });
    await dialog.getByLabel('项目描述').fill('修改后的完整描述');
    await dialog.getByRole('button', { name: '确 定' }).click();
    await expect(page.getByText('模拟保存失败')).toBeVisible();
    await expect(dialog.getByLabel('项目描述')).toHaveValue('修改后的完整描述');
    await dialog.getByRole('button', { name: '确 定' }).click();
    await expect.poll(() => saved?.description).toBe('修改后的完整描述');
    expect(saved).toMatchObject({
      repositoryUrl: project.repositoryUrl,
      gitlabProjectId: project.gitlabProjectId,
      defaultBranch: project.defaultBranch,
      backendUrl: project.backendUrl,
      backendLabel: project.backendLabel,
      serviceUrl: project.serviceUrl,
      packageName: project.packageName,
    });
    await page.goto('/organization');
    await page
      .getByRole('row')
      .filter({ hasText: '@example' })
      .getByRole('button', { name: '调整归属' })
      .click();
    const assignment = page.getByRole('dialog');
    await expect(assignment.getByText('开发部', { exact: false })).toBeVisible();
    await expect(assignment.getByText('产品部', { exact: false })).toBeVisible();
    await page.waitForTimeout(350);
    await page.screenshot({
      animations: 'disabled',
      path: testInfo.outputPath(`assign-${width}.png`),
    });
    await assignment.locator('.ant-select').first().hover();
    await assignment.locator('.ant-select').first().locator('.ant-select-clear').click();
    await expect(assignment.getByRole('combobox', { name: '兼任部门' })).toBeDisabled();
    await assignment.getByRole('button', { name: '取 消' }).click();
    expect(assignmentWrites).toBe(0);
    await page
      .getByRole('row')
      .filter({ hasText: '@example' })
      .getByRole('button', { name: '调整归属' })
      .click();
    await expect(assignment.getByText('开发部', { exact: false })).toBeVisible();
    await expect(assignment.getByText('产品部', { exact: false })).toBeVisible();
    await assignment.locator('.ant-select').first().hover();
    await assignment.locator('.ant-select').first().locator('.ant-select-clear').click();
    await assignment.getByRole('button', { name: '确 定' }).click();
    await expect.poll(() => assignmentPayload).toEqual({ departmentIds: [] });
    await page.getByRole('tree').getByText('开发部').click();
    await page.getByRole('button', { name: '批量添加人员' }).click();
    await expect(page.getByRole('dialog').getByText('@example')).toBeVisible();
    await page.waitForTimeout(350);
    await page.screenshot({
      animations: 'disabled',
      path: testInfo.outputPath(`bulk-${width}.png`),
    });
    const footer = page.getByRole('dialog').getByRole('button', { name: '确 定' });
    await expect(footer).toBeVisible();
    const bounds = await footer.boundingBox();
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(height);
  });
}

for (const [width, height] of [
  [1280, 800],
  [1440, 900],
  [390, 844],
] as const) {
  test(`对象存储账号帮助可按需查看 ${width}x${height}`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height });
    await mockPlatform(page, true, ['system:storage:list', 'system:storage:save']);
    let submitted: Record<string, unknown> | undefined;
    await page.route('**/api/storage/accounts', (route) => {
      if (route.request().method() === 'POST') submitted = route.request().postDataJSON();
      return route.fulfill({
        json: { code: 0, data: route.request().method() === 'GET' ? [] : {} },
      });
    });
    await page.goto('/storage');
    await page.getByRole('button', { name: '新增账号' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByLabel('桶名', { exact: true })).toBeVisible();
    await expect(dialog.getByLabel('存储地址', { exact: true })).toBeVisible();
    const help = dialog.getByRole('button', { name: /所填主机必须在/ });
    await expect(help).toBeVisible();
    await expect(page.getByText(/所填主机必须在/)).toHaveCount(0);
    await help.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByText(/所填主机必须在/)).toBeVisible();
    await page.waitForTimeout(350);
    await page.screenshot({
      animations: 'disabled',
      path: testInfo.outputPath(`storage-help-${width}.png`),
    });
    await help.click();
    await page.waitForTimeout(350);
    await page.screenshot({
      animations: 'disabled',
      path: testInfo.outputPath(`storage-account-${width}.png`),
    });
    await dialog.getByRole('button', { name: '确 定' }).click();
    await expect(dialog.locator('.ant-form-item-explain-error').first()).toBeVisible();
    await dialog.getByLabel('名称', { exact: true }).fill('测试存储');
    await dialog.getByLabel('编码', { exact: true }).fill('test-storage');
    await dialog.getByLabel('桶名', { exact: true }).fill('sample-bucket');
    await dialog.getByLabel('存储地址', { exact: true }).fill('https://storage.example.com');
    await dialog.getByLabel('STS 地址', { exact: true }).fill('https://sts.example.com');
    await dialog.getByLabel('区域', { exact: true }).fill('cn-hangzhou');
    await dialog.getByLabel('角色 ARN', { exact: true }).fill('acs:ram::123:role/example');
    await dialog.getByLabel('AccessKey ID', { exact: true }).fill('fixture-id');
    await dialog.getByLabel('AccessKey Secret', { exact: true }).fill('fixture-secret');
    await dialog.getByRole('button', { name: '确 定' }).click();
    await expect.poll(() => submitted?.bucket).toBe('sample-bucket');
    expect(submitted).toMatchObject({
      providerType: 'ALIYUN_OSS',
      roleArn: 'acs:ram::123:role/example',
      endpoint: 'https://storage.example.com',
      stsEndpoint: 'https://sts.example.com',
    });
  });
}

/** 官方预览在 1440px 下实测的公共几何规格，业务数据使用受控 fixture。 */
test('Ant Pro 公共布局与官方预览尺寸一致', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await mockPlatform(page, true, ['system:ai:list']);
  await page.goto('/');
  await expect(page.locator('.kaiwu-home-stats .ant-card').first()).toBeVisible();
  await expect(page.locator('.ant-pro-global-header')).toHaveCSS('height', '56px');
  await expect(page.locator('.ant-pro-sider')).toHaveCSS('width', '256px');
  await expect(page.locator('.kaiwu-content-frame')).toHaveCSS('padding-left', '40px');
  await expect(page.locator('.kaiwu-content-frame')).toHaveCSS('padding-top', '32px');
  await expect(page.locator('.ant-pro-page-container-children-container')).toHaveCSS(
    'padding-left',
    '0px',
  );
  await expect(page.locator('.ant-page-header-heading-title')).toHaveCSS('font-size', '20px');
  await expect(page.locator('.ant-card-head').first()).toHaveCSS('font-size', '16px');
  await expect(page.locator('.ant-card').first()).toHaveCSS('border-radius', '8px');
  await expect(page.locator('.ant-pro-sider .ant-menu-item-selected')).toHaveCSS(
    'background-color',
    'rgba(0, 0, 0, 0.04)',
  );
  const metrics = await page.evaluate(() =>
    Object.fromEntries(
      [
        '.ant-pro-global-header',
        '.ant-pro-sider',
        '.kaiwu-content-frame',
        '.ant-page-header-heading-title',
        '.ant-card-head',
        '.ant-card',
      ].map((selector) => {
        const node = document.querySelector(selector)!;
        const css = getComputedStyle(node);
        return [
          selector,
          {
            fontSize: css.fontSize,
            height: css.height,
            width: css.width,
            padding: css.padding,
            borderRadius: css.borderRadius,
          },
        ];
      }),
    ),
  );
  const evidence = path.resolve('docs/verification/pro-content-gutters');
  fs.mkdirSync(evidence, { recursive: true });
  fs.writeFileSync(
    path.join(evidence, 'layout-measurements.json'),
    JSON.stringify(metrics, null, 2),
  );
  await page.screenshot({
    animations: 'disabled',
    path: path.join(evidence, 'system-home-1440.png'),
    fullPage: true,
  });
});

test('项目管理页签与搜索框在侧栏和工具栏变宽变窄时保持稳定', async ({ page }) => {
  await mockPlatform(page);
  await page.goto('/projects');
  await expect(page.getByRole('row').filter({ hasText: 'demo-project' })).toBeVisible();
  const tabs = page.locator('.kaiwu-table-tabs');
  const input = page.locator('.kaiwu-table-search input');
  await page.evaluate(() => document.fonts.ready);

  const stable = async () => {
    // A settled layout must stay still across frames; comparing two screenshots can miss an alternating width.
    const positions = await input.evaluate(async (node) => {
      // Wait for the responsive layout and input's width transition before measuring idle frames.
      for (let i = 0; i < 2; i++) await new Promise(requestAnimationFrame);
      await Promise.allSettled(
        document
          .getAnimations()
          .filter((animation) => animation instanceof CSSTransition)
          .map((animation) => animation.finished),
      );
      const samples = new Set<string>();
      for (let frame = 0; frame < 54; frame++) {
        await new Promise<void>((done) => requestAnimationFrame(() => done()));
        const { x, y, width } = node.getBoundingClientRect();
        samples.add([x, y, width].map(Math.round).join(','));
      }
      return [...samples];
    });
    expect(positions, `viewport ${page.viewportSize()?.width}`).toHaveLength(1);
    return positions[0];
  };

  for (const width of [1440, 1280, 1024, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await stable();
    await expect(input).toBeInViewport();
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  const desktopPosition = await stable();
  await tabs.getByRole('tab').last().click();
  expect(await stable()).toBe(desktopPosition);
  await input.fill('demo');
  await input.press('Enter');
  await expect(input).toBeFocused();
  expect(await stable()).toBe(desktopPosition);
  await input.fill('');
  expect(await stable()).toBe(desktopPosition);
});
