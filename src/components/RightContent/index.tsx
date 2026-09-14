import {
  AppstoreAddOutlined,
  AppstoreOutlined,
  CheckCircleFilled,
  IdcardOutlined,
  LogoutOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { history, useIntl } from '@umijs/max';
import { Avatar, Dropdown, Empty, Modal, Segmented, Skeleton, Typography } from 'antd';
import { useEffect, useState, type ReactNode } from 'react';
import NotificationBell from '@/components/NotificationBell';
import GlobalSearch from '@/components/GlobalSearch';
import LanguageSwitcher from '@/components/LanguageSwitcher';
import { currentUserSnapshot, logout } from '@/services/auth';
import { queryCurrentProjects, type PlatformProject } from '@/services/projects';
import {
  openProjectEntry,
  readProjectOpenMode,
  writeProjectOpenMode,
  type ProjectOpenMode,
} from '@/utils/projectEntry';

/**
 * 侧边栏底部区域（ProLayout side 布局下 rightContentRender 渲染在此）。
 *
 * 侧边栏只有 216px，三个元素横排会把用户名挤到换行，因此改为三行：
 * 搜索、切换项目、用户信息 + 站内信。
 *
 * 切换项目是独立一行而不是收进用户菜单：跨项目工作时它是高频动作，
 * 藏在头像下拉里要点两次；原先那一项还只是跳回工作台，等于再挑一次。
 */
export default function RightContent() {
  const user = currentUserSnapshot();
  const intl = useIntl();
  const [switching, setSwitching] = useState(false);

  const signOut = async () => {
    await logout();
    history.replace('/login');
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
        width: '100%',
        padding: 8,
        borderTop: '1px solid #f0f0f0',
      }}
    >
      <GlobalSearch block />
      <ProjectSwitcher open={switching} onClose={() => setSwitching(false)} />
      <SidebarAction
        icon={<AppstoreAddOutlined />}
        label={intl.formatMessage({ id: 'layout.user.switchProject' })}
        onClick={() => setSwitching(true)}
      />
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <UserMenu user={user} onSignOut={signOut} />
        <LanguageSwitcher compact />
        <NotificationBell compact />
      </div>
    </div>
  );
}

function UserMenu({
  user,
  onSignOut,
}: {
  user?: ReturnType<typeof currentUserSnapshot>;
  onSignOut: () => Promise<void>;
}) {
  const signOut = onSignOut;
  const intl = useIntl();
  return (
    <Dropdown
      // 触发器在侧边栏底部，必须向上弹出，否则菜单会被裁在视口外。
      placement="topLeft"
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
      <div
        style={{
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
            background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)',
            color: '#fff',
            fontSize: 12,
            flexShrink: 0,
          }}
          icon={!user ? <UserOutlined /> : undefined}
        >
          {user?.displayName?.[0] ?? user?.username?.[0]}
        </Avatar>
        <Typography.Text
          ellipsis={{ tooltip: user?.displayName ?? user?.username }}
          style={{ fontSize: 13, flex: 1, minWidth: 0 }}
        >
          {user?.displayName ??
            user?.username ??
            intl.formatMessage({ id: 'layout.user.notLoggedIn' })}
        </Typography.Text>
      </div>
    </Dropdown>
  );
}

/** 侧栏底部的行按钮，高度、圆角与 hover 底色与下方用户行保持一致。 */
function SidebarAction({
  icon,
  label,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  onClick: () => void;
}) {
  const [hover, setHover] = useState(false);
  return (
    <div
      role="button"
      tabIndex={0}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={onClick}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onClick();
        }
      }}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        height: 40,
        padding: '0 8px',
        borderRadius: 8,
        cursor: 'pointer',
        fontSize: 13,
        color: hover ? '#4f46e5' : 'rgba(0,0,0,0.65)',
        background: hover ? 'rgba(79,70,229,0.08)' : 'transparent',
        transition: 'background 0.15s ease, color 0.15s ease',
      }}
    >
      <span style={{ display: 'flex', width: 26, justifyContent: 'center', flexShrink: 0 }}>
        {icon}
      </span>
      <span style={{ flex: 1, minWidth: 0 }}>{label}</span>
    </div>
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
 * 项目切换弹窗。与业务子后台（如 reimburse）的同名弹窗保持一致的卡片式样，
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

  const targets: SwitchTarget[] = (projects ?? [])
    // 内置 system 就是当前所在的平台，恒定展示且标为当前；
    // 其余项目没有 backendUrl 就无处可去，不列出来。
    .filter((project) => project.builtIn || project.backendUrl)
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
        border: `1px solid ${active ? '#4f46e5' : '#f0f0f0'}`,
        background: item.current ? 'rgba(79,70,229,0.04)' : '#fff',
        boxShadow: active ? '0 4px 12px rgba(79,70,229,0.12)' : 'none',
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
          color: item.current ? '#fff' : '#4f46e5',
          background: item.current
            ? 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)'
            : 'rgba(79,70,229,0.08)',
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
      {item.current && <CheckCircleFilled style={{ color: '#4f46e5', flexShrink: 0 }} />}
    </div>
  );
}
