import {
  ApiOutlined,
  ArrowRightOutlined,
  BellOutlined,
  CheckCircleFilled,
  CloudUploadOutlined,
  CrownFilled,
  DatabaseOutlined,
  ExclamationCircleFilled,
  FileTextOutlined,
  GitlabOutlined,
  LoadingOutlined,
  ReloadOutlined,
  RocketOutlined,
  SearchOutlined,
} from '@ant-design/icons';
import { PageContainer } from '@ant-design/pro-components';
import { history, useIntl } from '@umijs/max';
import {
  Alert,
  App,
  Button,
  Card,
  Col,
  Empty,
  Input,
  Row,
  Space,
  Spin,
  Tag,
  Typography,
} from 'antd';
import { useCallback, useEffect, useMemo, useState } from 'react';
import DictTag from '@/components/DictTag';
import { queryAiProvider, type AiProviderConfig } from '@/services/ai';
import { queryCurrentUser, type CurrentUser } from '@/services/auth';
import { queryGitlabConfig, type GitlabConfig } from '@/services/gitlab';
import { queryNotificationSummary, type NotificationSummary } from '@/services/notifications';
import { queryProjectGenerations, type ProjectGeneration } from '@/services/projectFactory';
import { queryCurrentProjects, type PlatformProject } from '@/services/projects';
import { openProjectEntry, readProjectOpenMode } from '@/utils/projectEntry';

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
  const { message } = App.useApp();
  const intl = useIntl();
  const [user, setUser] = useState<CurrentUser>();
  const [projects, setProjects] = useState<PlatformProject[]>([]);
  const [generations, setGenerations] = useState<ProjectGeneration[]>([]);
  const [ai, setAi] = useState<AiProviderConfig>();
  const [gitlab, setGitlab] = useState<GitlabConfig>();
  const [inbox, setInbox] = useState<NotificationSummary>();
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
      const [projectRows, generationRows, aiConfig, gitlabConfig, summary] = await Promise.all([
        queryCurrentProjects(),
        safe(can('system:project-factory:list'), queryProjectGenerations),
        safe(can('system:ai:list'), queryAiProvider),
        safe(can('system:git:list'), queryGitlabConfig),
        // 收件箱是每个登录用户自己的，不需要权限码。
        safe(true, queryNotificationSummary),
      ]);
      setProjects(projectRows);
      setGenerations(generationRows ?? []);
      setAi(aiConfig);
      setGitlab(gitlabConfig);
      setInbox(summary);
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
  const hasRunning = generations.some(
    (task) =>
      ['PENDING', 'RUNNING'].includes(task.status) ||
      task.backendPushStatus === 'PUSHING' ||
      task.frontendPushStatus === 'PUSHING',
  );
  useEffect(() => {
    if (!hasRunning) return undefined;
    const timer = window.setInterval(() => void load(), 5000);
    return () => window.clearInterval(timer);
  }, [hasRunning, load]);

  const permissions = user?.permissions ?? [];
  const can = (code: string) => permissions.includes(code);
  const businessProjects = projects.filter((project) => project.projectCode !== 'system');
  const canStartFirstProject =
    can('system:project:create') && can('system:project-factory:generate');

  const todos = useMemo<TodoItem[]>(() => {
    const items: TodoItem[] = [];

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

    const pendingPush = generations.filter(
      (task) =>
        task.status === 'SUCCESS' &&
        !(task.backendPushStatus === 'PUSHED' && task.frontendPushStatus === 'PUSHED'),
    );
    if (pendingPush.length > 0 && can('system:project-factory:push')) {
      items.push({
        key: 'gen-pending-push',
        tone: 'warning',
        icon: <CloudUploadOutlined />,
        title: intl.formatMessage({ id: 'home.todo.pendingPush' }, { count: pendingPush.length }),
        desc: pendingPush
          .map((task) => task.projectName)
          .join(intl.formatMessage({ id: 'home.listSeparator' })),
        actionText: intl.formatMessage({ id: 'home.todo.push' }),
        onAction: () => history.push('/project-factory'),
      });
    }

    if (ai && (!ai.enabled || !ai.apiKeyConfigured || ai.lastTestStatus === 'FAILED')) {
      items.push({
        key: 'ai-not-ready',
        tone: 'warning',
        icon: <ApiOutlined />,
        title: intl.formatMessage({ id: 'home.todo.aiNotReady' }),
        desc: !ai.apiKeyConfigured
          ? intl.formatMessage({ id: 'home.todo.aiNoKey' })
          : !ai.enabled
            ? intl.formatMessage({ id: 'home.todo.configuredDisabled' })
            : ai.lastTestMessage || intl.formatMessage({ id: 'home.todo.lastTestFailed' }),
        actionText: intl.formatMessage({ id: 'home.todo.configure' }),
        onAction: () => history.push('/ai-provider'),
      });
    }

    if (
      gitlab &&
      (!gitlab.enabled || !gitlab.tokenConfigured || gitlab.lastTestStatus === 'FAILED')
    ) {
      items.push({
        key: 'gitlab-not-ready',
        tone: 'warning',
        icon: <GitlabOutlined />,
        title: intl.formatMessage({ id: 'home.todo.gitlabNotReady' }),
        desc: !gitlab.tokenConfigured
          ? intl.formatMessage({ id: 'home.todo.gitlabNoToken' })
          : !gitlab.enabled
            ? intl.formatMessage({ id: 'home.todo.configuredDisabled' })
            : gitlab.lastTestMessage || intl.formatMessage({ id: 'home.todo.lastTestFailed' }),
        actionText: intl.formatMessage({ id: 'home.todo.configure' }),
        onAction: () => history.push('/gitlab-config'),
      });
    }

    return items;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [generations, ai, gitlab, permissions, inbox, intl]);

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
    <PageContainer header={{ title: null, breadcrumb: {} }} style={{ background: 'transparent' }}>
      <div
        style={{
          borderRadius: 12,
          padding: '28px 32px',
          marginBottom: 16,
          background: 'linear-gradient(120deg, #4f46e5 0%, #6d5bef 40%, #7c3aed 100%)',
          color: '#fff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 16,
          boxShadow: '0 12px 28px rgba(79,70,229,0.22)',
        }}
      >
        <div>
          <div style={{ fontSize: 13, opacity: 0.78, letterSpacing: 1 }}>
            {intl.formatMessage({ id: 'home.controlPlane' })}
          </div>
          <div style={{ fontSize: 24, fontWeight: 600, marginTop: 4 }}>
            {intl.formatMessage(
              { id: 'home.greeting.user' },
              {
                greeting: intl.formatMessage({ id: greetingKey() }),
                name: user?.displayName ?? intl.formatMessage({ id: 'home.defaultUser' }),
              },
            )}
          </div>
          <div style={{ marginTop: 6, opacity: 0.86, fontSize: 13 }}>
            {todos.length > 0
              ? intl.formatMessage({ id: 'home.summary.pending' }, { count: todos.length })
              : intl.formatMessage({ id: 'home.summary.clear' })}
          </div>
        </div>
        <Button ghost icon={<ReloadOutlined />} loading={loading} onClick={() => void load()}>
          {intl.formatMessage({ id: 'home.refresh' })}
        </Button>
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
        <FirstProjectGuide
          aiReady={Boolean(ai?.enabled && ai.apiKeyConfigured)}
          gitlabReady={Boolean(gitlab?.enabled && gitlab.tokenConfigured)}
        />
      )}

      <Card
        title={intl.formatMessage({ id: 'home.todo.title' })}
        variant="borderless"
        style={{ marginBottom: 16 }}
        styles={{ header: { borderBottom: 'none', paddingBottom: 0 } }}
      >
        {todos.length === 0 ? (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '8px 0',
              color: 'rgba(0,0,0,0.45)',
              fontSize: 13,
            }}
          >
            <CheckCircleFilled style={{ color: '#52c41a', fontSize: 16 }} />
            {intl.formatMessage({ id: 'home.todo.empty' })}
          </div>
        ) : (
          <Row gutter={[12, 12]}>
            {todos.map((todo) => (
              <Col xs={24} lg={12} key={todo.key}>
                <TodoCard todo={todo} />
              </Col>
            ))}
          </Row>
        )}
      </Card>

      <Card
        title={
          projects.length > 0
            ? intl.formatMessage({ id: 'home.projects.titleCount' }, { count: projects.length })
            : intl.formatMessage({ id: 'home.projects.title' })
        }
        variant="borderless"
        styles={{ header: { borderBottom: 'none', paddingBottom: 0 } }}
        extra={
          projects.length > 6 ? (
            <Input
              allowClear
              prefix={<SearchOutlined style={{ color: 'rgba(0,0,0,0.35)' }} />}
              placeholder={intl.formatMessage({ id: 'home.projects.search' })}
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              style={{ width: 220 }}
            />
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
                <Col xs={24} sm={12} lg={8} key={project.id}>
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
function FirstProjectGuide({ aiReady, gitlabReady }: { aiReady: boolean; gitlabReady: boolean }) {
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
          <Col xs={24} md={8} key={step.title}>
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
                  color: '#4f46e5',
                  background: 'rgba(79,70,229,0.10)',
                  flexShrink: 0,
                }}
              >
                {index + 1}
              </div>
              <div>
                <Space size={6}>
                  <span style={{ color: '#4f46e5' }}>{step.icon}</span>
                  <Typography.Text strong>{step.title}</Typography.Text>
                </Space>
                <Typography.Text
                  type="secondary"
                  style={{ display: 'block', marginTop: 4, fontSize: 12 }}
                >
                  {step.desc}
                </Typography.Text>
              </div>
            </div>
          </Col>
        ))}
      </Row>
      <Typography.Text type="secondary" style={{ display: 'block', marginTop: 14, fontSize: 12 }}>
        {aiReady
          ? intl.formatMessage({ id: 'home.guide.aiReady' })
          : intl.formatMessage({ id: 'home.guide.aiOptional' })}
        {gitlabReady
          ? intl.formatMessage({ id: 'home.guide.gitlabReady' })
          : intl.formatMessage({ id: 'home.guide.gitlabOptional' })}
      </Typography.Text>
    </Card>
  );
}

function TodoCard({ todo }: { todo: TodoItem }) {
  const toneMap = {
    error: { bg: 'rgba(255,77,79,0.10)', fg: '#cf1322', border: 'rgba(255,77,79,0.28)' },
    warning: { bg: 'rgba(250,173,20,0.12)', fg: '#d48806', border: 'rgba(250,173,20,0.32)' },
    processing: { bg: 'rgba(79,70,229,0.10)', fg: '#4f46e5', border: 'rgba(79,70,229,0.28)' },
  } as const;
  const t = toneMap[todo.tone];
  return (
    <div
      style={{
        border: `1px solid ${t.border}`,
        borderRadius: 10,
        padding: '12px 14px',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        background: '#fff',
        height: '100%',
      }}
    >
      <div
        style={{
          width: 32,
          height: 32,
          borderRadius: 8,
          background: t.bg,
          color: t.fg,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 15,
          flexShrink: 0,
        }}
      >
        {todo.icon}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 500 }}>{todo.title}</div>
        <Typography.Text
          type="secondary"
          style={{ fontSize: 12, display: 'block' }}
          ellipsis={{ tooltip: todo.desc }}
        >
          {todo.desc}
        </Typography.Text>
      </div>
      <Button type="link" size="small" onClick={todo.onAction}>
        {todo.actionText}
      </Button>
    </div>
  );
}

function ProjectEntryCard({ project, onEnter }: { project: PlatformProject; onEnter: () => void }) {
  const intl = useIntl();
  const isSystem = project.projectCode === 'system';
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onEnter}
      onKeyDown={(event) => {
        if (event.key === 'Enter') onEnter();
      }}
      style={{
        border: '1px solid #f0f0f0',
        borderRadius: 10,
        padding: '14px 16px',
        cursor: 'pointer',
        transition: 'all 0.15s ease',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        background: '#fff',
        height: '100%',
      }}
      onMouseEnter={(event) => {
        event.currentTarget.style.borderColor = '#4f46e5';
        event.currentTarget.style.boxShadow = '0 6px 16px rgba(79,70,229,0.12)';
      }}
      onMouseLeave={(event) => {
        event.currentTarget.style.borderColor = '#f0f0f0';
        event.currentTarget.style.boxShadow = 'none';
      }}
    >
      <div
        style={{
          width: 36,
          height: 36,
          borderRadius: 8,
          background: isSystem
            ? 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)'
            : 'linear-gradient(135deg, #6366f1 0%, #a855f7 100%)',
          color: '#fff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 15,
          fontWeight: 600,
          flexShrink: 0,
        }}
      >
        {isSystem ? <CrownFilled /> : project.projectName[0]}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontWeight: 500,
            fontSize: 14,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          <span
            style={{
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {project.projectName}
          </span>
          <DictTag dictCode="project.status" value={project.status} />
        </div>
        <div
          style={{
            fontSize: 12,
            color: 'rgba(0,0,0,0.45)',
            marginTop: 2,
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {project.projectCode}
          {!isSystem && !project.backendUrl && (
            <Tag style={{ marginLeft: 6 }} color="default">
              {intl.formatMessage({ id: 'home.projects.noEntry' })}
            </Tag>
          )}
        </div>
      </div>
      <ArrowRightOutlined style={{ color: 'rgba(0,0,0,0.35)' }} />
    </div>
  );
}
