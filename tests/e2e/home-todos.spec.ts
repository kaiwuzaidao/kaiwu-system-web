import { expect, test, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

type Todo = {
  id: string;
  projectId: string;
  projectCode: string;
  title: string;
  content?: string;
  linkUrl?: string;
  status: 'OPEN';
  dueAt?: string;
  overdue: boolean;
  openedAt: string;
};

const crm = {
  id: 'p-crm',
  projectCode: 'crm',
  projectName: '流程审批',
  status: 'ACTIVE',
  builtIn: false,
  backendUrl: '/apps/crm/',
};

function todo(id: string, extra: Partial<Todo> = {}): Todo {
  return {
    id,
    projectId: 'p-crm',
    projectCode: 'crm',
    title: `待审批 ${id}`,
    status: 'OPEN',
    overdue: false,
    openedAt: '2026-10-23T09:00:00',
    ...extra,
  };
}

/** 已登录会话 + 工作台所需的最小数据；文案取后端 schema 快照，与线上同源。 */
async function mockHome(
  page: Page,
  summary: { openCount: number; overdueCount: number; recent: Todo[] } | 'fail' | 'malformed',
  ai?: { apiKeyConfigured: boolean; model: string; lastTestStatus?: string },
  deepLinks?: { value: string; sourceScopeId?: string } | 'fail',
) {
  const messages: Record<string, string> = {};
  const schema = path.resolve(
    process.env.KAIWU_SERVICE_DIR ?? '../kaiwu-system-service',
    'sql/schema.sql',
  );
  for (const line of fs.readFileSync(schema, 'utf8').split('\n')) {
    const match = /^\s*\(\d{15,},\s*'([^']+)',\s*'((?:''|[^'])*)',\s*JSON_OBJECT/.exec(line);
    if (match) messages[match[1]] = match[2].replaceAll("''", "'");
  }
  const user = {
    id: '1789248125900000001',
    username: 'member',
    displayName: '项目成员',
    locale: 'zh-CN',
    agentAutoOpen: false,
    permissions: ai ? ['system:ai:list'] : [],
  };
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === '/api/current/todos/summary' && summary === 'fail') {
      await route.fulfill({ status: 500, json: { code: 500, data: null } });
      return;
    }
    if (url.pathname === '/api/current/projects/p-crm/configs' && deepLinks === 'fail') {
      await route.fulfill({ status: 503, json: { code: 503, data: null } });
      return;
    }
    let data: unknown = [];
    if (
      url.pathname === '/api/current/projects/p-crm/configs' &&
      deepLinks &&
      deepLinks !== 'fail'
    ) {
      data = [
        {
          key: 'workspace.deep-links',
          valueType: 'JSON',
          value: deepLinks.value,
          sourceScopeId: deepLinks.sourceScopeId ?? crm.id,
        },
      ];
    }
    if (url.pathname.endsWith('/i18n/catalog')) data = { locale: 'zh-CN', revision: 1, messages };
    if (url.pathname.endsWith('/i18n/locales'))
      data = [{ locale: 'zh-CN', label: '简体中文', selectable: true }];
    if (url.pathname === '/api/auth/refresh')
      data = { accessToken: 'fixture', expiresIn: 3600, user };
    if (url.pathname === '/api/auth/me') data = user;
    if (url.pathname === '/api/ai/provider') data = ai;
    if (url.pathname === '/api/current/projects') data = [crm];
    if (url.pathname === '/api/current/notifications/summary')
      data = { unreadCount: 0, recent: [] };
    if (url.pathname === '/api/current/todos/summary')
      data = summary === 'malformed' ? [] : summary;
    await route.fulfill({ json: { code: 0, data } });
  });
  await page.route('**/apps/crm/**', (route) =>
    route.fulfill({ contentType: 'text/html', body: '<title>crm</title>' }),
  );
}

test.describe('工作台合并业务待办', () => {
  test('点击受管待办加载已登记的业务子路由，保持项目上下文', async ({ page }) => {
    const route = '/workflow/tasks/42?tab=history';
    await mockHome(
      page,
      {
        openCount: 1,
        overdueCount: 0,
        recent: [
          todo('managed:42', { linkUrl: `/workspace/p-crm?route=${encodeURIComponent(route)}` }),
        ],
      },
      undefined,
      {
        value: JSON.stringify({
          version: 1,
          routes: [{ prefix: '/workflow/tasks', queryParameters: ['tab'] }],
        }),
      },
    );
    await page.goto('/');
    await page.locator('.kaiwu-todo-card').getByRole('button').click();
    await expect(page.locator('iframe')).toHaveAttribute(
      'src',
      /\/apps\/crm\/workflow\/tasks\/42\?tab=history&projectId=p-crm$/,
    );
    await expect(page).toHaveURL(/\/workspace\/p-crm\?route=/);
  });

  test('白名单不可用或恶意 route 时宿主回到已登记的项目首页', async ({ page }) => {
    await mockHome(page, { openCount: 0, overdueCount: 0, recent: [] }, undefined, {
      value: JSON.stringify({
        version: 1,
        routes: [{ prefix: '/workflow/tasks', queryParameters: [] }],
      }),
    });
    for (const search of [
      '?route=' + encodeURIComponent('//external.invalid/steal'),
      '?route=' + encodeURIComponent('/workflow/tasks/%2e%2e'),
      '?route=/workflow/tasks&route=/workflow/tasks/other',
      '?route=' + encodeURIComponent('/workflow/tasks-extra'),
    ]) {
      await page.goto('/workspace/p-crm' + search);
      await expect(page.locator('iframe')).toHaveAttribute(
        'src',
        /\/apps\/crm\/\?projectId=p-crm$/,
      );
    }
  });

  test('配置读取失败不阻断项目首页且不接受子路由', async ({ page }) => {
    await mockHome(page, { openCount: 0, overdueCount: 0, recent: [] }, undefined, 'fail');
    await page.goto('/workspace/p-crm?route=' + encodeURIComponent('/workflow/tasks/42'));
    await expect(page.locator('iframe')).toHaveAttribute('src', /\/apps\/crm\/\?projectId=p-crm$/);
  });

  test('模型已配置但测试失败时展示实际状态，不声称运行正常', async ({ page }) => {
    await mockHome(
      page,
      { openCount: 0, overdueCount: 0, recent: [] },
      {
        apiKeyConfigured: true,
        model: 'fixture-model',
        lastTestStatus: 'FAILED',
      },
    );
    await page.goto('/');
    const status = page.locator('.kaiwu-home-stats .kaiwu-stat-card').nth(1);
    await expect(status).toContainText('已配置');
    await expect(status).toContainText('失败');
    await expect(status).not.toContainText('运行正常');
  });
  test('业务待办排在最前，逾期置顶，显示来源项目与截止时间', async ({ page }) => {
    await mockHome(page, {
      openCount: 3,
      overdueCount: 1,
      recent: [
        todo('A', { dueAt: '2026-10-30T18:00:00', content: '请核对金额' }),
        todo('B', { overdue: true, dueAt: '2026-10-20T18:00:00' }),
        todo('C'),
      ],
    });
    await page.goto('/');

    const cards = page.locator('.kaiwu-home-todos .kaiwu-todo-card');
    await expect(cards).toHaveCount(3);
    // 逾期的 B 置顶，其余保持服务端顺序。
    await expect(cards.nth(0)).toContainText('待审批 B');
    await expect(cards.nth(0)).toContainText('已逾期');
    await expect(cards.nth(1)).toContainText('待审批 A');
    await expect(cards.nth(1)).toContainText('截止');
    await expect(cards.nth(1)).toContainText('请核对金额');
    // 来源项目显示的是项目名而不是编码。
    await expect(cards.nth(2)).toContainText('流程审批');
    await expect(page.getByText('有 3 项需要你处理')).toBeVisible();
  });

  test('待办总数大于概览条数时，数字取总数并提示还有多少未显示', async ({ page }) => {
    await mockHome(page, {
      openCount: 12,
      overdueCount: 0,
      recent: [todo('A'), todo('B'), todo('C')],
    });
    await page.goto('/');

    await expect(page.getByText('有 12 项需要你处理')).toBeVisible();
    await expect(page.getByText('还有 9 项未显示')).toBeVisible();
  });

  test('点击待办进入业务服务提供的链接；链接不安全时退回项目后台入口', async ({ page }) => {
    await mockHome(page, {
      openCount: 2,
      overdueCount: 0,
      recent: [
        todo('SAFE', { linkUrl: '/workspace/p-crm' }),
        todo('EVIL', { linkUrl: '//evil.example.com/steal' }),
      ],
    });
    await page.goto('/');
    await page.locator('.kaiwu-todo-card', { hasText: '待审批 EVIL' }).getByRole('button').click();
    // 不安全的外部链接被拒绝，改为进入来源项目的后台入口，而不是跳到外站。
    await expect(page).toHaveURL(/\/workspace\/p-crm$/);

    await page.goto('/');
    await page.locator('.kaiwu-todo-card', { hasText: '待审批 SAFE' }).getByRole('button').click();
    await expect(page).toHaveURL(/\/workspace\/p-crm$/);
  });

  test('待办接口返回非预期结构时工作台不崩，按没有待办处理', async ({ page }) => {
    await mockHome(page, 'malformed');
    await page.goto('/');

    await expect(page.locator('.kaiwu-home').getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByText('没有需要处理的事项')).toBeVisible();
  });

  test('待办接口失败时工作台其余内容照常显示', async ({ page }) => {
    await mockHome(page, 'fail');
    await page.goto('/');

    await expect(page.locator('.kaiwu-home').getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.locator('.kaiwu-home-todos .kaiwu-todo-card')).toHaveCount(0);
    await expect(page.getByText('没有需要处理的事项')).toBeVisible();
  });
});
