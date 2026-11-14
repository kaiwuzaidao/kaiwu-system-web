import type { RoleDataScopeItem } from '@/services/projects';

/** 单个资源最多可勾选的部门数，与后端校验一致（docs/DATA_SCOPE.md §4.5、§8）。 */
export const MAX_CUSTOM_DEPARTMENTS = 128;

/** 快照里 ds 的字节上限（docs/DATA_SCOPE.md §4.5），超过时用户无法进入项目。 */
const DATA_SCOPE_LIMIT_BYTES = 6144;

/** 把当前编辑结果转成保存请求：仅本人等价于未配置，不提交。 */
export function toSaveItems(items: RoleDataScopeItem[]) {
  return items
    .filter((item) => item.scope !== 'SELF')
    .map((item) => ({
      resourceCode: item.resourceCode,
      scope: item.scope,
      includeChild: item.scope === 'CUSTOM_DEPT' && item.includeChild,
      deptIds: item.scope === 'CUSTOM_DEPT' ? item.deptIds : [],
    }));
}

/** 编辑结果与已保存状态是否有差异（未配置与仅本人视为相同）。 */
export function isDirty(current: RoleDataScopeItem[], saved: RoleDataScopeItem[]) {
  return JSON.stringify(toSaveItems(current)) !== JSON.stringify(toSaveItems(saved));
}

/** CUSTOM_DEPT 勾了部门却没选，保存会被后端 400，提前拦下。 */
export function hasIncompleteCustomDept(items: RoleDataScopeItem[]) {
  return items.some((item) => item.scope === 'CUSTOM_DEPT' && item.deptIds.length === 0);
}

/**
 * 粗估一个同时拥有这些勾选的用户的 ds 字节数：部门字典里每个 19 位 ID 约 22 字节，
 * 每次被资源引用约 4 字节。只用于提示，不阻止保存——以运行时结果为准。
 */
export function estimateDataScopeBytes(items: RoleDataScopeItem[]) {
  const custom = items.filter((item) => item.scope === 'CUSTOM_DEPT');
  if (custom.length === 0) return 0;
  const dictionary = new Set(custom.flatMap((item) => item.deptIds));
  const references = custom.reduce((sum, item) => sum + item.deptIds.length, 0);
  return 120 + dictionary.size * 22 + references * 4 + custom.length * 40;
}

/** 估算值是否超过运行时上限。 */
export function exceedsDataScopeLimit(items: RoleDataScopeItem[]) {
  return estimateDataScopeBytes(items) > DATA_SCOPE_LIMIT_BYTES;
}
