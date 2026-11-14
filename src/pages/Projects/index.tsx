import { EllipsisOutlined, PlusOutlined, ReloadOutlined } from '@ant-design/icons';
import { history, useIntl, useLocation } from '@umijs/max';
import {
  PageContainer,
  ProTable,
  type ActionType,
  type ProColumns,
} from '@ant-design/pro-components';
import {
  Alert,
  App,
  Button,
  Descriptions,
  Drawer,
  Input,
  Popover,
  Popconfirm,
  Space,
  Tabs,
  Tag,
} from 'antd';
import { useEffect, useRef, useState } from 'react';
import dayjs from 'dayjs';
import LineIcon from '@/components/LineIcon';
import { ProjectAvatar } from '@/components/ProjectEntryCard';
import AuthButton from '@/components/AuthButton';
import DictTag from '@/components/DictTag';
import AgentCapabilitiesPanel from './components/AgentCapabilitiesPanel';
import SystemAgentCapabilitiesPanel from './components/SystemAgentCapabilitiesPanel';
import EditProjectDialog from './components/EditProjectDialog';
import GatewayRouteDialog from './components/GatewayRouteDialog';
import BackendServicesPanel from './components/BackendServicesPanel';
import GenerateProjectDialog from './components/GenerateProjectDialog';
import ConfigHandoverPanel from './components/ConfigHandoverPanel';
import MembersPanel from './components/MembersPanel';
import MenusPanel from './components/MenusPanel';
import RolesPanel from './components/RolesPanel';
import { queryCurrentUser, type CurrentUser } from '@/services/auth';
import { queryProjectGenerations, type ProjectGeneration } from '@/services/projectFactory';
import { queryProjects, updateProjectStatus, type PlatformProject } from '@/services/projects';
import { useLocaleFormatters } from '@/utils/format';
import { openProjectEntry, projectWorkspacePath, readProjectOpenMode } from '@/utils/projectEntry';

type ProjectTab = 'all' | 'active' | 'builtIn';

/** 页签与文案键；计数由服务端按同样的筛选返回 total。 */
const PROJECT_TABS: readonly (readonly [ProjectTab, string])[] = [
  ['all', 'projects.tab.all'],
  ['active', 'projects.tab.active'],
  ['builtIn', 'projects.tab.builtIn'],
];

export default function ProjectsPage() {
  const { message } = App.useApp();
  const intl = useIntl();
  const format = useLocaleFormatters();
  const actionRef = useRef<ActionType>();
  const location = useLocation();
  const [currentUser, setCurrentUser] = useState<CurrentUser>();
  const [viewing, setViewing] = useState<PlatformProject>();
  const [editing, setEditing] = useState<PlatformProject>();
  const [moreProjectId, setMoreProjectId] = useState<string>();
  const [managing, setManaging] = useState<PlatformProject>();
  const [routeTarget, setRouteTarget] = useState<PlatformProject | undefined>();
  const [agentTarget, setAgentTarget] = useState<PlatformProject>();
  const [generating, setGenerating] = useState<PlatformProject>();
  // 每个项目最近一次生成任务（列表按归属人过滤，只含本人发起的任务）。
  const [latestGenerations, setLatestGenerations] = useState<Map<string, ProjectGeneration>>(
    new Map(),
  );
  const [tab, setTab] = useState<ProjectTab>('all');
  const [tabCounts, setTabCounts] = useState<Record<ProjectTab, number>>();
  // 输入框内容与已生效的查询词分开：回车或清空才触发查询，避免每敲一个字就请求一次。
  const [keywordInput, setKeywordInput] = useState('');
  const [keyword, setKeyword] = useState<string>();
  const permissions = currentUser?.permissions ?? [];
  // 权限中心的入口权限：成员、角色、菜单任一即可进入，按此顺序取第一个持有的。
  const accessPermission = [
    'system:project:member',
    'system:project:role',
    'system:project:menu',
  ].find((code) => permissions.includes(code));

  useEffect(() => {
    void queryCurrentUser().then(setCurrentUser);
  }, []);

  // 页签计数随查询词变化：三个筛选各取一条，只用返回的 total。
  const loadTabCounts = async (search?: string) => {
    try {
      const [all, active, builtIn] = await Promise.all([
        queryProjects({ current: 1, pageSize: 1, keyword: search }),
        queryProjects({ current: 1, pageSize: 1, keyword: search, status: 'ACTIVE' }),
        queryProjects({ current: 1, pageSize: 1, keyword: search, builtIn: true }),
      ]);
      setTabCounts({ all: all.total, active: active.total, builtIn: builtIn.total });
    } catch {
      setTabCounts(undefined);
    }
  };

  useEffect(() => {
    void loadTabCounts(keyword);
  }, [keyword]);

  // 表格随导航重建（见 ProTable 的 key），查询词一并清空，保持「新导航展示全部项目」。
  useEffect(() => {
    setKeywordInput('');
    setKeyword(undefined);
    setTab('all');
  }, [location.key]);

  /**
   * 载入当前用户已有生成任务的项目集合，用于决定是否展示「生成第一版」。
   *
   * 后端列表按任务归属人过滤，所以这里只能知道"我有没有生成过"。别人已生成的项目
   * 仍可能显示入口，最终由后端的 project_id 唯一约束拒绝并回错误信息——真实约束在后端。
   */
  const loadGeneratedProjectIds = async () => {
    if (!permissions.includes('system:project-factory:list')) return;
    try {
      const tasks = await queryProjectGenerations();
      const latest = new Map<string, ProjectGeneration>();
      // 接口按创建时间倒序返回，同一项目只取第一条（最近一次）。
      for (const task of tasks) if (!latest.has(task.projectId)) latest.set(task.projectId, task);
      setLatestGenerations(latest);
    } catch {
      // 生成任务读取失败不应阻塞项目列表；入口暂不展示，刷新后重试。
    }
  };

  useEffect(() => {
    void loadGeneratedProjectIds();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser]);

  const columns: ProColumns<PlatformProject>[] = [
    {
      title: intl.formatMessage({ id: 'projects.project' }),
      dataIndex: 'projectCode',
      search: false,
      // 含字母图标、名称与「内置」标签，给足宽度避免与描述列挤在一起。
      width: 220,
      render: (_, record) => (
        <div className="kaiwu-project-cell">
          <ProjectAvatar code={record.projectCode} name={record.projectName} />
          <Space direction="vertical" size={0}>
            <Space size={6}>
              <Button
                type="link"
                className="kaiwu-project-name"
                title={record.projectName}
                onClick={() => setViewing(record)}
              >
                {record.projectName}
              </Button>
              {record.builtIn && (
                <Tag color="processing" style={{ margin: 0 }}>
                  {intl.formatMessage({ id: 'projects.builtIn' })}
                </Tag>
              )}
            </Space>
            <span className="kaiwu-project-entry-code">{record.projectCode}</span>
          </Space>
        </div>
      ),
    },
    {
      title: intl.formatMessage({ id: 'projects.backend' }),
      dataIndex: 'backendUrl',
      search: false,
      render: (_, record) =>
        record.backendUrl ? (
          <a
            title={record.backendLabel || undefined}
            // href 指向平台宿主页而非 backendUrl：中键/新标签页打开也要走同一条
            // 链路，直达业务前端的顶层页面拿不到令牌。
            href={projectWorkspacePath(record.id)}
            onClick={(event) => {
              event.preventDefault();
              openProjectEntry(record.id, readProjectOpenMode());
            }}
          >
            {intl.formatMessage({ id: 'projects.openAdmin' })}
            <LineIcon name="external" size={11} className="kaiwu-link-arrow" />
          </a>
        ) : (
          <span className="kaiwu-cell-muted">
            {intl.formatMessage({ id: 'projects.backendNotConfigured' })}
          </span>
        ),
    },
    {
      title: intl.formatMessage({ id: 'projects.generation.title' }),
      search: false,
      width: 170,
      render: (_, record) => {
        const tag = (tone: string, id: string, values?: Record<string, number>) => (
          <span className={`kaiwu-dot-tag is-${tone}`}>{intl.formatMessage({ id }, values)}</span>
        );
        if (record.builtIn) return tag('gray', 'projects.generation.builtIn');
        const task = latestGenerations.get(record.id);
        // 生成任务只返回本人发起的；别人建的项目查不到任务时不下「尚未生成」的结论。
        if (!task) {
          return record.createdBy === currentUser?.id
            ? tag('gray', 'projects.generation.none')
            : '-';
        }
        if (task.status === 'FAILED') return tag('red', 'projects.generation.failed');
        if (task.status !== 'SUCCESS') return tag('blue', 'projects.generation.running');
        // 平台只做确定性脚手架，生成成功即交付完成；业务代码由 AI 工具在本机继续（ADR 0038）。
        return tag('green', 'projects.generation.done');
      },
    },
    {
      title: intl.formatMessage({ id: 'agent.registry.entry' }),
      search: false,
      width: 130,
      render: (_, record) => (
        <AuthButton
          type="link"
          size="small"
          permission={record.builtIn ? 'system:agent:ask' : 'system:project:list'}
          permissions={permissions}
          onClick={() => setAgentTarget(record)}
        >
          {intl.formatMessage({ id: 'agent.registry.entry' })}
          <LineIcon name="external" size={11} className="kaiwu-link-arrow" />
        </AuthButton>
      ),
    },
    {
      title: intl.formatMessage({ id: 'projects.status' }),
      dataIndex: 'status',
      search: false,
      render: (_, record) => <DictTag dictCode="project.status" value={record.status} />,
    },
    {
      title: intl.formatMessage({ id: 'projects.createdAt' }),
      dataIndex: 'createdAt',
      valueType: 'dateTime',
      width: 170,
      search: false,
      render: (_, record) =>
        record.createdAt ? (
          <span className="kaiwu-cell-time">
            {dayjs(record.createdAt).format('YYYY-MM-DD HH:mm')}
          </span>
        ) : (
          '-'
        ),
    },
    {
      title: intl.formatMessage({ id: 'projects.actions' }),
      valueType: 'option',
      // 列表在常见宽度下需横向滚动，操作列固定在右侧，避免主要动作被滚出视野。
      fixed: 'right',
      // 同时容纳权限入口、更多按钮、间距和单元格内边距，避免按钮被表格裁切。
      width: 180,
      render: (_, record) => (
        <Space size={10}>
          {/* 权限中心是最常用的动作，直接放在行内；编辑等低频动作收进「更多」。 */}
          {accessPermission && (
            <AuthButton
              type="link"
              size="small"
              permission={accessPermission}
              permissions={permissions}
              onClick={() => setManaging(record)}
            >
              {intl.formatMessage({ id: 'projects.accessCenter' })}
            </AuthButton>
          )}
          <Popover
            trigger="click"
            placement="bottomRight"
            open={moreProjectId === record.id}
            onOpenChange={(open) => setMoreProjectId(open ? record.id : undefined)}
            content={
              <Space direction="vertical" className="kaiwu-project-more">
                <AuthButton
                  type="text"
                  size="small"
                  permission="system:project:update"
                  permissions={permissions}
                  onClick={() => {
                    setMoreProjectId(undefined);
                    setEditing(record);
                  }}
                >
                  {intl.formatMessage({ id: 'projects.edit' })}
                </AuthButton>
                {/* 网关路由只对业务项目有意义：内置 system 的路由由平台自身配置管理。 */}
                {!record.builtIn && (
                  <AuthButton
                    type="text"
                    size="small"
                    permission="system:project:list"
                    permissions={permissions}
                    onClick={() => {
                      setMoreProjectId(undefined);
                      setRouteTarget(record);
                    }}
                  >
                    {intl.formatMessage({ id: 'projects.gatewayRoute' })}
                  </AuthButton>
                )}
                {/* 项目还没有第一版代码时才出现：动作放在项目上，不再绕道项目工厂。 */}
                {!record.builtIn &&
                  record.status === 'ACTIVE' &&
                  !latestGenerations.has(record.id) && (
                    <AuthButton
                      type="text"
                      size="small"
                      permission="system:project-factory:generate"
                      permissions={permissions}
                      onClick={() => {
                        setMoreProjectId(undefined);
                        setGenerating(record);
                      }}
                    >
                      {intl.formatMessage({ id: 'projects.generateFirst' })}
                    </AuthButton>
                  )}
                <Popconfirm
                  title={intl.formatMessage({
                    id:
                      record.status === 'ACTIVE'
                        ? 'projects.disableConfirm'
                        : 'projects.enableConfirm',
                  })}
                  disabled={
                    record.builtIn ||
                    record.status === 'ARCHIVED' ||
                    !permissions.includes('system:project:status')
                  }
                  onConfirm={async () => {
                    try {
                      await updateProjectStatus(
                        record.id,
                        record.status === 'ACTIVE' ? 'DISABLED' : 'ACTIVE',
                      );
                      void message.success(intl.formatMessage({ id: 'projects.statusUpdated' }));
                      actionRef.current?.reload();
                    } catch (error) {
                      void message.error(error instanceof Error ? error.message : String(error));
                    }
                  }}
                >
                  <AuthButton
                    type="text"
                    size="small"
                    permission="system:project:status"
                    permissions={permissions}
                    disabled={record.builtIn || record.status === 'ARCHIVED'}
                  >
                    {intl.formatMessage({
                      id: record.status === 'ACTIVE' ? 'projects.disable' : 'projects.enable',
                    })}
                  </AuthButton>
                </Popconfirm>
                <Popconfirm
                  title={intl.formatMessage({ id: 'projects.archiveConfirm' })}
                  disabled={
                    record.builtIn ||
                    record.status === 'ARCHIVED' ||
                    !permissions.includes('system:project:status')
                  }
                  onConfirm={async () => {
                    try {
                      await updateProjectStatus(record.id, 'ARCHIVED');
                      void message.success(intl.formatMessage({ id: 'projects.archived' }));
                      actionRef.current?.reload();
                    } catch (error) {
                      void message.error(error instanceof Error ? error.message : String(error));
                    }
                  }}
                >
                  <AuthButton
                    type="text"
                    size="small"
                    danger
                    permission="system:project:status"
                    permissions={permissions}
                    disabled={record.builtIn || record.status === 'ARCHIVED'}
                  >
                    {intl.formatMessage({ id: 'projects.archive' })}
                  </AuthButton>
                </Popconfirm>
              </Space>
            }
          >
            <Button
              size="small"
              className="kaiwu-more-trigger"
              icon={<EllipsisOutlined />}
              aria-label={intl.formatMessage({ id: 'projects.actions' })}
            />
          </Popover>
        </Space>
      ),
    },
  ];

  return (
    <PageContainer
      title={intl.formatMessage({ id: 'projects.title' })}
      subTitle={intl.formatMessage({ id: 'projects.subtitle' })}
      extra={[
        <Button
          key="refresh"
          icon={<ReloadOutlined />}
          onClick={() => {
            actionRef.current?.reload();
            void loadTabCounts(keyword);
          }}
        >
          {intl.formatMessage({ id: 'common.refresh' })}
        </Button>,
        <AuthButton
          key="create"
          type="primary"
          icon={<PlusOutlined />}
          permission="system:project:create"
          permissions={permissions}
          onClick={() => history.push('/project-onboarding')}
        >
          {intl.formatMessage({ id: 'projects.open' })}
        </AuthButton>,
      ]}
    >
      <ProTable<PlatformProject>
        scroll={{ x: 1000 }}
        // Agent 创建后可能返回相同路径；新导航重建查询，清除旧筛选并展示最新项目。
        key={location.key}
        sticky
        rowKey="id"
        actionRef={actionRef}
        columns={columns}
        params={{ keyword, tab }}
        request={async (params) => {
          const page = await queryProjects({
            current: params.current,
            pageSize: params.pageSize,
            keyword: params.keyword as string | undefined,
            status: params.tab === 'active' ? 'ACTIVE' : undefined,
            builtIn: params.tab === 'builtIn' ? true : undefined,
          });
          return { data: page.records, total: page.total, success: true };
        }}
        search={false}
        options={false}
        pagination={{
          defaultPageSize: 10,
          showSizeChanger: false,
          showTotal: (total) => intl.formatMessage({ id: 'projects.totalCount' }, { count: total }),
        }}
        headerTitle={
          <div className="kaiwu-table-head">
            <Tabs
              className="kaiwu-table-tabs"
              activeKey={tab}
              onChange={(key) => setTab(key as ProjectTab)}
              items={PROJECT_TABS.map(([key, id]) => ({
                key,
                label: (
                  <>
                    {intl.formatMessage({ id })}
                    {tabCounts && <span className="kaiwu-tab-count">{tabCounts[key]}</span>}
                  </>
                ),
              }))}
            />
            <Input
              allowClear
              className="kaiwu-table-search"
              prefix={<LineIcon name="search" size={14} />}
              placeholder={intl.formatMessage({ id: 'agent.projects.search' })}
              value={keywordInput}
              onChange={(event) => {
                setKeywordInput(event.target.value);
                // 清空输入框即恢复全部项目。
                if (!event.target.value) setKeyword(undefined);
              }}
              onPressEnter={() => setKeyword(keywordInput.trim() || undefined)}
            />
          </div>
        }
        toolBarRender={() => [
          <Button
            key="reset"
            autoInsertSpace={false}
            onClick={() => {
              setKeywordInput('');
              setKeyword(undefined);
            }}
          >
            {intl.formatMessage({ id: 'projects.resetSearch' })}
          </Button>,
        ]}
      />

      <Drawer
        rootClassName="kaiwu-project-detail"
        width="min(540px, 100vw)"
        title={viewing?.projectName}
        open={Boolean(viewing)}
        onClose={() => setViewing(undefined)}
      >
        {viewing && (
          <>
            <div className="kaiwu-project-detail-heading">
              <strong>{viewing.projectName}</strong>
              <DictTag dictCode="project.status" value={viewing.status} />
              <code>{viewing.projectCode}</code>
            </div>
            <Descriptions
              column={1}
              items={[
                {
                  key: 'description',
                  label: intl.formatMessage({ id: 'projects.description' }),
                  children: viewing.description || '—',
                },
                {
                  key: 'repository',
                  label: intl.formatMessage({ id: 'projects.legacyRepo' }),
                  children: viewing.repositoryUrl || '—',
                },
                {
                  key: 'backend',
                  label: intl.formatMessage({ id: 'projects.backend' }),
                  children: viewing.backendUrl || '—',
                },
                {
                  key: 'created',
                  label: intl.formatMessage({ id: 'projects.createdAt' }),
                  children: format.dateTime(viewing.createdAt),
                },
              ]}
            />
            {!viewing.builtIn && permissions.includes('system:project:list') && (
              <BackendServicesPanel
                key={viewing.id}
                projectId={viewing.id}
                permissions={permissions}
              />
            )}
          </>
        )}
      </Drawer>

      <EditProjectDialog
        project={editing}
        onClose={() => setEditing(undefined)}
        onSaved={() => actionRef.current?.reload()}
      />

      <GatewayRouteDialog project={routeTarget} onClose={() => setRouteTarget(undefined)} />

      <GenerateProjectDialog
        project={generating}
        onClose={() => setGenerating(undefined)}
        onQueued={async () => {
          await loadGeneratedProjectIds();
          actionRef.current?.reload();
        }}
      />

      <Drawer
        width="86vw"
        title={
          managing
            ? intl.formatMessage({ id: 'projects.accessTitle' }, { name: managing.projectName })
            : ''
        }
        open={Boolean(managing)}
        destroyOnHidden
        onClose={() => setManaging(undefined)}
      >
        {managing && (
          <>
            <Alert
              showIcon
              type={managing.builtIn ? 'warning' : 'info'}
              style={{ marginBottom: 16 }}
              message={intl.formatMessage(
                { id: 'projects.currentScope' },
                { name: managing.projectName, code: managing.projectCode },
              )}
              description={
                managing.builtIn
                  ? intl.formatMessage({ id: 'projects.systemScope' })
                  : intl.formatMessage({ id: 'projects.businessScope' })
              }
            />
            <Tabs
              items={
                [
                  permissions.includes('system:project:member')
                    ? {
                        key: 'members',
                        label: intl.formatMessage({
                          id: managing.builtIn
                            ? 'projects.systemMembers'
                            : 'projects.projectMembers',
                        }),
                        children: <MembersPanel project={managing} permissions={permissions} />,
                      }
                    : undefined,
                  permissions.includes('system:project:role') ||
                  permissions.includes('system:project:menu')
                    ? {
                        key: 'access',
                        label: intl.formatMessage({ id: 'projects.permissionMenus' }),
                        children: (
                          <Tabs
                            type="card"
                            items={
                              [
                                permissions.includes('system:project:menu')
                                  ? {
                                      key: 'menus',
                                      label: intl.formatMessage({
                                        id: managing.builtIn
                                          ? 'projects.platformMenus'
                                          : 'projects.businessMenus',
                                      }),
                                      children: (
                                        <MenusPanel project={managing} permissions={permissions} />
                                      ),
                                    }
                                  : undefined,
                                permissions.includes('system:project:role')
                                  ? {
                                      key: 'roles',
                                      label: intl.formatMessage({
                                        id: managing.builtIn
                                          ? 'projects.systemRoleGrant'
                                          : 'projects.roleGrant',
                                      }),
                                      children: (
                                        <RolesPanel project={managing} permissions={permissions} />
                                      ),
                                    }
                                  : undefined,
                              ].filter(Boolean) as any
                            }
                          />
                        ),
                      }
                    : undefined,
                  // 配置移交（ADR 0042）：只对业务项目开放；平台自身的配置随发布走迁移，不走移交包。
                  !managing.builtIn && permissions.includes('system:project-factory:generate')
                    ? {
                        key: 'handover',
                        label: intl.formatMessage({ id: 'projects.configHandover' }),
                        children: (
                          <ConfigHandoverPanel project={managing} permissions={permissions} />
                        ),
                      }
                    : undefined,
                ].filter(Boolean) as any
              }
            />
          </>
        )}
      </Drawer>
      <Drawer
        width="86vw"
        title={
          agentTarget
            ? intl.formatMessage({ id: 'agent.registry.title' }, { name: agentTarget.projectName })
            : ''
        }
        open={Boolean(agentTarget)}
        destroyOnHidden
        onClose={() => setAgentTarget(undefined)}
      >
        {agentTarget &&
          (agentTarget.builtIn ? (
            <SystemAgentCapabilitiesPanel key={agentTarget.id} />
          ) : (
            <AgentCapabilitiesPanel
              key={agentTarget.id}
              project={agentTarget}
              permissions={permissions}
            />
          ))}
      </Drawer>
    </PageContainer>
  );
}
