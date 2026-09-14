import { apiRequest } from '@/services/auth';

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

export function queryProjects(params: { current?: number; pageSize?: number; keyword?: string }) {
  const search = new URLSearchParams({
    current: String(params.current ?? 1),
    size: String(params.pageSize ?? 10),
  });
  if (params.keyword) search.set('keyword', params.keyword);
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
