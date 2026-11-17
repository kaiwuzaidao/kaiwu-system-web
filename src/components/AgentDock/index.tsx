import {
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  PlusOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import { history, useIntl, useLocation } from '@umijs/max';
import {
  Alert,
  App,
  Button,
  Checkbox,
  Drawer,
  Grid,
  Modal,
  Popover,
  Spin,
  Tooltip,
  Typography,
} from 'antd';
import { Bubble, Sender } from '@ant-design/x';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import AgentMark from './AgentMark';
import DictTag from '@/components/DictTag';
import LineIcon from '@/components/LineIcon';
import AgentSetup, { aiNeedsSetup } from './AgentSetup';
import AnswerText from './AnswerText';
import RelatedPages, { flattenPages, matchPages, type PageEntry } from './RelatedPages';
import Cards from './Cards';
import Suggestions from './Suggestions';
import { subscribeAgentMode, publishAgentVisibility } from './mode';
import MemoryPanel from './MemoryPanel';
import SessionSettings from './SessionSettings';
import SessionSidebar from './SessionSidebar';
import ProjectBrowser from './ProjectBrowser';
import InputCard from './InputCard';
import ActionCard from './ActionCard';
import RemoteActionCard from './RemoteActionCard';
import './index.less';
import { kaiwuBrand } from '@/theme/tokens';
import RightContent, { PlatformBreadcrumb } from '@/components/RightContent';
import { resolveMenuIcon } from '@/constants/menuIcons';
import {
  createAgentConversation,
  listAgentMessages,
  sendAgentMessage,
  type AgentAction,
  type AgentAnswer,
  type AgentCardCommand,
  type AgentConversation,
} from '@/services/agent';
import { formatDateTime } from '@/utils/format';
import { queryAiProvider } from '@/services/ai';
import { queryCurrentProjects } from '@/services/projects';
import {
  currentUserSnapshot,
  hasSession,
  queryNavigationMenus,
  refreshSession,
  subscribeSessionChange,
  updateAgentAutoOpen,
} from '@/services/auth';

/**
 * 本标签页已按偏好自动进入过聊天模式。
 *
 * <p>只存一个标记位，不含任何个人数据（ADR 0031 禁止把个人记录写进浏览器持久存储）。
 * 用 sessionStorage 让「登录或新开标签页」自动进入、同一标签页刷新不再打断；退出登录时清除，
 * 同一标签页重新登录会再次自动进入。</p>
 */
const AUTO_OPENED_KEY = 'kaiwu.agent.autoOpened';

function readAutoOpened() {
  try {
    return sessionStorage.getItem(AUTO_OPENED_KEY) === '1';
  } catch {
    return false;
  }
}

function writeAutoOpened(value: boolean) {
  try {
    if (value) sessionStorage.setItem(AUTO_OPENED_KEY, '1');
    else sessionStorage.removeItem(AUTO_OPENED_KEY);
  } catch {
    // 存储不可用（隐私模式等）时只是每次加载都自动进入，不影响功能。
  }
}

type Turn = {
  id?: string;
  historical?: boolean;
  createdAt?: string;
  question: string;
  answer?: AgentAnswer;
  failed?: string;
};

/**
 * 全局对话窗。
 *
 * <p>挂在布局的 childrenRender 上而不是某个页面里：切换路由不打断对话。
 * 会话与问答文本由服务端按当前用户保存；令牌和可执行预览仅保留在当前页面内存。</p>
 *
 * <p>与顶栏的全局搜索并存、不做分流：搜索要求即时、确定、零成本，
 * Agent 有延迟且消耗额度。在同一个输入框里按「像不像自然语言」分流，
 * 会让用户无法预测这次回车是秒回还是等三秒。</p>
 */
export default function AgentDock() {
  const intl = useIntl();
  const { pathname } = useLocation();
  const { message } = App.useApp();
  const [open, setOpen] = useState(false);
  useEffect(() => {
    publishAgentVisibility(open);
    return () => publishAgentVisibility(false);
  }, [open]);
  const [autoOpen, setAutoOpen] = useState(() => !!currentUserSnapshot()?.agentAutoOpen);
  const [savingAutoOpen, setSavingAutoOpen] = useState(false);
  // 强制改密完成后需要重新判断是否自动进入，因此跟踪为状态而不是只读快照。
  const [mustChangePassword, setMustChangePassword] = useState(
    () => !!currentUserSnapshot()?.mustChangePassword,
  );
  // needed：已确认平台未接入大模型，空白会话里显示接入表单；unknown：无权查看配置，按可用处理。
  const [aiState, setAiState] = useState<'unknown' | 'ready' | 'needed'>('unknown');
  const [connectedModel, setConnectedModel] = useState<string>();
  // 顶部模型标签与右侧上下文只做展示，取不到时隐藏或显示占位，不影响对话。
  const [providerModel, setProviderModel] = useState<string>();
  const [projectCount, setProjectCount] = useState<number>();
  // 本人有权限的页面，用于助手做不到时给出直达；只取平台下发的站内路由。
  const [pages, setPages] = useState<PageEntry[]>([]);
  // 项目列表挂在打开它的那一轮回答下面，而不是整个对话末尾；否则后续提问会插到它前面。
  const [projectBrowser, setProjectBrowser] = useState<{
    key: number;
    keyword?: string;
    turn: number;
  }>();
  const projectBrowserRef = useRef<HTMLDivElement>(null);
  const showProjects = (turn: number, keyword?: string) =>
    setProjectBrowser((previous) => ({ key: (previous?.key ?? 0) + 1, keyword, turn }));
  useEffect(() => {
    projectBrowserRef.current?.scrollIntoView({ block: 'start' });
  }, [projectBrowser]);
  const [conversation, setConversation] = useState<AgentConversation>();
  // 窄屏下侧栏改为浮层：默认收起，选中会话后自动收起。
  const screens = Grid.useBreakpoint();
  const narrow = screens.md === false;
  // 右侧上下文栏在中等宽度以下隐藏，「登录后默认进入」随之移到会话侧栏底部。
  const compact = screens.lg === false;
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [memoryOpen, setMemoryOpen] = useState(false);
  useEffect(() => {
    if (narrow) setSidebarOpen(false);
  }, [narrow]);
  const [revision, setRevision] = useState(0);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string>();
  const [question, setQuestion] = useState('');
  const [turns, setTurns] = useState<Turn[]>([]);
  const [pending, setPending] = useState(false);
  const generation = useRef(0);
  const owner = useRef(currentUserSnapshot()?.id);
  const sending = useRef(false);

  const [allowed, setAllowed] = useState(() =>
    (currentUserSnapshot()?.permissions ?? []).includes('system:agent:ask'),
  );

  useEffect(() => {
    // 入口可见性只是体验；后端 @RequirePermission("system:agent:ask") 才是安全边界。
    // 监听会话变化，避免登出、会话刷新或权限重新加载后浮窗继续停留在页面上。
    let mounted = true;
    const unsubscribe = subscribeSessionChange(() => {
      const user = currentUserSnapshot();
      const permitted = (user?.permissions ?? []).includes('system:agent:ask');
      if (!hasSession()) writeAutoOpened(false);
      setAutoOpen(!!user?.agentAutoOpen);
      setMustChangePassword(!!user?.mustChangePassword);
      if (!hasSession() || !permitted || owner.current !== user?.id) {
        generation.current += 1;
        sending.current = false;
        setTurns([]);
        setConversation(undefined);
        setHistoryTotal(0);
        setHistoryError(undefined);
        setHistoryLoading(false);
        setMemoryOpen(false);
        setProjectBrowser(undefined);
        setQuestion('');
        setOpen(false);
        setPending(false);
      }
      owner.current = user?.id;
      setAllowed(permitted);
    });

    // 页面在权限新增或服务升级前已经打开时，内存中的 JWT 权限快照可能过期。
    // 只在当前会话存在且本地尚未看到权限时刷新一次，避免无权限用户反复请求刷新接口。
    if (hasSession() && !allowed) {
      void refreshSession().then((session) => {
        if (mounted && session) {
          setAllowed(session.user.permissions.includes('system:agent:ask'));
        }
      });
    }

    return () => {
      mounted = false;
      unsubscribe();
    };
  }, [allowed]);

  // 按用户偏好在登录或新开标签页时直接进入聊天模式；强制改密时不遮挡改密弹窗。
  // 全新安装的第一个管理员默认开启该偏好：改完初始密码后直接进入，在对话里完成首次配置。
  useEffect(() => {
    const user = currentUserSnapshot();
    // 设备确认页必须先让用户核对客户端和授权码，仍可手动打开助手。
    if (pathname === '/device') {
      setOpen(false);
      return;
    }
    if (!allowed || !user?.agentAutoOpen || mustChangePassword || readAutoOpened()) return;
    writeAutoOpened(true);
    setOpen(true);
  }, [allowed, mustChangePassword, pathname]);

  // 传统模式侧栏里的「AI 助手模式」入口。
  useEffect(() => subscribeAgentMode(() => setOpen(true)), []);

  // 每次进入时确认大模型是否就绪；未就绪时空白会话直接给出接入表单。
  useEffect(() => {
    if (!open) return;
    if (!currentUserSnapshot()?.permissions.includes('system:ai:list')) {
      setAiState('unknown');
      return;
    }
    let cancelled = false;
    queryAiProvider()
      .then((config) => {
        if (cancelled) return;
        setAiState(aiNeedsSetup(config) ? 'needed' : 'ready');
        setProviderModel(aiNeedsSetup(config) ? undefined : config?.model || undefined);
      })
      .catch(() => {
        if (!cancelled) setAiState('unknown');
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    queryCurrentProjects()
      .then((rows) => {
        if (!cancelled) setProjectCount(rows?.length ?? 0);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    if (!open || pages.length) return;
    let cancelled = false;
    queryNavigationMenus()
      .then((menus) => {
        if (!cancelled) setPages(flattenPages(menus));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [open, pages.length]);

  const enterClassicMode = () => {
    setOpen(false);
    message.info(intl.formatMessage({ id: 'agent.mode.classicHint' }));
  };

  const openPage = (path: string) => {
    enterClassicMode();
    history.push(path);
  };

  // 聊天里只登记项目；生成第一版交给开通向导，带上登记值让向导从中断处续做。
  const continueGeneration = (project: NonNullable<AgentAction['project']>) => {
    const params = new URLSearchParams({
      from: 'agent',
      projectCode: project.projectCode,
      projectName: project.projectName,
    });
    if (project.packageName) params.set('packageName', project.packageName);
    if (project.description) params.set('description', project.description);
    setOpen(false);
    history.push(`/project-onboarding?${params.toString()}`);
  };

  const changeAutoOpen = async (value: boolean) => {
    setSavingAutoOpen(true);
    setAutoOpen(value);
    try {
      await updateAgentAutoOpen(value);
    } catch (error) {
      setAutoOpen(!value);
      message.error(
        error instanceof Error ? error.message : intl.formatMessage({ id: 'agent.chat.failed' }),
      );
    } finally {
      setSavingAutoOpen(false);
    }
  };

  const resetConversation = () => {
    if (sending.current) return;
    generation.current += 1;
    setConversation(undefined);
    setTurns([]);
    setQuestion('');
    setProjectBrowser(undefined);
    setHistoryPage(1);
    setHistoryTotal(0);
    setHistoryError(undefined);
    setHistoryLoading(false);
  };
  const loadHistory = async (item: AgentConversation, page = 1) => {
    if (sending.current) return;
    const run = ++generation.current;
    setConversation(item);
    setHistoryLoading(true);
    setHistoryError(undefined);
    setProjectBrowser(undefined);
    if (page === 1) {
      setTurns([]);
      setQuestion('');
      setHistoryTotal(0);
    }
    try {
      const result = await listAgentMessages(item.id, page);
      if (generation.current !== run) return;
      const restored: Turn[] = [...result.records].reverse().map((message) => ({
        id: message.id,
        question: message.question,
        historical: true,
        createdAt: message.createdAt,
        ...(message.completed
          ? {
              answer: {
                answer: message.answer ?? '',
                cards: [],
                usedCapabilities: [],
                correlationId: '',
              },
            }
          : { failed: intl.formatMessage({ id: 'agent.chat.interrupted' }) }),
      }));
      setTurns((previous) =>
        page === 1
          ? restored
          : [...restored.filter((row) => !previous.some((old) => old.id === row.id)), ...previous],
      );
      setHistoryPage(page);
      setHistoryTotal(result.total);
    } catch (error) {
      if (generation.current === run)
        setHistoryError(
          error instanceof Error ? error.message : intl.formatMessage({ id: 'agent.chat.failed' }),
        );
    } finally {
      if (generation.current === run) setHistoryLoading(false);
    }
  };

  const submit = useCallback(
    async (override?: string) => {
      const text = (override ?? question).trim();
      if (!text || sending.current || historyLoading || historyError) return;
      sending.current = true;
      const run = generation.current;
      setQuestion('');
      setPending(true);
      setTurns((prev) => [...prev, { question: text }]);
      try {
        const active = conversation ?? (await createAgentConversation(text.slice(0, 100)));
        if (generation.current !== run) return;
        setConversation(active);
        const result = await sendAgentMessage(active.id, text);
        const answer = result.answer;
        if (generation.current !== run) return;
        setTurns((prev) => {
          const next = [...prev];
          next[next.length - 1] = { id: result.messageId, question: text, answer };
          return next;
        });
      } catch (failure) {
        if (generation.current !== run) return;
        // 失败原因由后端以结构化 reason 返回；网络层失败统一提示，不猜细节。
        setTurns((prev) => {
          const next = [...prev];
          next[next.length - 1] = {
            question: text,
            failed:
              failure instanceof Error
                ? failure.message
                : intl.formatMessage({ id: 'agent.degraded.PROVIDER_UNAVAILABLE' }),
          };
          return next;
        });
      } finally {
        if (generation.current === run) {
          sending.current = false;
          setPending(false);
          setRevision((value) => value + 1);
        }
      }
    },
    [question, conversation, historyLoading, historyError, intl],
  );

  const runCardCommand = async (command: AgentCardCommand) => {
    if (sending.current || historyLoading || historyError || !conversation) return;
    sending.current = true;
    setPending(true);
    const run = generation.current;
    const text = command.label;
    setTurns((previous) => [...previous, { question: text }]);
    try {
      const result = await sendAgentMessage(conversation.id, text, {
        capabilityCode: command.capabilityCode,
        values: command.values,
      });
      if (generation.current !== run) return;
      setTurns((previous) => [
        ...previous.slice(0, -1),
        { id: result.messageId, question: text, answer: result.answer },
      ]);
    } catch (error) {
      if (generation.current !== run) return;
      setTurns((previous) => [
        ...previous.slice(0, -1),
        {
          question: text,
          failed:
            error instanceof Error
              ? error.message
              : intl.formatMessage({ id: 'agent.chat.failed' }),
        },
      ]);
    } finally {
      if (generation.current === run) {
        sending.current = false;
        setPending(false);
        setRevision((value) => value + 1);
      }
    }
  };

  // 只在最后一轮变化（新提问、收到回复、恢复历史）时贴底；加载更早记录只往前插，不打断阅读位置。
  const threadRef = useRef<HTMLDivElement>(null);
  const lastTurn = turns[turns.length - 1];
  useLayoutEffect(() => {
    const element = threadRef.current;
    if (element && lastTurn) element.scrollTop = element.scrollHeight;
  }, [lastTurn]);

  if (!allowed) return null;

  const t = (id: string) => intl.formatMessage({ id });
  const inputLocked = historyLoading || !!historyError;
  // 宽屏放在右侧上下文栏的设置浮层；上下文栏隐藏时移到会话侧栏底部。
  const autoOpenCheckbox = (
    <Checkbox
      checked={autoOpen}
      disabled={savingAutoOpen}
      className="agent-dock-auto-open"
      onChange={(event) => void changeAutoOpen(event.target.checked)}
    >
      {t('agent.mode.autoOpen')}
    </Checkbox>
  );
  const selectConversation = (item: AgentConversation) => {
    if (narrow) setSidebarOpen(false);
    void loadHistory(item);
  };

  const user = currentUserSnapshot();
  const modelName = connectedModel ?? providerModel;
  // 最新一轮里仍待处理的表单或预览（V5 原型）：交互卡片放到右侧「待确认操作」，
  // 对话里只留摘要。右侧栏隐藏的窄屏、已处理完的或较早轮次的卡片仍在对话内展示。
  const lastIndex = turns.length - 1;
  const lastAnswer = turns[lastIndex]?.answer;
  const activeTurn =
    !compact &&
    lastAnswer &&
    (lastAnswer.inputForm ||
      lastAnswer.pendingAction?.status === 'PENDING' ||
      lastAnswer.pendingRemoteAction?.status === 'PENDING')
      ? lastIndex
      : undefined;
  const pendingTitle = (answer?: AgentAnswer) => {
    if (answer?.inputForm) {
      const definition = answer.inputForm.definition;
      if (definition?.title) return definition.title;
      return definition?.titleKey
        ? intl.formatMessage({ id: definition.titleKey })
        : t('agent.action.genericTitle');
    }
    if (answer?.pendingRemoteAction)
      return answer.pendingRemoteAction.capabilityName || t('agent.remoteAction.title');
    return answer?.pendingAction?.project
      ? t('agent.action.title')
      : t('agent.action.genericTitle');
  };
  /** 表单与操作预览卡片；同一份渲染既用于对话内，也用于右侧「待确认操作」。 */
  const renderInteractive = (turn: Turn, index: number) => {
    const answer = turn.answer;
    if (!answer) return null;
    return (
      <>
        {answer.inputForm && (
          <InputCard
            request={answer.inputForm}
            disabled={pending}
            onSubmit={async (input) => {
              if (sending.current) return;
              sending.current = true;
              setPending(true);
              const run = generation.current;
              try {
                if (!conversation) throw new Error(intl.formatMessage({ id: 'agent.chat.failed' }));
                const result = await sendAgentMessage(conversation.id, turn.question, input);
                const answer = result.answer;
                if (generation.current !== run) return;
                if (answer.degraded)
                  throw new Error(
                    answer.answer ||
                      intl.formatMessage({
                        id: `agent.degraded.${answer.degraded.reason}`,
                      }),
                  );
                // Forms can complete reads, request more input, or produce either
                // local or remote previews. A preview is not required for success.
                setTurns((previous) =>
                  previous.map((item, position) =>
                    position === index ? { ...item, id: result.messageId, answer } : item,
                  ),
                );
              } finally {
                if (generation.current === run) {
                  sending.current = false;
                  setPending(false);
                }
              }
            }}
          />
        )}
        {answer.pendingAction && (
          <ActionCard
            action={answer.pendingAction}
            onOpenProjects={(keyword) => showProjects(index, keyword)}
            onContinueGeneration={continueGeneration}
            onChange={(next) => {
              setTurns((previous) =>
                previous.map((item) =>
                  item.answer?.pendingAction?.actionId === next.actionId
                    ? {
                        ...item,
                        answer: { ...item.answer, pendingAction: next },
                      }
                    : item,
                ),
              );
            }}
          />
        )}
        {answer.pendingRemoteAction && (
          <RemoteActionCard
            action={answer.pendingRemoteAction}
            onOpenProjects={() => showProjects(index)}
            onChange={(next) => {
              setTurns((previous) =>
                previous.map((item) =>
                  item.answer?.pendingRemoteAction?.actionId === next.actionId
                    ? {
                        ...item,
                        answer: {
                          ...item.answer,
                          pendingRemoteAction: next,
                        },
                      }
                    : item,
                ),
              );
            }}
          />
        )}
      </>
    );
  };
  return (
    <>
      <Drawer
        rootClassName="agent-dock-drawer"
        placement="right"
        width="100%"
        closable={false}
        open={open}
        onClose={() => setOpen(false)}
      >
        <div className="agent-shell">
          {!narrow && (
            <nav className="agent-shell-rail" aria-label={t('agent.mode.classic')}>
              <div className="kaiwu-sidebar-brand-mark">
                <span>K</span>
              </div>
              <div className="agent-shell-rail-links">
                {pages.map((page) => (
                  <Tooltip title={page.name} placement="right" key={page.path}>
                    <Button
                      type="text"
                      aria-label={page.name}
                      icon={resolveMenuIcon(page.icon, page.path)}
                      onClick={() => openPage(page.path)}
                    />
                  </Tooltip>
                ))}
              </div>
              <Tooltip title={user?.displayName ?? user?.username} placement="right">
                <button
                  type="button"
                  className="agent-shell-rail-avatar"
                  aria-label={t('layout.user.profile')}
                  onClick={() => openPage('/profile')}
                >
                  {user?.displayName?.[0] ?? user?.username?.[0]}
                </button>
              </Tooltip>
            </nav>
          )}
          <div className="agent-shell-column">
            <header className="agent-shell-topbar">
              <PlatformBreadcrumb aiMode />
              <RightContent aiMode onClassic={enterClassicMode} />
            </header>
            <div className="agent-shell-body">
              <div className="agent-dock">
                {open && sidebarOpen && (
                  <SessionSidebar
                    key={owner.current}
                    current={conversation}
                    disabled={pending || historyLoading}
                    refreshKey={revision}
                    onCreate={() => {
                      if (narrow) setSidebarOpen(false);
                      resetConversation();
                    }}
                    onSelect={selectConversation}
                    onMemories={() => setMemoryOpen(true)}
                    footer={compact ? autoOpenCheckbox : undefined}
                    onDelete={(id) => {
                      if (id === conversation?.id) resetConversation();
                    }}
                  />
                )}
                {narrow && sidebarOpen && (
                  <div
                    className="agent-dock-scrim"
                    aria-hidden="true"
                    onClick={() => setSidebarOpen(false)}
                  />
                )}
                <section className="agent-dock-main">
                  <header className="agent-dock-header">
                    {/* 宽屏会话栏常驻（V5 设计）；窄屏改为浮层，需要开关。 */}
                    {narrow && (
                      <Tooltip title={t('agent.chat.sessions')}>
                        <Button
                          type="text"
                          icon={sidebarOpen ? <MenuFoldOutlined /> : <MenuUnfoldOutlined />}
                          aria-label={t('agent.chat.sessions')}
                          aria-expanded={sidebarOpen}
                          onClick={() => setSidebarOpen((value) => !value)}
                        />
                      </Tooltip>
                    )}
                    {narrow && !sidebarOpen && (
                      <Tooltip title={t('agent.chat.new')}>
                        <Button
                          type="text"
                          icon={<PlusOutlined />}
                          disabled={pending}
                          aria-label={t('agent.chat.new')}
                          onClick={resetConversation}
                        />
                      </Tooltip>
                    )}
                    <div className="agent-dock-header-title">
                      <Typography.Text strong ellipsis>
                        {conversation?.title ?? t('agent.workspace.title')}
                      </Typography.Text>
                      {!conversation && !narrow && (
                        <span className="agent-dock-header-sub">
                          {t('agent.workspace.subtitle')}
                        </span>
                      )}
                    </div>
                    {conversation && (
                      <>
                        <Tooltip title={t('agent.chat.refresh')}>
                          <Button
                            type="text"
                            icon={<ReloadOutlined />}
                            disabled={pending || historyLoading}
                            aria-label={t('agent.chat.refresh')}
                            onClick={() => void loadHistory(conversation)}
                          />
                        </Tooltip>
                        <SessionSettings
                          current={conversation}
                          disabled={pending || historyLoading}
                          onUpdate={(item) => {
                            setConversation(item);
                            setRevision((value) => value + 1);
                          }}
                        />
                      </>
                    )}
                    {modelName && !narrow && (
                      <span className="agent-dock-model-tag">
                        {intl.formatMessage({ id: 'agent.workspace.model' }, { model: modelName })}
                      </span>
                    )}
                  </header>
                  <div className="agent-dock-scroll" ref={threadRef}>
                    <div className="agent-dock-thread">
                      {historyError && (
                        <Alert
                          type="error"
                          showIcon
                          message={historyError}
                          style={{ marginBottom: 16 }}
                        />
                      )}
                      {historyLoading && (
                        <div className="agent-dock-loading">
                          <Spin size="small" />
                          <Typography.Text type="secondary">
                            {t('agent.chat.loading')}
                          </Typography.Text>
                        </div>
                      )}
                      {turns.some((turn) => turn.historical) && (
                        <div className="agent-dock-history-note">{t('agent.chat.history')}</div>
                      )}
                      {conversation && historyTotal > turns.filter((turn) => turn.id).length && (
                        <div className="agent-dock-older">
                          <Button
                            size="small"
                            loading={historyLoading}
                            disabled={pending}
                            onClick={() => void loadHistory(conversation, historyPage + 1)}
                          >
                            {t('agent.chat.older')}
                          </Button>
                        </div>
                      )}
                      {turns.length === 0 &&
                        !historyLoading &&
                        !historyError &&
                        (aiState === 'needed' ? (
                          <AgentSetup
                            onReady={(model) => {
                              setConnectedModel(model);
                              setAiState('ready');
                            }}
                          />
                        ) : (
                          <div className="agent-dock-welcome">
                            <span className="agent-dock-welcome-mark" aria-hidden="true">
                              <LineIcon name="spark" size={22} />
                            </span>
                            <h1 className="agent-dock-welcome-title">{t('agent.welcome.title')}</h1>
                            <div className="agent-dock-welcome-desc">
                              {connectedModel ? (
                                intl.formatMessage(
                                  { id: 'agent.setup.success' },
                                  { model: connectedModel },
                                )
                              ) : (
                                <>
                                  {t('agent.welcome.line1')}
                                  <br />
                                  {t('agent.welcome.line2')}
                                </>
                              )}
                            </div>
                            <Suggestions disabled={pending} onAsk={(text) => void submit(text)} />
                          </div>
                        ))}
                      {turns.map((turn, index) => (
                        <div key={turn.id ?? index} className="agent-dock-turn">
                          <Bubble
                            className="agent-dock-ask"
                            classNames={{ content: 'agent-dock-question' }}
                            placement="end"
                            variant="filled"
                            content={turn.question}
                            footer={
                              turn.createdAt ? (
                                <span className="agent-dock-time">
                                  {formatDateTime(turn.createdAt)}
                                </span>
                              ) : undefined
                            }
                          />
                          <Bubble
                            className="agent-dock-reply"
                            placement="start"
                            variant="borderless"
                            avatar={<AgentMark size={28} />}
                            loading={!turn.answer && !turn.failed}
                            loadingRender={() => (
                              <div className="agent-dock-thinking" role="status">
                                <span className="agent-dock-dots" aria-hidden="true">
                                  <i />
                                  <i />
                                  <i />
                                </span>
                                {t('agent.dock.thinking')}
                              </div>
                            )}
                            content={
                              <div className="agent-dock-reply-body">
                                {turn.failed && (
                                  <Alert type="error" showIcon message={turn.failed} />
                                )}
                                {turn.answer?.degraded && (
                                  <Alert
                                    type="warning"
                                    showIcon
                                    style={{ marginBottom: 8 }}
                                    message={intl.formatMessage({
                                      id: `agent.degraded.${turn.answer.degraded.reason}`,
                                    })}
                                  />
                                )}
                                {turn.answer && (
                                  <>
                                    {!turn.answer.inputForm && (
                                      <AnswerText text={turn.answer.answer} />
                                    )}
                                    {/* 只有纯文字回答（多为「做不到」或说明）才给页面直达，历史记录不补。 */}
                                    {!turn.historical &&
                                      !turn.answer.inputForm &&
                                      !turn.answer.cards.length &&
                                      !turn.answer.pendingAction &&
                                      !turn.answer.pendingRemoteAction && (
                                        <RelatedPages
                                          pages={matchPages(turn.question, pages)}
                                          onOpen={openPage}
                                        />
                                      )}
                                    <Cards
                                      cards={turn.answer.cards}
                                      onOpenProjects={(keyword) => showProjects(index, keyword)}
                                      disabled={pending || historyLoading}
                                      onCommand={(command) => void runCardCommand(command)}
                                    />
                                    {activeTurn === index ? (
                                      <PendingSummary title={pendingTitle(turn.answer)} />
                                    ) : (
                                      renderInteractive(turn, index)
                                    )}
                                  </>
                                )}
                                {projectBrowser?.turn === index && (
                                  <div ref={projectBrowserRef}>
                                    <ProjectBrowser
                                      key={projectBrowser.key}
                                      keyword={projectBrowser.keyword}
                                    />
                                  </div>
                                )}
                              </div>
                            }
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="agent-dock-composer-wrap">
                    <Sender
                      className="agent-dock-composer"
                      value={question}
                      disabled={inputLocked}
                      loading={pending}
                      placeholder={t('agent.composer.placeholder')}
                      autoSize={{ minRows: 2, maxRows: 6 }}
                      // Sender 没有 maxLength，在输入时截断，与后端 500 字上限一致。
                      onChange={(value) => setQuestion(value.slice(0, 500))}
                      onSubmit={() => void submit()}
                      actions={false}
                      footer={({ components: { SendButton, LoadingButton } }) => (
                        <div className="agent-dock-composer-foot">
                          {/* 两枚标签说明作用范围与确认规则，仅作提示，不是可切换的开关。 */}
                          <div className="agent-dock-composer-chips">
                            <span>
                              <LineIcon name="layers" size={13} />
                              {t('agent.composer.scope')}
                            </span>
                            <span>
                              <LineIcon name="shield" size={13} />
                              {t('agent.composer.confirm')}
                            </span>
                          </div>
                          {pending ? (
                            <LoadingButton disabled aria-label={t('agent.dock.send')} />
                          ) : (
                            <Tooltip title={t('agent.dock.send')}>
                              <SendButton
                                type="primary"
                                icon={<LineIcon name="arrow" size={15} />}
                                disabled={inputLocked || !question.trim()}
                                aria-label={t('agent.dock.send')}
                              />
                            </Tooltip>
                          )}
                        </div>
                      )}
                    />
                  </div>
                </section>
              </div>
              <aside
                className={`agent-shell-inspector${activeTurn !== undefined ? ' has-pending' : ''}`}
              >
                <div className="agent-shell-inspector-head">
                  <span>{t('agent.inspector.title')}</span>
                  <Popover trigger="click" placement="bottomRight" content={autoOpenCheckbox}>
                    <Button
                      type="text"
                      size="small"
                      icon={<LineIcon name="settings" size={16} />}
                      aria-label={t('agent.inspector.settings')}
                    />
                  </Popover>
                </div>
                <p className="agent-shell-inspector-sub">{t('agent.inspector.desc')}</p>
                <div className="agent-shell-mini">{t('agent.inspector.scope')}</div>
                <div className="agent-shell-context">
                  <div className="agent-shell-context-label">{t('agent.inspector.current')}</div>
                  <div className="agent-shell-context-title">
                    <LineIcon name="grid" size={15} />
                    {intl.formatMessage(
                      { id: 'agent.inspector.workspace' },
                      { name: kaiwuBrand.shortName },
                    )}
                  </div>
                  <div className="agent-shell-context-mini">
                    {intl.formatMessage(
                      { id: 'agent.inspector.account' },
                      {
                        name: user?.displayName ?? user?.username ?? '',
                        count: projectCount ?? '—',
                      },
                    )}
                  </div>
                </div>
                <div className="agent-shell-scope">
                  {t('agent.inspector.range')}
                  <strong>{t('agent.inspector.allProjects')}</strong>
                </div>
                <div className="agent-shell-divider" />
                <div className="agent-shell-preview-title">{t('agent.inspector.pending')}</div>
                <div className="agent-shell-preview-sub">{t('agent.inspector.pendingDesc')}</div>
                {activeTurn !== undefined ? (
                  <div className="agent-shell-pending">
                    {renderInteractive(turns[activeTurn], activeTurn)}
                  </div>
                ) : (
                  <div className="agent-shell-preview-empty">
                    <LineIcon name="clipboard" size={18} />
                    <span>{t('agent.inspector.empty')}</span>
                    <span>{t('agent.inspector.emptyHint')}</span>
                  </div>
                )}
              </aside>
            </div>
          </div>
        </div>
        <Modal
          open={open && memoryOpen}
          title={t('agent.memory.title')}
          footer={null}
          width={640}
          destroyOnHidden
          onCancel={() => setMemoryOpen(false)}
        >
          <MemoryPanel key={owner.current} disabled={pending || historyLoading} />
        </Modal>
      </Drawer>
    </>
  );
}

/** 对话里待确认操作的摘要：表单与确认按钮在右侧「待确认操作」里。 */
function PendingSummary({ title }: { title: string }) {
  const intl = useIntl();
  return (
    <div className="agent-dock-pending-summary">
      <strong>{title}</strong>
      <DictTag dictCode="agent.action.status" value="PENDING" />
      <p>{intl.formatMessage({ id: 'agent.inspector.pendingDesc' })}</p>
    </div>
  );
}
