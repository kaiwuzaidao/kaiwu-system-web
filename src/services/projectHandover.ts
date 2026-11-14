import { apiRequest } from '@/services/auth';

/** 移交包（ADR 0042）：项目配置在导出时刻的全量快照，文件与业务仓 `kaiwu/` 目录同格式。 */
export type HandoverPackage = {
  formatVersion: number;
  projectCode: string;
  source: { host?: string; exportedBy?: string; exportedAt?: string };
  digest: string;
  stats: Record<string, number>;
  warnings: string[];
  files: Record<string, string>;
};

/** 计划条目的类别：NORMAL 随计划执行，ACCESS 需勾选导入授权，DELETE 需逐项勾选。 */
export type HandoverCategory = 'NORMAL' | 'ACCESS' | 'DELETE';

export type HandoverChange = {
  resource: string;
  key: string;
  action: string;
  detail: string;
  category: HandoverCategory;
};

export type HandoverPlan = {
  planHash: string;
  changes: HandoverChange[];
  missingPermissions: string[];
  hasBaseline: boolean;
  alreadyApplied?: { handoverId: string; appliedAt: string; operatorId: string } | null;
};

export type HandoverRecord = {
  id: string;
  status: string;
  packageDigest?: string;
  sourceHost?: string;
  sourceExportedBy?: string;
  sourceExportedAt?: string;
  operatorId: string;
  appliedAccess: boolean;
  changeCount: number;
  deleteCount: number;
  failureReason?: string;
  createdAt: string;
  changes: HandoverChange[];
};

/** 导出移交包；只读。 */
export function exportProjectConfig(projectId: string) {
  return apiRequest<HandoverPackage>(`/api/projects/${projectId}/manifest/export`);
}

/** 请求体：移交包文件加来源信息；执行时再带计划哈希与勾选。 */
function body(pkg: HandoverPackage, extra: Record<string, unknown> = {}) {
  return JSON.stringify({
    files: pkg.files,
    packageDigest: pkg.digest,
    sourceHost: pkg.source?.host,
    sourceExportedBy: pkg.source?.exportedBy,
    sourceExportedAt: pkg.source?.exportedAt,
    ...extra,
  });
}

const JSON_HEADERS = { 'Content-Type': 'application/json' };

/** 计算导入计划，不改变数据。 */
export function planProjectConfig(projectId: string, pkg: HandoverPackage) {
  return apiRequest<HandoverPlan>(`/api/projects/${projectId}/manifest/plan`, {
    method: 'POST',
    headers: JSON_HEADERS,
    body: body(pkg),
  });
}

/** 按计划哈希执行；授权与删除只执行勾选的部分。 */
export function applyProjectConfig(
  projectId: string,
  pkg: HandoverPackage,
  planHash: string,
  applyAccess: boolean,
  deleteKeys: string[],
) {
  return apiRequest<HandoverPlan>(`/api/projects/${projectId}/manifest/apply`, {
    method: 'POST',
    headers: JSON_HEADERS,
    body: body(pkg, { planHash, applyAccess, deleteKeys }),
  });
}

/** 项目的移交记录，最新在前。 */
export function queryHandovers(projectId: string) {
  return apiRequest<HandoverRecord[]>(`/api/projects/${projectId}/manifest/handovers`);
}

/** 一条移交记录及其条目明细。 */
export function queryHandover(projectId: string, handoverId: string) {
  return apiRequest<HandoverRecord>(`/api/projects/${projectId}/manifest/handovers/${handoverId}`);
}

/** 删除勾选的标识，与后端 `deleteKeys` 约定一致：资源|标识。 */
export function deleteKeyOf(change: Pick<HandoverChange, 'resource' | 'key'>) {
  return `${change.resource}|${change.key}`;
}
