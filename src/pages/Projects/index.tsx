import { PlusOutlined } from '@ant-design/icons';
import { history, useIntl } from '@umijs/max';
import {
  PageContainer,
  ProTable,
  type ActionType,
  type ProColumns,
} from '@ant-design/pro-components';
import { Alert, App, Drawer, Popconfirm, Space, Tabs, Tag } from 'antd';
import { useEffect, useRef, useState } from 'react';
import AuthButton from '@/components/AuthButton';
import DictTag from '@/components/DictTag';
import HealthDrawer from './HealthDrawer';
import EditProjectDialog from './components/EditProjectDialog';
import GatewayRouteDialog from './components/GatewayRouteDialog';
import GenerateProjectDialog from './components/GenerateProjectDialog';
import MembersPanel from './components/MembersPanel';
import MenusPanel from './components/MenusPanel';
import RepositoryDeliveryDialog from './components/RepositoryDeliveryDialog';
import RolesPanel from './components/RolesPanel';
import { queryCurrentUser, type CurrentUser } from '@/services/auth';
import { queryProjectGenerations, type ProjectGeneration } from '@/services/projectFactory';
import { queryProjects, updateProjectStatus, type PlatformProject } from '@/services/projects';
import { useLocaleFormatters } from '@/utils/format';
import { openProjectEntry, projectWorkspacePath, readProjectOpenMode } from '@/utils/projectEntry';

export default function ProjectsPage() {
  const { message } = App.useApp();
  const intl = useIntl();
  const format = useLocaleFormatters();
  const actionRef = useRef<ActionType>();
  const [currentUser, setCurrentUser] = useState<CurrentUser>();
  const [editing, setEditing] = useState<PlatformProject>();
  const [managing, setManaging] = useState<PlatformProject>();
  const [routeTarget, setRouteTarget] = useState<PlatformProject | undefined>();
  const [healthTarget, setHealthTarget] = useState<PlatformProject>();
  const [repositoryProject, setRepositoryProject] = useState<PlatformProject>();
  const [repositoryTask, setRepositoryTask] = useState<ProjectGeneration>();
  const [repositoryLoading, setRepositoryLoading] = useState(false);
  const [generating, setGenerating] = useState<PlatformProject>();
  const [generatedProjectIds, setGeneratedProjectIds] = useState<Set<string>>(new Set());
  const permissions = currentUser?.permissions ?? [];

  useEffect(() => {
    void queryCurrentUser().then(setCurrentUser);
  }, []);

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
      setGeneratedProjectIds(new Set(tasks.map((task) => task.projectId)));
    } catch {
      // 生成任务读取失败不应阻塞项目列表；入口暂不展示，刷新后重试。
    }
  };

  useEffect(() => {
    void loadGeneratedProjectIds();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser]);

  const openRepositoryDelivery = async (project: PlatformProject) => {
    setRepositoryProject(project);
    setRepositoryTask(undefined);
    setRepositoryLoading(true);
    try {
      const generations = await queryProjectGenerations(project.id);
      setRepositoryTask(generations[0]);
    } catch (reason) {
      setRepositoryProject(undefined);
      const detail =
        reason instanceof Error
          ? reason.message
          : intl.formatMessage({ id: 'projects.deliveryLoadFailed' });
      void message.error(detail);
    } finally {
      setRepositoryLoading(false);
    }
  };

  const columns: ProColumns<PlatformProject>[] = [
    {
      title: intl.formatMessage({ id: 'projects.keyword' }),
      dataIndex: 'keyword',
      hideInTable: true,
      fieldProps: { placeholder: intl.formatMessage({ id: 'projects.keywordPlaceholder' }) },
    },
    {
      title: intl.formatMessage({ id: 'projects.project' }),
      dataIndex: 'projectCode',
      search: false,
      render: (_, record) => (
        <Space direction="vertical" size={0}>
          <Space size={6}>
            <span style={{ fontWeight: 500 }}>{record.projectName}</span>
            {record.builtIn && (
              <Tag color="processing" style={{ margin: 0 }}>
                {intl.formatMessage({ id: 'projects.builtIn' })}
              </Tag>
            )}
          </Space>
          <span
            style={{
              fontSize: 12,
              color: 'rgba(0,0,0,0.45)',
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
            }}
          >
            {record.projectCode}
          </span>
        </Space>
      ),
    },
    {
      title: intl.formatMessage({ id: 'projects.description' }),
      dataIndex: 'description',
      search: false,
      renderText: (value) => value || '-',
    },
    {
      title: intl.formatMessage({ id: 'projects.legacyRepo' }),
      dataIndex: 'repositoryUrl',
      search: false,
      render: (_, record) =>
        record.repositoryUrl ? (
          <a href={record.repositoryUrl} target="_blank" rel="noreferrer">
            {intl.formatMessage({ id: 'projects.openRepo' })}
          </a>
        ) : (
          '-'
        ),
    },
    {
      title: intl.formatMessage({ id: 'projects.backend' }),
      dataIndex: 'backendUrl',
      search: false,
      render: (_, record) =>
        record.backendUrl ? (
          <a
            // href 指向平台宿主页而非 backendUrl：中键/新标签页打开也要走同一条
            // 链路，直达业务前端的顶层页面拿不到令牌。
            href={projectWorkspacePath(record.id)}
            onClick={(event) => {
              event.preventDefault();
              openProjectEntry(record.id, readProjectOpenMode());
            }}
          >
            {record.backendLabel || intl.formatMessage({ id: 'projects.openBackend' })}
          </a>
        ) : (
          '-'
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
          <Tag
            style={{
              margin: 0,
              background: 'transparent',
              border: 'none',
              padding: 0,
              fontSize: 12,
              fontVariantNumeric: 'tabular-nums',
              color: 'rgba(0,0,0,0.65)',
            }}
          >
            {format.dateTime(record.createdAt)}
          </Tag>
        ) : (
          '-'
        ),
    },
    {
      title: intl.formatMessage({ id: 'projects.actions' }),
      valueType: 'option',
      render: (_, record) => (
        <Space wrap>
          <AuthButton
            type="link"
            size="small"
            permission="system:project:update"
            permissions={permissions}
            onClick={() => setEditing(record)}
          >
            {intl.formatMessage({ id: 'projects.edit' })}
          </AuthButton>
          {record.createdBy === currentUser?.id && (
            <AuthButton
              type="link"
              size="small"
              permission="system:project-factory:list"
              permissions={permissions}
              onClick={() => void openRepositoryDelivery(record)}
            >
              {intl.formatMessage({ id: 'projects.delivery' })}
            </AuthButton>
          )}
          {/* 体检只对生成过代码的业务项目有意义：内置 system 有真实源码，不走项目工厂交付。 */}
          {!record.builtIn && (
            <AuthButton
              type="link"
              size="small"
              permission="system:project:health"
              permissions={permissions}
              onClick={() => setHealthTarget(record)}
            >
              {intl.formatMessage({ id: 'projectHealth.entry' })}
            </AuthButton>
          )}
          {/* 网关路由只对业务项目有意义：内置 system 的路由由平台自身配置管理。 */}
          {!record.builtIn && (
            <AuthButton
              type="link"
              size="small"
              permission="system:project:list"
              permissions={permissions}
              onClick={() => setRouteTarget(record)}
            >
              {intl.formatMessage({ id: 'projects.gatewayRoute' })}
            </AuthButton>
          )}
          {/* 项目还没有第一版代码时才出现：动作放在项目上，不再绕道项目工厂。 */}
          {!record.builtIn && record.status === 'ACTIVE' && !generatedProjectIds.has(record.id) && (
            <AuthButton
              type="link"
              size="small"
              permission="system:project-factory:generate"
              permissions={permissions}
              onClick={() => setGenerating(record)}
            >
              {intl.formatMessage({ id: 'projects.generateFirst' })}
            </AuthButton>
          )}
          {(permissions.includes('system:project:member') ||
            permissions.includes('system:project:role') ||
            permissions.includes('system:project:menu')) && (
            <AuthButton
              type="link"
              size="small"
              permission={
                permissions.includes('system:project:member')
                  ? 'system:project:member'
                  : permissions.includes('system:project:role')
                    ? 'system:project:role'
                    : 'system:project:menu'
              }
              permissions={permissions}
              onClick={() => setManaging(record)}
            >
              {intl.formatMessage({ id: 'projects.accessCenter' })}
            </AuthButton>
          )}
          <Popconfirm
            title={intl.formatMessage({
              id: record.status === 'ACTIVE' ? 'projects.disableConfirm' : 'projects.enableConfirm',
            })}
            disabled={
              record.builtIn ||
              record.status === 'ARCHIVED' ||
              !permissions.includes('system:project:status')
            }
            onConfirm={async () => {
              await updateProjectStatus(
                record.id,
                record.status === 'ACTIVE' ? 'DISABLED' : 'ACTIVE',
              );
              void message.success(intl.formatMessage({ id: 'projects.statusUpdated' }));
              actionRef.current?.reload();
            }}
          >
            <AuthButton
              type="link"
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
              await updateProjectStatus(record.id, 'ARCHIVED');
              void message.success(intl.formatMessage({ id: 'projects.archived' }));
              actionRef.current?.reload();
            }}
          >
            <AuthButton
              type="link"
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
      ),
    },
  ];

  return (
    <PageContainer
      title={intl.formatMessage({ id: 'projects.title' })}
      subTitle={intl.formatMessage({ id: 'projects.subtitle' })}
    >
      <ProTable<PlatformProject>
        sticky
        rowKey="id"
        actionRef={actionRef}
        columns={columns}
        request={async (params) => {
          const page = await queryProjects({
            current: params.current,
            pageSize: params.pageSize,
            keyword: params.keyword as string | undefined,
          });
          return { data: page.records, total: page.total, success: true };
        }}
        search={{ labelWidth: 'auto' }}
        options={{ reload: true, density: false, setting: false, fullScreen: false }}
        toolBarRender={() => [
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
      />

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

      <RepositoryDeliveryDialog
        project={repositoryProject}
        task={repositoryTask}
        loading={repositoryLoading}
        canPush={permissions.includes('system:project-factory:push')}
        onClose={() => {
          setRepositoryProject(undefined);
          setRepositoryTask(undefined);
        }}
        onGenerate={setGenerating}
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
                ].filter(Boolean) as any
              }
            />
          </>
        )}
      </Drawer>
      <HealthDrawer
        projectId={healthTarget?.id}
        projectName={healthTarget?.projectName}
        permissions={permissions}
        onClose={() => setHealthTarget(undefined)}
      />
    </PageContainer>
  );
}
