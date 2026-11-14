import { expect, test, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const token = 't'.repeat(43);
const actionId = '05321246-e62a-46ca-bd9e-4f03a3dfbdc8';
const projectId = '1789248125900000001';

async function setup(
  page: Page,
  options: {
    expired?: boolean;
    dropped?: boolean;
    forbidden?: boolean;
    inputForm?: boolean;
    remoteForm?: boolean;
    advancedControls?: boolean;
    readFormResult?: boolean;
    outputView?: boolean;
    projectDictionaryCard?: boolean;
    navigation?: boolean;
    formCapabilityCode?: string;
    previewFailure?: boolean;
    localAction?: boolean;
    userCreateAction?: boolean;
    strongLocalAction?: boolean;
    canGenerate?: boolean;
  } = {},
) {
  const user = {
    id: '1',
    username: 'admin',
    displayName: '动作测试管理员',
    locale: 'zh-CN',
    mustChangePassword: false,
    permissions: [
      'system:agent:ask',
      'system:project:create',
      'system:project:list',
      'system:dict:save',
      'system:user:create',
      'system:user:status',
      ...(options.canGenerate ? ['system:project-factory:generate'] : []),
    ],
  };
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
  const action = {
    actionId,
    capabilityCode: options.strongLocalAction
      ? 'system.user.status.update'
      : options.userCreateAction
        ? 'system.user.create'
        : options.localAction
          ? 'system.dict-type.create'
          : 'system.project.create',
    version: '1',
    status: 'PENDING',
    project:
      options.localAction || options.userCreateAction || options.strongLocalAction
        ? undefined
        : {
            projectCode: 'orders',
            projectName: '订单管理',
            packageName: 'com.kaiwu.business.orders',
            description: '订单与配送',
          },
    permission: options.strongLocalAction
      ? 'system:user:status'
      : options.userCreateAction
        ? 'system:user:create'
        : options.localAction
          ? 'system:dict:save'
          : 'system:project:create',
    previewFields: options.strongLocalAction
      ? { targetUserId: '35', username: 'alice', currentStatus: 'ENABLED', status: 'DISABLED' }
      : options.userCreateAction
        ? { username: 'new.user', displayName: '新用户' }
        : options.localAction
          ? { dictCode: 'agent_example', dictName: '示例字典' }
          : undefined,
    ...(options.strongLocalAction
      ? { confirmationMode: 'STRONG', confirmationPhrase: '停用 alice' }
      : {}),
    expiresAt: new Date(Date.now() + (options.expired ? -1000 : 300000)).toISOString(),
  };
  const state = {
    confirms: [] as unknown[],
    cancels: 0,
    reads: 0,
    asks: [] as unknown[],
    status: 'PENDING',
    denyList: false,
    listQueries: [] as string[],
    dictRequests: [] as string[],
  };
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    let data: unknown = [];
    let status = 200;
    if (url.pathname.endsWith('/i18n/catalog')) data = { locale: 'zh-CN', revision: 49, messages };
    if (url.pathname.endsWith('/i18n/locales'))
      data = [{ locale: 'zh-CN', label: '简体中文', selectable: true }];
    if (url.pathname === '/api/auth/me') data = user;
    if (url.pathname === '/api/auth/refresh')
      data = { accessToken: 'e2e-access', expiresIn: 3600, user };
    if (url.pathname === '/api/auth/menus')
      data = [{ id: 'projects', name: '项目管理', type: 'MENU', path: '/projects', children: [] }];
    if (url.pathname === '/api/current/projects')
      data = [{ id: projectId, projectCode: 'crm', projectName: '客户' }];
    if (url.pathname === `/api/current/projects/${projectId}/dicts/common.boolean_enabled`) {
      state.dictRequests.push(url.pathname);
      data = {
        code: 'common.boolean_enabled',
        items: [
          { id: '1', itemValue: 'false', itemLabel: '项目选项', sortNo: 1, status: 'ENABLED' },
        ],
      };
    }
    if (url.pathname === '/api/projects') {
      state.listQueries.push(url.search);
      if (state.denyList) status = 403;
      data = {
        current: 1,
        size: 20,
        total: state.status === 'SUCCEEDED' ? 1 : 0,
        records:
          state.status === 'SUCCEEDED'
            ? [
                {
                  ...action.project,
                  id: projectId,
                  status: 'ACTIVE',
                  builtIn: false,
                  createdBy: '1',
                },
              ]
            : [],
      };
    }
    if (url.pathname.endsWith('/messages') && request.method() === 'POST') {
      state.asks.push(request.postDataJSON());
      data =
        state.asks.length === 1
          ? { answer: '', cards: [], pendingAction: { ...action, confirmationToken: token } }
          : { answer: '请核对预览后点击确认创建项目按钮。', cards: [] };
      if (options.inputForm) {
        data =
          state.asks.length === 1
            ? {
                answer: '',
                cards: [],
                inputForm: {
                  capabilityCode: options.formCapabilityCode ?? 'system.project.create',
                  values: { projectName: '订单管理' },
                  definition: {
                    titleKey: 'agent.input.title',
                    permission: 'system:project:create',
                    fields: [
                      {
                        name: 'projectCode',
                        labelKey: 'agent.input.projectCode',
                        required: true,
                        maxLength: 64,
                        multiline: false,
                        format: 'slug',
                      },
                      {
                        name: 'projectName',
                        labelKey: 'agent.input.projectName',
                        required: true,
                        maxLength: 100,
                        multiline: false,
                        format: 'text',
                      },
                      {
                        name: 'packageName',
                        labelKey: 'agent.input.packageName',
                        required: false,
                        maxLength: 128,
                        multiline: false,
                        format: 'javaPackage',
                      },
                      {
                        name: 'description',
                        labelKey: 'agent.input.description',
                        required: false,
                        maxLength: 500,
                        multiline: true,
                        format: 'text',
                      },
                    ],
                  },
                },
              }
            : { answer: '', cards: [], pendingAction: { ...action, confirmationToken: token } };
        if (options.previewFailure && state.asks.length > 1) {
          status = 403;
        }
      }
    }
    if (
      options.remoteForm &&
      url.pathname.endsWith('/messages') &&
      request.method() === 'POST' &&
      state.asks.length === 1
    ) {
      data = {
        answer: '',
        cards: [],
        inputForm: {
          capabilityCode: 'crm.config.update',
          values: options.advancedControls
            ? { enabled: false, limit: 0, status: 'false', since: '2026-09-27T08:30:00' }
            : { enabled: false, limit: 0 },
          definition: {
            projectCode: 'crm',
            title: '调整客户配置',
            permission: 'config:config:update',
            fields: [
              ...(options.advancedControls
                ? [
                    {
                      name: 'status',
                      label: '记录状态',
                      type: 'ENUM',
                      required: true,
                      format: 'text',
                      multiline: false,
                      dictCode: 'common.boolean_enabled',
                      values: ['false', 'legacy'],
                    },
                    {
                      name: 'since',
                      label: '开始时间',
                      type: 'DATETIME',
                      required: true,
                      format: 'text',
                      multiline: false,
                    },
                  ]
                : []),
              {
                name: 'name',
                label: '配置名称',
                type: 'STRING',
                required: true,
                maxLength: 100,
                format: 'text',
                multiline: false,
              },
              {
                name: 'enabled',
                label: '是否启用',
                type: 'BOOL',
                required: true,
                format: 'text',
                multiline: false,
              },
              {
                name: 'limit',
                label: '次数上限',
                type: 'INT',
                required: true,
                min: 0,
                max: 100,
                format: 'text',
                multiline: false,
              },
            ],
          },
        },
      };
    }
    if (
      options.readFormResult &&
      url.pathname.endsWith('/messages') &&
      request.method() === 'POST' &&
      state.asks.length > 1
    ) {
      data = {
        answer: '只读配置查询成功',
        cards: options.outputView
          ? [
              {
                type: 'table',
                capabilityCode: 'another-project.config.detail',
                title: 'raw description',
                dataAt: '2026-09-27T07:36:00Z',
                rows: [
                  {
                    id: '1789248125900000001',
                    enabled: 1,
                    status: options.projectDictionaryCard ? 'false' : 'UNKNOWN',
                    occurAt: '2026-09-27T07:36:00Z',
                    hidden: 'not-displayed',
                    sourceProjectId: options.projectDictionaryCard ? projectId : 'private-source',
                  },
                  {
                    id: '1789248125900000002',
                    enabled: false,
                    status: 'UNKNOWN',
                    occurAt: 'invalid-time',
                  },
                  {
                    id: '1789248125900000003',
                    enabled: 'unrecognized',
                    status: null,
                    occurAt: null,
                  },
                ],
                outputView: {
                  title: '配置详情',
                  fields: [
                    { name: 'id', label: '配置编号', format: 'TEXT' },
                    { name: 'enabled', label: '是否启用', format: 'BOOLEAN_ENABLED' },
                    {
                      name: 'status',
                      label: '当前状态',
                      format: 'DICTIONARY',
                      dictCode: 'common.boolean_enabled',
                    },
                    { name: 'occurAt', label: '记录时间', format: 'DATETIME' },
                  ],
                },
              },
            ]
          : [],
      };
    }
    if (url.pathname === `/api/agent/actions/${actionId}/confirm`) {
      state.confirms.push(request.postDataJSON());
      if (options.forbidden) status = 403;
      else {
        state.status = 'SUCCEEDED';
        if (options.dropped) {
          await route.abort('failed');
          return;
        }
      }
      data = {
        ...action,
        status: state.status,
        projectId,
        ...(options.userCreateAction ? { oneTimeSecret: 'temporary-password-for-test' } : {}),
      };
    }
    if (url.pathname === `/api/agent/actions/${actionId}/cancel`) {
      state.cancels += 1;
      state.status = 'CANCELLED';
      data = { ...action, status: state.status };
    }
    if (url.pathname === `/api/agent/actions/${actionId}`) {
      state.reads += 1;
      data = {
        ...action,
        status: state.status,
        ...(state.status === 'SUCCEEDED' ? { projectId } : {}),
      };
    }
    if (url.pathname === '/api/agent/conversations')
      data =
        request.method() === 'POST'
          ? {
              id: '9000000000000000101',
              title: '测试会话',
              useMemory: true,
              updatedAt: new Date().toISOString(),
            }
          : { current: 1, size: 20, total: 0, records: [] };
    if (
      options.navigation &&
      url.pathname.endsWith('/messages') &&
      request.method() === 'POST' &&
      state.asks.length > 1
    ) {
      const input = request.postDataJSON().input;
      if (state.denyList) status = 403;
      const current = input?.values?.page ?? 1;
      const detail = input?.capabilityCode === 'another-project.config.detail';
      data = {
        answer: detail ? '详情查询成功' : '列表查询成功',
        cards: [
          {
            type: 'table',
            capabilityCode: detail
              ? 'another-project.config.detail'
              : 'another-project.config.list',
            title: detail ? '详情结果' : '分页列表',
            dataAt: '2026-09-27T00:00:00Z',
            rows: current > 1 ? [] : [{ id: projectId }],
            outputView: {
              title: detail ? '详情结果' : '分页列表',
              fields: [{ name: 'id', label: '编号', format: 'TEXT' }],
            },
            navigation: detail
              ? null
              : {
                  page: current,
                  previous:
                    current > 1
                      ? {
                          label: '分页列表',
                          capabilityCode: 'another-project.config.list',
                          values: { page: 1, pageSize: 1, keyword: '保留筛选' },
                        }
                      : null,
                  next:
                    current === 1
                      ? {
                          label: '分页列表',
                          capabilityCode: 'another-project.config.list',
                          values: { page: 2, pageSize: 1, keyword: '保留筛选' },
                        }
                      : null,
                  details:
                    current === 1
                      ? [
                          {
                            rowIndex: 0,
                            command: {
                              label: '查看详情',
                              capabilityCode: 'another-project.config.detail',
                              values: { configId: projectId },
                            },
                          },
                        ]
                      : [],
                },
          },
        ],
        usedCapabilities: [],
        correlationId: 'nav-test',
      };
    }
    if (url.pathname.endsWith('/messages') && request.method() === 'POST')
      data = { messageId: '9000000000000000201', answer: data };
    await route.fulfill({
      status,
      contentType: 'application/json',
      body: JSON.stringify({
        code: status === 200 ? 0 : status,
        data,
        message: status === 403 ? '当前无权执行此操作，请重新发起' : 'ok',
      }),
    });
  });
  await page.goto('/projects');
  await page
    .locator('#root .kaiwu-header-actions')
    .getByRole('button', { name: 'AI 助手模式', exact: true })
    .click();
  await page
    .getByPlaceholder('向开物提问，或描述你要完成的任务…')
    .fill('创建订单管理项目，编码 orders，描述订单与配送');
  await page.getByRole('button', { name: /发\s*送/ }).click();
  // 右侧上下文栏会重复显示待确认操作的名称，断言限定在对话区。
  await expect(
    page
      .locator('.agent-dock-thread')
      .getByText(
        options.remoteForm
          ? '调整客户配置'
          : options.inputForm
            ? '补充项目信息'
            : options.localAction || options.userCreateAction || options.strongLocalAction
              ? '操作预览'
              : '创建项目预览',
        { exact: true },
      ),
  ).toBeVisible();
  return state;
}

test('本地字典写操作展示通用确认，不误用项目文案或跳转', async ({ page }) => {
  const state = await setup(page, { localAction: true });
  await expect(page.getByText('示例字典', { exact: true })).toBeVisible();
  await expect(
    page.getByText('此操作会修改平台数据，请核对下方内容。', { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText('将创建一个项目，并将当前用户设为该项目管理员。', { exact: true }),
  ).toHaveCount(0);
  await page.getByRole('button', { name: '确认执行', exact: true }).click();
  await expect(page.getByText('操作已完成', { exact: true })).toBeVisible();
  expect(state.confirms).toEqual([{ confirmationToken: token }]);
  await expect(page.getByRole('button', { name: '前往项目管理' })).toHaveCount(0);
});

test('停用平台用户必须输入预览中的确认短语', async ({ page }) => {
  const state = await setup(page, { strongLocalAction: true });
  const confirm = page.getByRole('button', { name: '确认执行', exact: true });
  await expect(confirm).toBeDisabled();
  await page.getByRole('textbox', { name: '输入确认语' }).fill('停用错误用户');
  await expect(confirm).toBeDisabled();
  await page.getByRole('textbox', { name: '输入确认语' }).fill('停用 alice');
  await expect(confirm).toBeEnabled();
  await confirm.click();
  expect(state.confirms).toEqual([{ confirmationToken: token, confirmationPhrase: '停用 alice' }]);
});

test('创建用户的初始密码只在首次确认响应显示，刷新状态后消失', async ({ page }) => {
  const state = await setup(page, { userCreateAction: true });
  await page.getByRole('button', { name: '确认执行', exact: true }).click();
  await expect(page.getByText('一次性初始密码', { exact: true })).toBeVisible();
  await expect(page.getByText('temporary-password-for-test', { exact: true })).toBeVisible();
  expect(state.confirms).toEqual([{ confirmationToken: token }]);
  const storage = await page.evaluate(() =>
    JSON.stringify([Object.entries(localStorage), Object.entries(sessionStorage)]),
  );
  expect(storage).not.toContain('temporary-password-for-test');
  await page.getByRole('button', { name: '查询操作状态', exact: true }).click();
  await expect(page.getByText('temporary-password-for-test', { exact: true })).toHaveCount(0);
});

test('显式确认后在聊天内查看项目列表和详情，不跳转页面', async ({ page }) => {
  const state = await setup(page);
  await expect(page.getByText('com.kaiwu.business.orders', { exact: true })).toBeVisible();
  await expect(
    page.getByText('将创建一个项目，并将当前用户设为该项目管理员。', { exact: true }),
  ).toBeVisible();
  expect(state.confirms).toHaveLength(0);
  await page.getByRole('button', { name: '确认创建项目', exact: true }).dblclick();
  await expect(
    page.getByText('项目已创建，可在聊天中查看项目列表和详情。', { exact: true }),
  ).toBeVisible();
  expect(state.confirms).toEqual([{ confirmationToken: token }]);
  await expect(page.getByRole('button', { name: '确认创建项目', exact: true })).toHaveCount(0);
  const storage = await page.evaluate(() =>
    JSON.stringify([Object.entries(localStorage), Object.entries(sessionStorage)]),
  );
  expect(storage).not.toContain(token);
  await page.getByRole('button', { name: '查看项目列表', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page).toHaveURL(/\/projects$/);
  await expect(page.getByRole('dialog').getByRole('button', { name: /订单管理/ })).toHaveCount(2);
  await page
    .getByRole('dialog')
    .getByRole('button', { name: /订单管理/ })
    .last()
    .click();
  await expect(page.getByRole('dialog').getByText('订单与配送', { exact: true })).toHaveCount(2);
  expect(page.context().pages()).toHaveLength(1);
});

test('聊天中回复确认只发送提问，凭证不进入历史；取消后不能创建', async ({ page }) => {
  const state = await setup(page);
  await page.getByPlaceholder('向开物提问，或描述你要完成的任务…').fill('确认');
  await page.getByRole('button', { name: /发\s*送/ }).click();
  await expect(page.getByText('请核对预览后点击确认创建项目按钮。', { exact: true })).toBeVisible();
  expect(JSON.stringify(state.asks)).not.toContain(token);
  expect(state.confirms).toHaveLength(0);
  await page.getByRole('button', { name: '取消此操作', exact: true }).click();
  await expect(page.getByText('已取消', { exact: true })).toBeVisible();
  expect(state.cancels).toBe(1);
  await expect(page.getByRole('button', { name: '确认创建项目', exact: true })).toHaveCount(0);
});

test('确认响应丢失后只查询状态恢复成功，不重发创建', async ({ page }) => {
  const state = await setup(page, { dropped: true });
  await page.getByRole('button', { name: '确认创建项目', exact: true }).click();
  await expect(page.getByText('结果待核验', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '查询操作状态', exact: true }).click();
  await expect(
    page.getByText('项目已创建，可在聊天中查看项目列表和详情。', { exact: true }),
  ).toBeVisible();
  expect(state.confirms).toHaveLength(1);
  expect(state.reads).toBe(1);
});

test('过期预览不能创建', async ({ page }) => {
  const state = await setup(page, { expired: true });
  await expect(page.getByText('预览已过期，请重新提问生成新预览。', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '确认创建项目', exact: true })).toHaveCount(0);
  expect(state.confirms).toHaveLength(0);
});

test('权限被撤销时显示拒绝原因，查询未执行状态也不恢复确认凭证', async ({ page }) => {
  const state = await setup(page, { forbidden: true });
  await page.getByRole('button', { name: '确认创建项目', exact: true }).click();
  await expect(page.getByText('当前无权执行此操作，请重新发起', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '查询操作状态', exact: true }).click();
  await expect(page.getByRole('button', { name: '确认创建项目', exact: true })).toBeDisabled();
  expect(state.confirms).toHaveLength(1);
});

test('退出登录清空会话内预览', async ({ page }) => {
  const state = await setup(page);
  await page.locator('.agent-dock-exit').click();
  await page.locator('.kaiwu-desktop-header .kaiwu-user-menu').click();
  await page.getByText('退出登录', { exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByText('创建项目预览', { exact: true })).toHaveCount(0);
  expect(state.confirms).toHaveLength(0);
});

test('缺参展示中文表单，校验并保留回填，提交只生成预览', async ({ page }, testInfo) => {
  const state = await setup(page, { inputForm: true });
  await expect(page.getByLabel('项目名称', { exact: true })).toHaveValue('订单管理');
  await page.screenshot({ path: testInfo.outputPath('input-card.png') });
  await page.getByRole('button', { name: '生成预览', exact: true }).click();
  await expect(page.getByText('请填写此项', { exact: true })).toBeVisible();
  expect(state.asks).toHaveLength(1);
  await page.getByLabel('项目编码', { exact: true }).fill('BAD CODE');
  await page.getByRole('button', { name: '生成预览', exact: true }).click();
  await expect(
    page.getByText('使用 2–64 位小写字母、数字或连字符，以字母开头', { exact: true }),
  ).toBeVisible();
  expect(state.asks).toHaveLength(1);
  await page.getByLabel('项目编码', { exact: true }).fill('orders');
  await page.getByRole('button', { name: '生成预览', exact: true }).dblclick();
  // 待确认的预览卡片在右侧「待确认操作」里，对话里只留同名摘要。
  await expect(
    page.locator('.agent-shell-pending').getByText('创建项目预览', { exact: true }),
  ).toBeVisible();
  expect(state.asks).toHaveLength(2);
  expect(state.asks[1]).toMatchObject({
    input: {
      capabilityCode: 'system.project.create',
      values: { projectCode: 'orders', projectName: '订单管理' },
    },
  });
  expect(state.confirms).toHaveLength(0);
  await page.getByRole('button', { name: '确认创建项目', exact: true }).click();
  expect(state.confirms).toHaveLength(1);
});

test('表单提交被拒绝时保留填写内容，不调用创建且可以取消', async ({ page }) => {
  const state = await setup(page, { inputForm: true, previewFailure: true });
  await page.getByLabel('项目编码', { exact: true }).fill('orders');
  await page.getByRole('button', { name: '生成预览', exact: true }).click();
  await expect(page.getByText('当前无权执行此操作，请重新发起', { exact: true })).toBeVisible();
  await expect(page.getByLabel('项目编码', { exact: true })).toHaveValue('orders');
  expect(state.confirms).toHaveLength(0);
  await page.getByRole('button', { name: '取消填写', exact: true }).click();
  await expect(page.getByText('已取消填写，可重新提出操作请求。', { exact: true })).toBeVisible();
  expect(state.asks).toHaveLength(2);
});

test('取消创建后查看聊天内列表，支持搜索刷新且权限拒绝不泄露旧结果', async ({ page }) => {
  const state = await setup(page);
  await page.getByRole('button', { name: '取消此操作', exact: true }).click();
  await page.getByRole('button', { name: '查看项目列表', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(
    page.getByRole('dialog').getByText('暂无数据', { exact: true }).last(),
  ).toBeVisible();
  await page.locator('.agent-dock-thread').getByPlaceholder('搜索项目名称或编码').fill('orders');
  await page.locator('.agent-dock-thread').getByPlaceholder('搜索项目名称或编码').press('Enter');
  await expect
    .poll(() => state.listQueries.some((query) => query.includes('keyword=orders')))
    .toBe(true);
  state.denyList = true;
  await page
    .getByRole('dialog')
    .getByRole('button', { name: /^刷\s*新$/, exact: true })
    .click();
  await expect(
    page.getByRole('dialog').getByText('当前无权执行此操作，请重新发起', { exact: true }),
  ).toBeVisible();
  expect(state.confirms).toHaveLength(0);
  await expect(page).toHaveURL(/\/projects$/);
});

test('聊天内项目列表分页和详情不打开外部后台', async ({ page }, testInfo) => {
  await setup(page);
  const queries: string[] = [];
  await page.route('**/api/projects?**', async (route) => {
    const url = new URL(route.request().url());
    const current = Number(url.searchParams.get('current') ?? '1');
    queries.push(url.search);
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        code: 0,
        data: {
          current,
          size: 6,
          total: 7,
          records: [
            {
              id: '1789248125900000001',
              projectCode: current === 1 ? 'orders' : 'orders-next',
              projectName: current === 1 ? '订单首页' : '订单次页',
              status: 'ACTIVE',
              description: '列表内查看的项目说明',
              backendUrl: 'https://example.invalid/admin',
            },
          ],
        },
      }),
    });
  });
  await page.getByRole('button', { name: '查看项目列表', exact: true }).click();
  await expect(page.getByRole('dialog').getByRole('button', { name: /订单首页/ })).toBeVisible();
  await page.getByRole('dialog').getByTitle('2', { exact: true }).click();
  await expect(page.getByRole('dialog').getByRole('button', { name: /订单次页/ })).toBeVisible();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: /订单次页/ })
    .click();
  await expect(page.getByText('列表内查看的项目说明', { exact: true })).toBeVisible();
  expect(queries.some((query) => query.includes('current=2'))).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('inline-projects.png') });
  expect(page.context().pages()).toHaveLength(1);
  await expect(page).toHaveURL(/\/projects$/);
});

test('模型返回的项目卡片也在聊天内打开，不进入业务后台', async ({ page }) => {
  const state = await setup(page);
  await page.route('**/api/agent/conversations/*/messages', async (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        code: 0,
        data: {
          messageId: '9000000000000000202',
          answer: {
            answer: '',
            cards: [
              {
                type: 'table',
                capabilityCode: 'system.project.list',
                title: '项目',
                dataAt: new Date().toISOString(),
                rows: [
                  {
                    id: '1789248125900000001',
                    projectCode: 'chat-only-project-with-a-long-code-for-layout',
                    projectName: '查询卡片项目名称很长时仍然需要完整显示',
                    status: 'ACTIVE',
                    backendUrl: 'https://example.invalid/admin',
                  },
                ],
              },
            ],
          },
        },
      }),
    }),
  );
  await page.getByPlaceholder('向开物提问，或描述你要完成的任务…').fill('查询项目列表');
  await page.getByRole('button', { name: /发\s*送/ }).click();
  const projectCard = page.getByRole('button', { name: /查询卡片项目名称很长时仍然需要完整显示/ });
  await expect(projectCard).toBeVisible();
  await expect(projectCard).not.toContainText('打开后台');
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    const textFits = await projectCard.locator('.kaiwu-project-entry-copy').evaluate((element) => {
      const name = element.querySelector<HTMLElement>('.kaiwu-project-entry-name')!;
      const code = element.querySelector<HTMLElement>('.kaiwu-project-entry-code')!;
      return name.scrollWidth <= name.clientWidth && code.scrollWidth <= code.clientWidth;
    });
    expect(textFits).toBe(true);
  }
  await projectCard.click();
  await expect(
    page.locator('.agent-dock-thread').getByPlaceholder('搜索项目名称或编码'),
  ).toHaveValue('chat-only-project-with-a-long-code-for-layout');
  await expect
    .poll(() =>
      state.listQueries.some((query) =>
        query.includes('keyword=chat-only-project-with-a-long-code-for-layout'),
      ),
    )
    .toBe(true);
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page).toHaveURL(/\/projects$/);
  expect(page.context().pages()).toHaveLength(1);
});

test('同一表单渲染器支持另一能力码且提交不携带服务端定义', async ({ page }) => {
  const state = await setup(page, { inputForm: true, formCapabilityCode: 'system.example.create' });
  await page.getByLabel('项目编码', { exact: true }).fill('example');
  await page.getByRole('button', { name: '生成预览', exact: true }).click();
  // 待确认的预览卡片在右侧「待确认操作」里，对话里只留同名摘要。
  await expect(
    page.locator('.agent-shell-pending').getByText('创建项目预览', { exact: true }),
  ).toBeVisible();
  expect(state.asks[1]).toMatchObject({
    input: {
      capabilityCode: 'system.example.create',
      values: { projectCode: 'example', projectName: '订单管理' },
    },
  });
  expect((state.asks[1] as { input: object }).input).not.toHaveProperty('definition');
  expect(state.confirms).toHaveLength(0);
});

test('子项目表单使用目标项目授权并保留 false 与零值', async ({ page }) => {
  const state = await setup(page, { remoteForm: true });
  await page.getByLabel('配置名称', { exact: true }).fill('测试配置');
  const card = page.locator('.ant-card').filter({ hasText: '调整客户配置' });
  await expect(card.getByText('无权限操作', { exact: true })).toHaveCount(0);
  await card.getByRole('button', { name: /发\s*送/ }).click();
  await expect.poll(() => state.asks.length).toBe(2);
  expect(state.asks[1]).toMatchObject({
    input: {
      capabilityCode: 'crm.config.update',
      values: { name: '测试配置', enabled: false, limit: 0 },
    },
  });
  expect((state.asks[1] as { input: object }).input).not.toHaveProperty('definition');
  expect(state.confirms).toHaveLength(0);
});

test('子项目表单只读查询成功后显示结果，不要求操作预览', async ({ page }) => {
  const state = await setup(page, { remoteForm: true, readFormResult: true });
  await page.getByLabel('配置名称', { exact: true }).fill('测试配置');
  const card = page.locator('.ant-card').filter({ hasText: '调整客户配置' });
  await card.getByRole('button', { name: /发\s*送/ }).click();
  await expect(page.getByText('只读配置查询成功', { exact: true })).toBeVisible();
  await expect(page.getByLabel('配置名称', { exact: true })).toHaveCount(0);
  await expect(page.getByText('未能生成预览，请检查填写内容后重试。')).toHaveCount(0);
  expect(state.asks).toHaveLength(2);
  expect(state.confirms).toHaveLength(0);
});

test('通用声明展示中文字段和字典，保留长编号与未知值且不跳转', async ({ page }) => {
  const state = await setup(page, { remoteForm: true, readFormResult: true, outputView: true });
  const initialUrl = page.url();
  await page.getByLabel('配置名称', { exact: true }).fill('测试配置');
  await page
    .locator('.ant-card')
    .filter({ hasText: '调整客户配置' })
    .getByRole('button', { name: /发\s*送/ })
    .click();
  const result = page.locator('.agent-dock-card').filter({ hasText: '配置详情' });
  await expect(result.getByRole('columnheader')).toHaveText([
    '配置编号',
    '是否启用',
    '当前状态',
    '记录时间',
  ]);
  await expect(result.getByText('1789248125900000001', { exact: true })).toBeVisible();
  await expect(result.getByText('是', { exact: true })).toBeVisible();
  await expect(result.getByText('否', { exact: true })).toBeVisible();
  await expect(result.getByText('unrecognized', { exact: true })).toBeVisible();
  await expect(result.getByText('UNKNOWN', { exact: true })).toHaveCount(2);
  await expect(result.getByText('2026-09-27 07:36:00Z', { exact: true })).toBeVisible();
  await expect(result.getByText('invalid-time', { exact: true })).toBeVisible();
  await expect(result.getByText('not-displayed')).toHaveCount(0);
  await expect(result.getByText('private-source')).toHaveCount(0);
  expect(page.url()).toBe(initialUrl);
  expect(state.confirms).toHaveLength(0);
});

test('项目结果卡片按行来源读取字典', async ({ page }) => {
  const state = await setup(page, {
    remoteForm: true,
    readFormResult: true,
    outputView: true,
    projectDictionaryCard: true,
  });
  await page.getByLabel('配置名称', { exact: true }).fill('测试配置');
  await page
    .locator('.ant-card')
    .filter({ hasText: '调整客户配置' })
    .getByRole('button', { name: /发\s*送/ })
    .click();
  await expect(
    page.locator('.agent-dock-card').getByText('项目选项', { exact: true }),
  ).toBeVisible();
  expect(state.dictRequests).toContain(
    `/api/current/projects/${projectId}/dicts/common.boolean_enabled`,
  );
});

test('项目能力表单按项目读取字典', async ({ page }) => {
  const state = await setup(page, { remoteForm: true, advancedControls: true });
  await expect(page.getByText('项目选项', { exact: true }).last()).toBeVisible();
  expect(state.dictRequests).toContain(
    `/api/current/projects/${projectId}/dicts/common.boolean_enabled`,
  );
});

test('通用卡片分页保留筛选、空页可返回、详情在聊天执行且拒绝不伪装成功', async ({ page }) => {
  const state = await setup(page, { remoteForm: true, readFormResult: true, navigation: true });
  const initialUrl = page.url();
  await page.getByLabel('配置名称', { exact: true }).fill('测试配置');
  await page
    .locator('.ant-card')
    .filter({ hasText: '调整客户配置' })
    .getByRole('button', { name: /发\s*送/ })
    .click();
  const cards = page.locator('.agent-dock-card');
  await expect(cards.last().getByText('第 1 页')).toBeVisible();
  await cards.last().getByRole('button', { name: '下一页', exact: true }).dblclick();
  await expect(cards.last().getByText('第 2 页')).toBeVisible();
  expect(state.asks).toHaveLength(3);
  expect(state.asks[2]).toMatchObject({
    input: {
      capabilityCode: 'another-project.config.list',
      values: { page: 2, pageSize: 1, keyword: '保留筛选' },
    },
  });
  await expect(cards.last().getByRole('button', { name: '下一页', exact: true })).toBeDisabled();
  await cards.last().getByRole('button', { name: '上一页', exact: true }).click();
  await expect(cards.last().getByText('第 1 页')).toBeVisible();
  await cards.last().getByRole('button', { name: '查看详情', exact: true }).click();
  await expect(cards.last().getByText('详情结果', { exact: true })).toBeVisible();
  expect(state.asks[4]).toMatchObject({
    input: { capabilityCode: 'another-project.config.detail', values: { configId: projectId } },
  });
  state.denyList = true;
  await page.getByRole('button', { name: '查看详情', exact: true }).last().click();
  await expect(page.getByText('当前无权执行此操作，请重新发起', { exact: true })).toBeVisible();
  expect(page.url()).toBe(initialUrl);
  expect(page.context().pages()).toHaveLength(1);
  expect(state.confirms).toHaveLength(0);
});

test('通用枚举只展示批准候选值，日期按本地时间字符串提交且仍需写确认', async ({ page }) => {
  const state = await setup(page, { remoteForm: true, advancedControls: true });
  const card = page.locator('.ant-card').filter({ hasText: '调整客户配置' });
  await page.getByLabel('配置名称', { exact: true }).fill('筛选配置');
  await page.getByLabel('记录状态', { exact: true }).focus();
  await page.getByLabel('记录状态', { exact: true }).press('ArrowDown');
  await expect(page.locator('.ant-select-dropdown').getByText('否', { exact: true })).toBeVisible();
  await expect(page.locator('.ant-select-dropdown').getByText('是', { exact: true })).toHaveCount(
    0,
  );
  await page
    .locator('.ant-select-item-option-content')
    .filter({ hasText: /^legacy$/ })
    .click();
  await expect(page.getByLabel('开始时间', { exact: true })).toHaveValue('2026-09-27 08:30:00');
  await page.getByLabel('开始时间', { exact: true }).fill('2026-09-28 09:45:00');
  await page.getByLabel('开始时间', { exact: true }).press('Enter');
  await card.getByRole('button', { name: /发\s*送/ }).click();
  await expect.poll(() => state.asks.length).toBe(2);
  expect(state.asks[1]).toMatchObject({
    input: {
      values: {
        name: '筛选配置',
        enabled: false,
        limit: 0,
        status: 'legacy',
        since: '2026-09-28T09:45:00',
      },
    },
  });
  expect((state.asks[1] as { input: object }).input).not.toHaveProperty('definition');
  expect(state.confirms).toHaveLength(0);
});

test('聊天登记项目后一键进入开通向导继续生成，登记值预填且锁定', async ({ page }) => {
  await setup(page, { canGenerate: true });
  await page.getByRole('button', { name: '确认创建项目', exact: true }).click();
  await page.getByRole('button', { name: '继续生成第一版', exact: true }).click();
  await expect(page).toHaveURL(/\/project-onboarding\?from=agent&projectCode=orders/);
  const code = page.getByLabel('项目编码');
  await expect(code).toHaveValue('orders');
  await expect(code).toBeDisabled();
  await expect(page.getByLabel('项目名称')).toHaveValue('订单管理');
  await expect(page.getByLabel('Java 包名')).toHaveValue('com.kaiwu.business.orders');
});

test('没有生成权限时不显示继续生成入口', async ({ page }) => {
  await setup(page);
  await page.getByRole('button', { name: '确认创建项目', exact: true }).click();
  await expect(
    page.getByText('项目已创建，可在聊天中查看项目列表和详情。', { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: '继续生成第一版' })).toHaveCount(0);
});

test('打开项目列表后继续提问，新问题排在列表下面而不是插到它前面', async ({ page }) => {
  await setup(page);
  await page.getByRole('button', { name: '确认创建项目', exact: true }).click();
  await page.getByRole('button', { name: '查看项目列表', exact: true }).click();
  await expect(page.locator('.ant-card-head-title', { hasText: '查看项目列表' })).toBeVisible();
  await page.getByPlaceholder('向开物提问，或描述你要完成的任务…').fill('再问一个问题');
  await page.getByRole('button', { name: /发\s*送/ }).click();
  await expect(page.getByText('再问一个问题', { exact: true })).toBeVisible();
  const questionFollowsBrowser = await page.evaluate(() => {
    const browser = [...document.querySelectorAll('.ant-card-head-title')].find(
      (node) => node.textContent === '查看项目列表',
    );
    const question = [...document.querySelectorAll('.agent-dock-question')].find(
      (node) => node.textContent === '再问一个问题',
    );
    return Boolean(
      browser &&
      question &&
      browser.compareDocumentPosition(question) & Node.DOCUMENT_POSITION_FOLLOWING,
    );
  });
  expect(questionFollowsBrowser).toBe(true);
});

test('窄屏在对话中保留待确认操作，取消前没有写入', async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 800 });
  const state = await setup(page);
  await expect(page.locator('.agent-shell-inspector')).toBeHidden();
  await expect(page.getByRole('button', { name: '确认创建项目', exact: true })).toBeVisible();
  expect(state.confirms).toHaveLength(0);
  await page.getByRole('button', { name: '取消此操作', exact: true }).click();
  await expect(page.getByText('已取消', { exact: true })).toBeVisible();
  expect(state.confirms).toHaveLength(0);
  expect(state.cancels).toBe(1);
});
