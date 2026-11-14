import { apiRequest } from '@/services/auth';

import type { EffectiveProjectConfig } from './projectConfigTypes';
export type { EffectiveProjectConfig } from './projectConfigTypes';

/** 仅返回当前有效成员可读的非敏感生效配置；宿主校验登记来源必须属于本项目。 */
export function queryEffectiveProjectConfigs(projectId: string) {
  return apiRequest<EffectiveProjectConfig[]>(
    `/api/current/projects/${encodeURIComponent(projectId)}/configs`,
  );
}

export type PlatformProject = {
  id: string;
  projectCode: string;
  projectName: string;
  description?: string;
  status: string;
  builtIn: boolean;
  createdBy: string;
  packageName: string;
  repositoryUrl?: string;
  gitlabProjectId?: string;
  defaultBranch: string;
  backendUrl?: string;
  backendLabel?: string;
  /** Gateway PROJECT 路由的上游地址；与 backendUrl（浏览器后台入口）不是同一件事。 */
  serviceUrl?: string;
  createdAt: string;
  updatedAt: string;
};

export type ProjectPage = {
  current: number;
  size: number;
  total: number;
  records: PlatformProject[];
};

export type ProjectRole = {
  id: string;
  projectId: string;
  roleCode: string;
  roleName: string;
  description?: string;
  status: string;
  builtIn: boolean;
  menuIds: string[];
  createdAt: string;
  updatedAt: string;
};

export type ProjectMember = {
  userId: string;
  username: string;
  displayName: string;
  status: string;
  roleIds: string[];
  createdAt: string;
  updatedAt: string;
};

export type ProjectMenu = {
  id: string;
  projectId: string;
  parentId?: string;
  menuName: string;
  menuNameKey?: string;
  menuType: string;
  routePath?: string;
  componentPath?: string;
  permissionCode?: string;
  icon?: string;
  sortNo: number;
  visible: boolean;
  status: string;
  children: ProjectMenu[];
};

export type ProjectMenuInput = {
  /** 引用的国际化资源 key；多语言只走这条路（ADR 0015） */
  menuNameKey?: string;
  parentId?: string;
  menuName: string;
  menuNameI18n?: string;
  menuNameTranslations?: Record<string, string>;
  menuType: 'DIR' | 'MENU' | 'BUTTON';
  routePath?: string;
  componentPath?: string;
  permissionCode?: string;
  icon?: string;
  sortNo: number;
  visible: boolean;
};

export function queryCurrentProjects() {
  return apiRequest<PlatformProject[]>('/api/current/projects');
}

/** 取该项目的 Gateway 显式路由片段，供运维复制进受管配置。 */
export function queryGatewayRoute(projectId: string) {
  return apiRequest<string>(`/api/projects/${projectId}/gateway-route`);
}

export function queryProjects(params: {
  current?: number;
  pageSize?: number;
  keyword?: string;
  /** 项目状态筛选（ACTIVE / DISABLED / ARCHIVED）；不传不过滤。 */
  status?: string;
  /** 只看平台内置或业务项目；不传不过滤。 */
  builtIn?: boolean;
}) {
  const search = new URLSearchParams({
    current: String(params.current ?? 1),
    size: String(params.pageSize ?? 10),
  });
  if (params.keyword) search.set('keyword', params.keyword);
  if (params.status) search.set('status', params.status);
  if (params.builtIn !== undefined) search.set('builtIn', String(params.builtIn));
  return apiRequest<ProjectPage>(`/api/projects?${search.toString()}`);
}

export function createProject(input: {
  projectCode: string;
  projectName: string;
  description?: string;
  packageName?: string;
}) {
  return apiRequest<PlatformProject>('/api/projects', jsonRequest('POST', input));
}

export function updateProject(
  id: string,
  input: {
    projectName: string;
    description?: string;
    packageName: string;
    repositoryUrl?: string;
    gitlabProjectId?: string;
    defaultBranch: string;
    backendUrl?: string;
    backendLabel?: string;
    serviceUrl?: string;
  },
) {
  return apiRequest<PlatformProject>(`/api/projects/${id}`, jsonRequest('PUT', input));
}

export function updateProjectStatus(id: string, status: string) {
  return apiRequest<PlatformProject>(`/api/projects/${id}/status`, jsonRequest('PUT', { status }));
}

export function queryProjectMembers(projectId: string) {
  return apiRequest<ProjectMember[]>(`/api/projects/${projectId}/members`);
}

export function saveProjectMember(
  projectId: string,
  userId: string,
  input: { roleIds: string[]; status: string },
) {
  return apiRequest<ProjectMember[]>(
    `/api/projects/${projectId}/members/${userId}`,
    jsonRequest('PUT', input),
  );
}

export function deleteProjectMember(projectId: string, userId: string) {
  return apiRequest<void>(`/api/projects/${projectId}/members/${userId}`, {
    method: 'DELETE',
  });
}

export function queryProjectRoles(projectId: string) {
  return apiRequest<ProjectRole[]>(`/api/projects/${projectId}/roles`);
}

export function createProjectRole(
  projectId: string,
  input: { roleCode: string; roleName: string; description?: string },
) {
  return apiRequest<ProjectRole>(`/api/projects/${projectId}/roles`, jsonRequest('POST', input));
}

export function updateProjectRole(
  projectId: string,
  roleId: string,
  input: { roleName: string; description?: string },
) {
  return apiRequest<ProjectRole>(
    `/api/projects/${projectId}/roles/${roleId}`,
    jsonRequest('PUT', input),
  );
}

export function updateProjectRoleStatus(projectId: string, roleId: string, status: string) {
  return apiRequest<ProjectRole>(
    `/api/projects/${projectId}/roles/${roleId}/status`,
    jsonRequest('PUT', { status }),
  );
}

export function grantProjectRoleMenus(projectId: string, roleId: string, menuIds: string[]) {
  return apiRequest<ProjectRole>(
    `/api/projects/${projectId}/roles/${roleId}/menus`,
    jsonRequest('PUT', { menuIds }),
  );
}

/** 数据范围类型，取值固定（docs/DATA_SCOPE.md §3.1），显示文案走字典 project.data_scope.type。 */
export type DataScopeType = 'ALL' | 'DEPT_AND_CHILD' | 'DEPT' | 'SELF' | 'CUSTOM_DEPT';

/** 角色在一个受控资源上的数据范围；未配置的资源 scope 为 SELF、configured 为 false。 */
export type RoleDataScopeItem = {
  resourceCode: string;
  resourceName: string;
  allowedScopes: DataScopeType[];
  scope: DataScopeType;
  configured: boolean;
  includeChild: boolean;
  deptIds: string[];
};

export type RoleDataScopes = {
  roleId: string;
  roleCode: string;
  /** 内置 project-admin 只读，固定全部。 */
  readOnly: boolean;
  items: RoleDataScopeItem[];
};

export function queryRoleDataScopes(projectId: string, roleId: string) {
  return apiRequest<RoleDataScopes>(`/api/projects/${projectId}/roles/${roleId}/data-scopes`);
}

/** 覆盖保存：请求里没有的资源回到仅本人。 */
export function saveRoleDataScopes(
  projectId: string,
  roleId: string,
  items: Pick<RoleDataScopeItem, 'resourceCode' | 'scope' | 'includeChild' | 'deptIds'>[],
) {
  return apiRequest<RoleDataScopes>(
    `/api/projects/${projectId}/roles/${roleId}/data-scopes`,
    jsonRequest('PUT', { items }),
  );
}

export function deleteProjectRole(projectId: string, roleId: string) {
  return apiRequest<void>(`/api/projects/${projectId}/roles/${roleId}`, {
    method: 'DELETE',
  });
}

export function queryProjectMenus(projectId: string) {
  return apiRequest<ProjectMenu[]>(`/api/projects/${projectId}/menus`);
}

export function createProjectMenu(projectId: string, input: ProjectMenuInput) {
  return apiRequest<ProjectMenu>(`/api/projects/${projectId}/menus`, jsonRequest('POST', input));
}

export function updateProjectMenu(projectId: string, menuId: string, input: ProjectMenuInput) {
  return apiRequest<ProjectMenu>(
    `/api/projects/${projectId}/menus/${menuId}`,
    jsonRequest('PUT', input),
  );
}

export function updateProjectMenuStatus(projectId: string, menuId: string, status: string) {
  return apiRequest<ProjectMenu>(
    `/api/projects/${projectId}/menus/${menuId}/status`,
    jsonRequest('PUT', { status }),
  );
}

export function deleteProjectMenu(projectId: string, menuId: string) {
  return apiRequest<void>(`/api/projects/${projectId}/menus/${menuId}`, {
    method: 'DELETE',
  });
}

function jsonRequest(method: string, input: unknown): RequestInit {
  return {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  };
}

/** 项目显式后端服务登记及其可审核路由片段。 */
export type BackendService = { serviceCode: string; serviceUrl: string | null; status: string };
export type GatewayRoutes = { fragments: { serviceCode: string; fragment: string }[] };
export function queryBackendServices(projectId: string) {
  return apiRequest<BackendService[]>(`/api/projects/${projectId}/backend-services`);
}
export function createBackendService(
  projectId: string,
  input: { serviceCode: string; serviceUrl: string },
) {
  return apiRequest<BackendService>(
    `/api/projects/${projectId}/backend-services`,
    jsonRequest('POST', input),
  );
}
export function updateBackendService(
  projectId: string,
  serviceCode: string,
  serviceUrl: string | null,
) {
  return apiRequest<BackendService>(
    `/api/projects/${projectId}/backend-services/${serviceCode}`,
    jsonRequest('PUT', { serviceUrl }),
  );
}
export function setBackendServiceStatus(projectId: string, serviceCode: string, status: string) {
  return apiRequest<BackendService>(
    `/api/projects/${projectId}/backend-services/${serviceCode}/status`,
    jsonRequest('PUT', { status }),
  );
}
export function queryGatewayRoutes(projectId: string) {
  return apiRequest<GatewayRoutes>(`/api/projects/${projectId}/gateway-routes`);
}
