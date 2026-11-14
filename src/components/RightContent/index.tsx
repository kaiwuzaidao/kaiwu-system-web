import {
  AppstoreOutlined,
  CheckCircleFilled,
  EllipsisOutlined,
  IdcardOutlined,
  LogoutOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { history, useIntl, useLocation } from '@umijs/max';
import { Button, Avatar, Dropdown, Empty, Modal, Segmented, Skeleton, Typography } from 'antd';
import { useEffect, useState, useSyncExternalStore } from 'react';
import NotificationBell from '@/components/NotificationBell';
import LineIcon from '@/components/LineIcon';
import { kaiwuPalette, kaiwuBrand } from '@/theme/tokens';
import {
  requestAgentMode,
  isAgentVisible,
  subscribeAgentVisibility,
} from '@/components/AgentDock/mode';
import GlobalSearch from '@/components/GlobalSearch';
import LanguageSwitcher from '@/components/LanguageSwitcher';
import {
  currentUserSnapshot,
  logout,
  queryNavigationMenus,
  type NavigationMenu,
} from '@/services/auth';
import { queryCurrentProjects, type PlatformProject } from '@/services/projects';
import {
  enterableProjects,
  openProjectEntry,
  readProjectOpenMode,
  writeProjectOpenMode,
  type ProjectOpenMode,
} from '@/utils/projectEntry';

/** 顶栏共用搜索、项目切换与用户操作；窄屏保留可访问的紧凑入口。 */
export default function RightContent({
  aiMode = false,
  onClassic,
}: { aiMode?: boolean; onClassic?: () => void } = {}) {
  const user = currentUserSnapshot();
  const intl = useIntl();
  const [switching, setSwitching] = useState(false);
  const agentVisible = useSyncExternalStore(subscribeAgentVisibility, isAgentVisible);

  const signOut = async () => {
    await logout();
    history.replace('/login');
  };

  return (
    <div className="kaiwu-header-actions">
      <Button
        className="kaiwu-project-context kaiwu-header-action"
        icon={<LineIcon name="layers" size={14} />}
        aria-label={intl.formatMessage({ id: 'layout.user.switchProject' })}
        onClick={() => setSwitching(true)}
      >
        <span className="kaiwu-header-action-label">
          {intl.formatMessage({ id: 'layout.workspace' })} · {kaiwuBrand.shortName}
        </span>
        <LineIcon name="down" size={14} className="kaiwu-header-caret" />
      </Button>
      <GlobalSearch block active={aiMode || !agentVisible} />
      <NotificationBell compact />
      {user?.permissions.includes('system:agent:ask') && (
        <div
          className="kaiwu-mode-switch"
          role="group"
          aria-label={intl.formatMessage({ id: 'agent.dock.title' })}
        >
          <Button
            type="text"
            className={aiMode ? 'agent-dock-exit' : undefined}
            aria-pressed={!aiMode}
            icon={<LineIcon name="grid" size={15} />}
            onClick={onClassic}
          >
            {intl.formatMessage({ id: 'agent.mode.classic' })}
          </Button>
          <Button
            type="text"
            className="kaiwu-header-action"
            aria-pressed={aiMode}
            icon={<LineIcon name="spark" size={15} />}
            aria-label={intl.formatMessage({ id: 'agent.mode.enter' })}
            onClick={aiMode ? undefined : requestAgentMode}
          >
            {intl.formatMessage({ id: 'agent.dock.title' })}
          </Button>
        </div>
      )}
      <ProjectSwitcher open={switching} onClose={() => setSwitching(false)} />
      <div className="kaiwu-header-user">
        <UserMenu user={user} onSignOut={signOut} />
        <LanguageSwitcher compact />
      </div>
    </div>
  );
}

function UserMenu({
  user,
  onSignOut,
  compact = false,
  caption,
}: {
  user?: ReturnType<typeof currentUserSnapshot>;
  onSignOut: () => Promise<void>;
  compact?: boolean;
  /** 侧栏账号行的第二行（登录名）；有值时右侧显示「更多」提示。 */
  caption?: string;
}) {
  const signOut = onSignOut;
  const intl = useIntl();
  return (
    <Dropdown
      placement="bottomRight"
      trigger={['click']}
      menu={{
        items: [
          {
            key: 'profile',
            icon: <IdcardOutlined />,
            label: intl.formatMessage({ id: 'layout.user.profile' }),
            onClick: () => history.push('/profile'),
          },
          { type: 'divider' as const },
          {
            key: 'logout',
            icon: <LogoutOutlined />,
            label: intl.formatMessage({ id: 'layout.user.logout' }),
            onClick: () => void signOut(),
          },
        ],
      }}
    >
      <button
        type="button"
        className={`kaiwu-user-menu${compact ? ' is-compact' : ''}`}
        aria-label={intl.formatMessage({ id: 'layout.user.profile' })}
        style={{
          border: 0,
          background: 'transparent',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          // flex:1 + minWidth:0 是长用户名能省略而不是撑破/换行的关键。
          flex: 1,
          minWidth: 0,
          padding: '0 8px',
          height: 40,
          cursor: 'pointer',
          borderRadius: 8,
          transition: 'background 0.15s ease',
        }}
        onMouseEnter={(event) => {
          event.currentTarget.style.background = 'rgba(0,0,0,0.04)';
        }}
        onMouseLeave={(event) => {
          event.currentTarget.style.background = 'transparent';
        }}
      >
        <Avatar
          size={26}
          style={{
            background: kaiwuPalette.primary,
            color: '#fff',
            fontSize: 12,
            flexShrink: 0,
          }}
          icon={!user ? <UserOutlined /> : undefined}
        >
          {user?.displayName?.[0] ?? user?.username?.[0]}
        </Avatar>
        <span className="kaiwu-user-menu-copy">
          <Typography.Text
            ellipsis={{ tooltip: user?.displayName ?? user?.username }}
            style={{ fontSize: 13, flex: 1, minWidth: 0 }}
          >
            {user?.displayName ??
              user?.username ??
              intl.formatMessage({ id: 'layout.user.notLoggedIn' })}
          </Typography.Text>
          {caption && <span className="kaiwu-user-menu-caption">{caption}</span>}
        </span>
        {caption && <EllipsisOutlined className="kaiwu-user-menu-more" />}
      </button>
    </Dropdown>
  );
}

type SwitchTarget = {
  key: string;
  name: string;
  caption: string;
  current: boolean;
  onOpen?: () => void;
};

/**
 * 项目切换弹窗。与业务子后台（如 order-center）的同名弹窗保持一致的卡片式样，
 * 使两边看起来是一家人。
 *
 * 副标题取项目自身的 backendLabel/projectCode（数据，不是文案），当前项用图标
 * 而非文字标注，只有"打开方式"这一处新增了文案（见 V44 i18n seed）。
 */
function ProjectSwitcher({ open, onClose }: { open: boolean; onClose: () => void }) {
  const intl = useIntl();
  const [loading, setLoading] = useState(false);
  const [projects, setProjects] = useState<PlatformProject[]>();
  const [openMode, setOpenMode] = useState<ProjectOpenMode>('inline');

  // 偏好读在打开弹窗时，而不是组件挂载时：localStorage 可能被另一个标签页改过。
  useEffect(() => {
    if (open) setOpenMode(readProjectOpenMode());
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    void queryCurrentProjects()
      .then((data) => setProjects(data ?? []))
      // 取不到就显示空态，不把弹窗卡在转圈上。
      .catch(() => setProjects([]))
      .finally(() => setLoading(false));
  }, [open]);

  const targets: SwitchTarget[] = enterableProjects(projects ?? [])
    // 内置 system 就是当前所在的平台，恒定展示且标为当前。
    .map((project) => ({
      key: project.id,
      name: project.projectName,
      caption: project.backendLabel || project.projectCode,
      current: project.builtIn,
      onOpen: project.builtIn ? undefined : () => openProjectEntry(project.id, openMode),
    }))
    .sort((a, b) => Number(b.current) - Number(a.current));

  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={null}
      width={640}
      title={
        // 打开方式放在标题行右侧：它是一次性偏好，不该占掉项目卡片的位置；
        // 右侧留出 32px 给关闭按钮，否则两者会叠在一起。
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 16,
            paddingRight: 32,
          }}
        >
          <span>{intl.formatMessage({ id: 'layout.user.switchProject' })}</span>
          <Segmented<ProjectOpenMode>
            size="small"
            value={openMode}
            onChange={(value) => {
              setOpenMode(value);
              writeProjectOpenMode(value);
            }}
            options={[
              {
                value: 'inline',
                label: intl.formatMessage({ id: 'layout.project.openMode.inline' }),
              },
              {
                value: 'newTab',
                label: intl.formatMessage({ id: 'layout.project.openMode.newTab' }),
              },
            ]}
          />
        </div>
      }
    >
      {loading ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16 }}>
          {[0, 1, 2, 3].map((index) => (
            <Skeleton key={index} active avatar paragraph={{ rows: 1 }} />
          ))}
        </div>
      ) : targets.length === 0 ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16 }}>
          {targets.map((item) => (
            <SwitchCard key={item.key} item={item} />
          ))}
        </div>
      )}
    </Modal>
  );
}

function SwitchCard({ item }: { item: SwitchTarget }) {
  const [hover, setHover] = useState(false);
  const active = hover && !item.current;

  return (
    <div
      role="button"
      tabIndex={item.current ? -1 : 0}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={() => item.onOpen?.()}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          item.onOpen?.();
        }
      }}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: 16,
        borderRadius: 8,
        cursor: item.current ? 'default' : 'pointer',
        border: `1px solid ${active ? kaiwuPalette.primary : '#f0f0f0'}`,
        background: item.current ? kaiwuPalette.page : '#fff',
        boxShadow: active ? '0 4px 12px rgba(59,130,246,0.12)' : 'none',
        transition: 'border-color .2s, box-shadow .2s',
      }}
    >
      <div
        style={{
          width: 40,
          height: 40,
          flexShrink: 0,
          borderRadius: 8,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 16,
          fontWeight: 600,
          color: item.current ? '#fff' : kaiwuPalette.primary,
          background: item.current ? kaiwuPalette.primary : kaiwuPalette.primarySoft,
        }}
      >
        {item.current ? <AppstoreOutlined /> : item.name.slice(0, 1)}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <Typography.Text strong ellipsis style={{ display: 'block', minWidth: 0 }}>
          {item.name}
        </Typography.Text>
        <Typography.Text
          type="secondary"
          ellipsis
          style={{ fontSize: 12, display: 'block', minWidth: 0 }}
        >
          {item.caption}
        </Typography.Text>
      </div>
      {item.current && <CheckCircleFilled style={{ color: kaiwuPalette.primary, flexShrink: 0 }} />}
    </div>
  );
}

/** 菜单底部只保留助手入口；当前账号与退出统一在右上角用户菜单。 */
export function SidebarFooter({ collapsed }: { collapsed: boolean }) {
  const intl = useIntl();
  const user = currentUserSnapshot();
  const canAsk = user?.permissions.includes('system:agent:ask');
  return (
    <div className={`kaiwu-sidebar-footer${collapsed ? ' is-collapsed' : ''}`}>
      {canAsk &&
        (collapsed ? (
          <div className="kaiwu-sidebar-assistant">
            <Button
              type="text"
              icon={<LineIcon name="spark" size={17} />}
              onClick={requestAgentMode}
              aria-label={intl.formatMessage({ id: 'agent.mode.enter' })}
            />
          </div>
        ) : (
          <div className="kaiwu-sidebar-assistant">
            <strong>
              <LineIcon name="spark" size={13} />
              {intl.formatMessage({ id: 'layout.assistant.try' })}
            </strong>
            <Typography.Paragraph>
              {intl.formatMessage({ id: 'layout.assistant.desc' })}
            </Typography.Paragraph>
            <Button
              type="link"
              className="kaiwu-sidebar-assistant-link"
              onClick={requestAgentMode}
              aria-label={intl.formatMessage({ id: 'agent.mode.enter' })}
            >
              {intl.formatMessage({ id: 'layout.assistant.enter' })}
              <LineIcon name="arrow" size={12} />
            </Button>
          </div>
        ))}
    </div>
  );
}

/** 面包屑采用后端菜单名称，随当前路由更新。 */
export function PlatformBreadcrumb({ aiMode = false }: { aiMode?: boolean }) {
  const { pathname } = useLocation();
  const intl = useIntl();
  const [menus, setMenus] = useState<NavigationMenu[]>([]);
  useEffect(() => {
    let active = true;
    void queryNavigationMenus()
      .then((rows) => {
        if (active) setMenus(rows);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);
  // 返回当前菜单及其所在分组名；分组名作为面包屑第一级，与侧栏分组标题一致。
  const find = (
    nodes: NavigationMenu[],
    group?: string,
  ): { name: string; group?: string } | undefined => {
    for (const node of nodes) {
      if (node.path === pathname) return { name: node.name, group };
      const child = find(node.children ?? [], node.children?.length ? node.name : group);
      if (child) return child;
    }
    return undefined;
  };
  const current = aiMode ? undefined : find(menus);
  return (
    <div className="kaiwu-header-breadcrumb">
      <span>
        {aiMode
          ? intl.formatMessage({ id: 'layout.workspace' })
          : (current?.group ??
            // 顶层独立菜单在侧栏里归入「工作空间」分组，面包屑保持一致。
            (current ? intl.formatMessage({ id: 'layout.workspace' }) : kaiwuBrand.shortName))}
      </span>
      <span>/</span>
      <strong>
        {aiMode ? intl.formatMessage({ id: 'agent.workspace.title' }) : current?.name}
      </strong>
    </div>
  );
}
