import { apiRequest } from '@/services/auth';

/** 单项检查结论。verdict 走 `project.health.verdict` 字典展示。 */
export type ProjectHealthCheck = {
  code: string;
  name: string;
  verdict: string;
  detail: string;
};

/** 体检报告（ADR 0012）。只含结论与版本号，不含任何被读取的文件内容。 */
export type ProjectHealth = {
  projectId: string;
  /** 项目是否允许平台只读体检 */
  enabled: boolean;
  verdict: string;
  /** 为空表示从未体检过 */
  checkedAt?: string | null;
  checks: ProjectHealthCheck[];
};

/** 读取体检状态。从未体检过也会返回视图，`checkedAt` 为空，供开关显示真实状态。 */
export async function queryProjectHealth(projectId: string): Promise<ProjectHealth> {
  return apiRequest<ProjectHealth>(`/api/projects/${projectId}/health-check`);
}

/** 触发一次体检。平台只读业务仓库的四个契约面文件，不写入、不阻断。 */
export async function runProjectHealthCheck(projectId: string): Promise<ProjectHealth> {
  return apiRequest<ProjectHealth>(`/api/projects/${projectId}/health-check`, { method: 'POST' });
}

/** 关闭后平台不再访问该项目仓库。 */
export async function setProjectHealthEnabled(projectId: string, enabled: boolean): Promise<void> {
  await apiRequest<void>(`/api/projects/${projectId}/health-check/enabled?enabled=${enabled}`, {
    method: 'POST',
  });
}
