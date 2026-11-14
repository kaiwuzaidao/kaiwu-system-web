import usePlatformUiPreference from '@/hooks/usePlatformUiPreferences';
import {
  ApiOutlined,
  ArrowRightOutlined,
  BellOutlined,
  CheckCircleFilled,
  DatabaseOutlined,
  ExclamationCircleFilled,
  FileTextOutlined,
  LoadingOutlined,
  LoginOutlined,
  PlayCircleOutlined,
  ReloadOutlined,
  PlusOutlined,
  RocketOutlined,
  SearchOutlined,
} from '@ant-design/icons';
import { PageContainer } from '@ant-design/pro-components';
import { history, useIntl } from '@umijs/max';
import { Alert, App, Button, Card, Col, Empty, Input, Row, Space, Spin, Typography } from 'antd';
import { useCallback, useEffect, useMemo, useState } from 'react';
import ProjectEntryCard from '@/components/ProjectEntryCard';
import { queryAiProvider, type AiProviderConfig } from '@/services/ai';
import { queryCurrentUser, type CurrentUser } from '@/services/auth';
import { queryNotificationSummary, type NotificationSummary } from '@/services/notifications';
import { queryProjectGenerations, type ProjectGeneration } from '@/services/projectFactory';
import { queryCurrentProjects, type PlatformProject } from '@/services/projects';
import { queryTodoSummary, type TodoSummary } from '@/services/todos';
import { safeInternalPath } from '@/utils/navigation';
import { useLocaleFormatters } from '@/utils/format';
import { openProjectEntry, projectWorkspacePath, readProjectOpenMode } from '@/utils/projectEntry';
import AuthButton from '@/components/AuthButton';
import DictTag from '@/components/DictTag';
import LineIcon from '@/components/LineIcon';
import { kaiwuPalette } from '@/theme/tokens';

function greetingKey(): string {
  const h = new Date().getHours();
  if (h < 6) return 'home.greeting.lateNight';
  if (h < 12) return 'home.greeting.morning';
  if (h < 14) return 'home.greeting.noon';
  if (h < 18) return 'home.greeting.afternoon';
  return 'home.greeting.evening';
}

/** 待办条目：只有真正需要处理时才产生，无事发生时列表为空。 */
type TodoItem = {
  key: string;
  tone: 'error' | 'warning' | 'processing';
  icon: React.ReactNode;
  title: string;
  desc: string;
  actionText: string;
  onAction: () => void;
};

/** 单个查询失败不影响整页，降级为 undefined。 */
async function safe<T>(enabled: boolean, fn: () => Promise<T>) {
  if (!enabled) return undefined;
  try {
    return await fn();
  } catch {
    return undefined;
  }
}

export default function HomePage() {
  const pollSeconds = usePlatformUiPreference('platform.home.poll_seconds');
  const { message } = App.useApp();
  const intl = useIntl();
  const format = useLocaleFormatters();
  const [user, setUser] = useState<CurrentUser>();
  const [projects, setProjects] = useState<PlatformProject[]>([]);
  const [generations, setGenerations] = useState<ProjectGeneration[]>([]);
  const [ai, setAi] = useState<AiProviderConfig>();
  const [inbox, setInbox] = useState<NotificationSummary>();
  const [businessTodos, setBusinessTodos] = useState<TodoSummary>();
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [keyword, setKeyword] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(undefined);
    try {
      const currentUser = await queryCurrentUser();
      setUser(currentUser);
      const can = (code: string) => currentUser.permissions.includes(code);
      const [projectRows, generationRows, aiConfig, summary, todoSummary] = await Promise.all([
        queryCurrentProjects(),
        safe(can('system:project-factory:list'), queryProjectGenerations),
        safe(can('system:ai:list'), queryAiProvider),
        // 收件箱是每个登录用户自己的，不需要权限码。
        safe(true, queryNotificationSummary),
        // 业务项目投递的待办同样是用户自己的；取不到时只是不显示，不影响工作台其余内容。
        safe(true, queryTodoSummary),
      ]);
      setProjects(projectRows);
      setGenerations(generationRows ?? []);
      setAi(aiConfig);
      setInbox(summary);
      setBusinessTodos(todoSummary);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : intl.formatMessage({ id: 'home.request.failed' }),
      );
    } finally {
      setLoading(false);
    }
  }, [intl]);

  useEffect(() => {
    void load();
  }, [load]);

  // 有任务在跑时自动刷新，让工作台的进行中状态是活的。
  const hasRunning = generations.some((task) => ['PENDING', 'RUNNING'].includes(task.status));
  useEffect(() => {
    if (!hasRunning) return undefined;
    const timer = window.setInterval(() => void load(), pollSeconds * 1000);
    return () => window.clearInterval(timer);
  }, [hasRunning, load, pollSeconds]);

  const permissions = user?.permissions ?? [];
  const can = (code: string) => permissions.includes(code);
  const businessProjects = projects.filter((project) => project.projectCode !== 'system');
  const canStartFirstProject =
    can('system:project:create') && can('system:project-factory:generate');

  const todos = useMemo<TodoItem[]>(() => {
    const items: TodoItem[] = [];

    // 业务项目投递的待办排在最前面：它们是真正需要某个人处理的事；已逾期的置顶（排序稳定，其余保持服务端顺序）。
    const projectNames = new Map(
      projects.map((project) => [project.projectCode, project.projectName]),
    );
    [...(businessTodos?.recent ?? [])]
      .sort((a, b) => Number(b.overdue) - Number(a.overdue))
      .forEach((todo) => {
        const due = todo.overdue
          ? intl.formatMessage({ id: 'home.todo.overdue' })
          : todo.dueAt
            ? intl.formatMessage({ id: 'home.todo.dueAt' }, { time: format.dateTime(todo.dueAt) })
            : undefined;
        items.push({
          key: `todo-${todo.id}`,
          tone: todo.overdue ? 'error' : 'processing',
          icon: <LineIcon name="clipboard" />,
          title: todo.title,
          desc: [due, projectNames.get(todo.projectCode) ?? todo.projectCode, todo.content]
            .filter(Boolean)
            .join(' · '),
          actionText: intl.formatMessage({ id: 'home.todo.handle' }),
          // 链接由业务服务提供，经安全校验后才跳转；缺失或不合法时进入该项目的后台入口。
          onAction: () =>
            history.push(safeInternalPath(todo.linkUrl) ?? projectWorkspacePath(todo.projectId)),
        });
      });

    if (inbox && inbox.unreadCount > 0) {
      items.push({
        key: 'unread-notifications',
        tone: 'processing',
        icon: <BellOutlined />,
        title: intl.formatMessage({ id: 'home.todo.unread.title' }, { count: inbox.unreadCount }),
        desc: inbox.recent[0]?.title
          ? intl.formatMessage({ id: 'home.todo.unread.latest' }, { title: inbox.recent[0].title })
          : intl.formatMessage({ id: 'home.todo.unread.default' }),
        actionText: intl.formatMessage({ id: 'home.todo.view' }),
        onAction: () => history.push('/notifications'),
      });
    }

    generations
      .filter((task) => task.status === 'FAILED')
      .forEach((task) => {
        items.push({
          key: `gen-failed-${task.taskNo}`,
          tone: 'error',
          icon: <ExclamationCircleFilled />,
          title: intl.formatMessage(
            { id: 'home.todo.generationFailed' },
            { project: task.projectName },
          ),
          desc: task.lastError || intl.formatMessage({ id: 'home.todo.generationFailedDesc' }),
          actionText: intl.formatMessage({ id: 'home.todo.handle' }),
          onAction: () => history.push('/project-factory'),
        });
      });

    generations
      .filter((task) => ['PENDING', 'RUNNING'].includes(task.status))
      .forEach((task) => {
        items.push({
          key: `gen-running-${task.taskNo}`,
          tone: 'processing',
          icon: <LoadingOutlined />,
          title: intl.formatMessage({ id: 'home.todo.generating' }, { project: task.projectName }),
          desc: intl.formatMessage({ id: 'home.todo.generatingDesc' }),
          actionText: intl.formatMessage({ id: 'home.todo.open' }),
          onAction: () => history.push('/project-factory'),
        });
      });

    if (ai && (!ai.apiKeyConfigured || ai.lastTestStatus === 'FAILED')) {
      items.push({
        key: 'ai-not-ready',
        tone: 'warning',
        icon: <ApiOutlined />,
        title: intl.formatMessage({ id: 'home.todo.aiNotReady' }),
        desc: !ai.apiKeyConfigured
          ? intl.formatMessage({ id: 'home.todo.aiNoKey' })
          : ai.lastTestMessage || intl.formatMessage({ id: 'home.todo.lastTestFailed' }),
        actionText: intl.formatMessage({ id: 'home.todo.configure' }),
        onAction: () => history.push('/ai-provider'),
      });
    }

    return items;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [generations, ai, permissions, inbox, businessTodos, projects, intl]);

  // 概览只带最近若干条，真实总数可能更大：数字用总数，列表末尾提示还有多少未显示。
  const extraTodos = Math.max(
    0,
    (businessTodos?.openCount ?? 0) - (businessTodos?.recent.length ?? 0),
  );
  const todoCount = todos.length + extraTodos;

  const filtered = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    if (!kw) return projects;
    return projects.filter(
      (project) =>
        project.projectName.toLowerCase().includes(kw) ||
        project.projectCode.toLowerCase().includes(kw),
    );
  }, [projects, keyword]);

  const enter = (project: PlatformProject) => {
    // 内置 system 就是当前平台，进入其管理页而不是原地打转。
    if (project.projectCode === 'system') {
      history.push('/projects');
      return;
    }
    if (project.backendUrl) {
      openProjectEntry(project.id, readProjectOpenMode());
      return;
    }
    void message.info(intl.formatMessage({ id: 'home.projects.noEntryMessage' }));
  };

  return (
    <PageContainer
      className="kaiwu-home"
      title={intl.formatMessage({ id: 'menu.system.home' })}
      style={{ background: 'transparent' }}
    >
      <div className="kaiwu-home-heading">
        <div>
          <h1>
            {intl.formatMessage(
              { id: 'home.greeting.user' },
              {
                greeting: intl.formatMessage({ id: greetingKey() }),
                name: user?.displayName ?? intl.formatMessage({ id: 'home.defaultUser' }),
              },
            )}
          </h1>
          <p>
            {todoCount > 0
              ? intl.formatMessage({ id: 'home.summary.pending' }, { count: todoCount })
              : intl.formatMessage({ id: 'home.summary.clear' })}
          </p>
        </div>
        <Space>
          <Button onClick={() => history.push('/projects')}>
            {intl.formatMessage({ id: 'projects.title' })}
            <ArrowRightOutlined />
          </Button>
          <AuthButton
            permission="system:project:create"
            permissions={permissions}
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => history.push('/project-onboarding')}
          >
            {intl.formatMessage({ id: 'projects.open' })}
          </AuthButton>
          <Button
            type="text"
            aria-label={intl.formatMessage({ id: 'home.refresh' })}
            icon={<ReloadOutlined />}
            loading={loading}
            onClick={() => void load()}
          />
        </Space>
      </div>

      {error && (
        <Alert
          type="error"
          showIcon
          message={intl.formatMessage({ id: 'home.load.failed' })}
          description={error}
          style={{ marginBottom: 16 }}
        />
      )}

      {!loading && businessProjects.length === 0 && canStartFirstProject && (
        <FirstProjectGuide aiReady={Boolean(ai?.apiKeyConfigured)} />
      )}

      {/* 概览只使用现有数据；连通测试结果不代表实时服务状态。 */}
      <div className="kaiwu-home-overview">
        <div className="kaiwu-home-stats">
          <Card className="kaiwu-stat-card">
            <span className="kaiwu-stat-label">
              {intl.formatMessage({ id: 'home.projects.title' })}
            </span>
            <LineIcon name="grid" className="kaiwu-stat-icon" />
            <strong>{loading || error ? '—' : String(projects.length).padStart(2, '0')}</strong>
            <span>{intl.formatMessage({ id: 'projects.title' })}</span>
          </Card>
          <Card className="kaiwu-stat-card">
            <span className="kaiwu-stat-label">
              {intl.formatMessage({ id: 'home.stat.ai.title' })}
            </span>
            <LineIcon name="activity" className="kaiwu-stat-icon" />
            <strong className="kaiwu-stat-state">
              {ai
                ? intl.formatMessage({
                    id: ai.apiKeyConfigured ? 'ai.configured' : 'ai.notConfigured',
                  })
                : '—'}
            </strong>
            <span>
              {ai?.model ?? '—'}
              {ai?.lastTestStatus && (
                <>
                  {' '}
                  · {intl.formatMessage({ id: 'dictType.ai.test.status' })}{' '}
                  <DictTag dictCode="ai.test.status" value={ai.lastTestStatus} />
                </>
              )}
            </span>
          </Card>
        </div>
        <Card
          className="kaiwu-home-todos"
          title={
            <SectionTitle
              title={intl.formatMessage({ id: 'home.todo.heading' })}
              desc={intl.formatMessage({ id: 'home.todo.desc' })}
            />
          }
          extra={
            todoCount > 0 ? (
              <span className="kaiwu-dot-tag ant-tag ant-tag-warning">
                {intl.formatMessage({ id: 'home.todo.countTag' }, { count: todoCount })}
              </span>
            ) : undefined
          }
        >
          {todos.length === 0 ? (
            <div className="kaiwu-todo-empty">
              <CheckCircleFilled />
              {intl.formatMessage({ id: 'home.todo.empty' })}
            </div>
          ) : (
            <>
              {/* 业务待办可能很多：列表在卡片内滚动，不把左侧状态卡撑高。 */}
              <div className="kaiwu-home-todo-list">
                <Row gutter={[0, 12]}>
                  {todos.map((todo) => (
                    <Col xs={24} key={todo.key}>
                      <TodoCard todo={todo} />
                    </Col>
                  ))}
                </Row>
              </div>
              {extraTodos > 0 && (
                <Typography.Text type="secondary" className="kaiwu-home-todo-more">
                  {intl.formatMessage({ id: 'home.todo.more' }, { count: extraTodos })}
                </Typography.Text>
              )}
            </>
          )}
        </Card>
      </div>

      <Card
        title={
          <SectionTitle
            title={intl.formatMessage({ id: 'home.projects.heading' })}
            count={projects.length > 0 ? projects.length : undefined}
            desc={intl.formatMessage({ id: 'home.projects.desc' })}
          />
        }
        extra={
          projects.length > 6 ? (
            <Input
              allowClear
              prefix={<SearchOutlined style={{ color: kaiwuPalette.textPlaceholder }} />}
              placeholder={intl.formatMessage({ id: 'home.projects.search' })}
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              style={{ width: 220 }}
            />
          ) : can('system:project:list') ? (
            <Button type="link" onClick={() => history.push('/projects')}>
              {intl.formatMessage({ id: 'home.projects.manageAll' })}
              <LineIcon name="arrow" size={12} />
            </Button>
          ) : undefined
        }
      >
        <Spin spinning={loading}>
          {!loading && filtered.length === 0 ? (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description={
                projects.length === 0
                  ? intl.formatMessage({ id: 'home.projects.empty' })
                  : intl.formatMessage({ id: 'home.projects.noMatch' })
              }
            />
          ) : (
            <Row gutter={[12, 12]}>
              {filtered.map((project) => (
                <Col xs={24} md={12} key={project.id}>
                  <ProjectEntryCard project={project} onEnter={() => enter(project)} />
                </Col>
              ))}
            </Row>
          )}
        </Spin>
      </Card>
    </PageContainer>
  );
}

/**
 * 首次使用只给出完成第一个可维护项目所需的最短路径。
 * 这里刻意不引入在线表单搭建或二次生成入口：Kaiwu 只负责交付第一版源码。
 */
function FirstProjectGuide({ aiReady }: { aiReady: boolean }) {
  const intl = useIntl();
  const steps = [
    {
      icon: <FileTextOutlined />,
      title: intl.formatMessage({ id: 'home.guide.scope.title' }),
      desc: intl.formatMessage({ id: 'home.guide.scope.desc' }),
    },
    {
      icon: <RocketOutlined />,
      title: intl.formatMessage({ id: 'home.guide.generate.title' }),
      desc: intl.formatMessage({ id: 'home.guide.generate.desc' }),
    },
    {
      icon: <DatabaseOutlined />,
      title: intl.formatMessage({ id: 'home.guide.deliver.title' }),
      desc: intl.formatMessage({ id: 'home.guide.deliver.desc' }),
    },
    {
      // 拿到两个仓库后最常卡住的一步：给出可以直接复制的一条命令（./kaiwu project-up）。
      icon: <PlayCircleOutlined />,
      title: intl.formatMessage({ id: 'home.guide.run.title' }),
      desc: intl.formatMessage({ id: 'home.guide.run.desc' }),
      command: intl.formatMessage({ id: 'home.guide.run.command' }),
    },
    {
      icon: <LoginOutlined />,
      title: intl.formatMessage({ id: 'home.guide.enter.title' }),
      desc: intl.formatMessage({ id: 'home.guide.enter.desc' }),
    },
  ];

  return (
    <Card
      title={intl.formatMessage({ id: 'home.guide.title' })}
      variant="borderless"
      style={{ marginBottom: 16 }}
      styles={{ header: { borderBottom: 'none', paddingBottom: 0 } }}
      extra={
        <Button
          type="primary"
          icon={<ArrowRightOutlined />}
          onClick={() => history.push('/project-onboarding')}
        >
          {intl.formatMessage({ id: 'home.guide.start' })}
        </Button>
      }
    >
      <Alert
        type="info"
        showIcon
        message={intl.formatMessage({ id: 'home.guide.alertTitle' })}
        description={intl.formatMessage({ id: 'home.guide.alertDescription' })}
        style={{ marginBottom: 16 }}
      />
      <Row gutter={[12, 12]}>
        {steps.map((step, index) => (
          <Col xs={24} md={12} xl={{ flex: '20%' }} key={step.title}>
            <div
              style={{
                display: 'flex',
                gap: 10,
                minHeight: 74,
                padding: '12px',
                border: '1px solid #f0f0f0',
                borderRadius: 8,
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 28,
                  height: 28,
                  borderRadius: '50%',
                  color: '#3B82F6',
                  background: kaiwuPalette.primarySoft,
                  flexShrink: 0,
                }}
              >
                {index + 1}
              </div>
              <div>
                <Space size={6}>
                  <span style={{ color: '#3B82F6' }}>{step.icon}</span>
                  <Typography.Text strong>{step.title}</Typography.Text>
                </Space>
                <Typography.Text
                  type="secondary"
                  style={{ display: 'block', marginTop: 4, fontSize: 12 }}
                >
                  {step.desc}
                </Typography.Text>
                {step.command && (
                  // 规范代码块：块级 + 浅灰底 + 等宽；行内 code 换行时会把边框断成两截。
                  <div
                    style={{
                      position: 'relative',
                      marginTop: 8,
                      padding: '8px 32px 8px 10px',
                      fontSize: 12,
                      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                      lineHeight: 1.6,
                      wordBreak: 'break-all',
                      background: '#fafafa',
                      border: '1px solid #f0f0f0',
                      borderRadius: 8,
                    }}
                  >
                    {step.command}
                    <Typography.Text
                      copyable={{ text: step.command }}
                      style={{ position: 'absolute', top: 6, right: 8 }}
                    />
                  </div>
                )}
              </div>
            </div>
          </Col>
        ))}
      </Row>
      <Typography.Text type="secondary" style={{ display: 'block', marginTop: 14, fontSize: 12 }}>
        {aiReady
          ? intl.formatMessage({ id: 'home.guide.aiReady' })
          : intl.formatMessage({ id: 'home.guide.aiOptional' })}
      </Typography.Text>
    </Card>
  );
}

function TodoCard({ todo }: { todo: TodoItem }) {
  // 失败与告警保留语义色，其余按设计稿用浅蓝。
  const toneMap = {
    error: { bg: '#fff0f1', fg: '#d44856' },
    warning: { bg: '#fff7ea', fg: '#b78032' },
    processing: { bg: '#e8f2ff', fg: '#2563eb' },
  } as const;
  const t = toneMap[todo.tone];
  return (
    <div className="kaiwu-todo-card">
      <div className="kaiwu-todo-card-icon" style={{ background: t.bg, color: t.fg }}>
        {todo.icon}
      </div>
      <div className="kaiwu-todo-card-copy">
        <strong>{todo.title}</strong>
        <Typography.Text type="secondary" ellipsis={{ tooltip: todo.desc }}>
          {todo.desc}
        </Typography.Text>
      </div>
      <Button type="link" size="small" onClick={todo.onAction}>
        {todo.actionText}
        <LineIcon name="arrow" size={12} />
      </Button>
    </div>
  );
}

/** 卡片标题区：标题、可选计数与一行说明，对应设计稿 section-title / section-sub。 */
function SectionTitle({ title, desc, count }: { title: string; desc: string; count?: number }) {
  return (
    <div className="kaiwu-section-title">
      <span>
        {title}
        {count !== undefined && <span className="kaiwu-section-count"> / {count}</span>}
      </span>
      <small>{desc}</small>
    </div>
  );
}
