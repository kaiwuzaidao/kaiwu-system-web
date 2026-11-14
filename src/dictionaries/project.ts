export const PROJECT_STATUS_DICTIONARY = [
  { value: 'ACTIVE', label: '已启用', color: 'green' },
  { value: 'DISABLED', label: '已停用', color: 'red' },
  { value: 'ARCHIVED', label: '已归档', color: 'default' },
];

export const PROJECT_MEMBER_STATUS_DICTIONARY = [
  { value: 'ACTIVE', label: '有效', color: 'green' },
  { value: 'DISABLED', label: '停用', color: 'red' },
];

/** V114 project.handover.status（ADR 0042）。 */
export const PROJECT_HANDOVER_STATUS_DICTIONARY = [
  { value: 'SUCCESS', label: '成功', color: 'success' },
  { value: 'FAILED', label: '失败', color: 'error' },
];

/** V114 project.handover.action（ADR 0042）。 */
export const PROJECT_HANDOVER_ACTION_DICTIONARY = [
  { value: 'CREATE', label: '新增', color: 'success' },
  { value: 'UPDATE', label: '更新', color: 'processing' },
  { value: 'REMOVED_AT_SOURCE', label: '源环境已删除', color: 'warning' },
  // V119 ADR 0044：资源下线后重新出现在清单里
  { value: 'REENABLE', label: '重新启用', color: 'processing' },
  { value: 'DRIFT', label: '仅目标环境有', color: 'default' },
];

/** V114 project.handover.resource（ADR 0042）。 */
export const PROJECT_HANDOVER_RESOURCE_DICTIONARY = [
  { value: 'DICT', label: '字典', color: 'default' },
  { value: 'DICT_ITEM', label: '字典项', color: 'default' },
  { value: 'CONFIG', label: '参数配置', color: 'default' },
  { value: 'MENU', label: '菜单', color: 'default' },
  { value: 'I18N', label: '国际化资源', color: 'default' },
  { value: 'ROLE', label: '角色', color: 'default' },
  { value: 'ROLE_GRANT', label: '角色授权', color: 'default' },
  // V115 定时任务（ADR 0042）
  { value: 'JOB', label: '定时任务', color: 'default' },
  // V119 数据范围（ADR 0044）
  { value: 'DATA_SCOPE', label: '受控资源', color: 'default' },
  { value: 'ROLE_DATA_SCOPE', label: '角色数据范围', color: 'default' },
];

/** V119 project.data_scope.type（ADR 0044）：角色在受控资源上的可见范围。 */
export const PROJECT_DATA_SCOPE_TYPE_DICTIONARY = [
  { value: 'ALL', label: '全部', color: 'warning' },
  { value: 'DEPT_AND_CHILD', label: '本部门及下级', color: 'processing' },
  { value: 'DEPT', label: '本部门', color: 'processing' },
  { value: 'SELF', label: '仅本人', color: 'default' },
  { value: 'CUSTOM_DEPT', label: '指定部门', color: 'processing' },
];
