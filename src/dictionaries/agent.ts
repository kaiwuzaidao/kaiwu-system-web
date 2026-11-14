export const AGENT_CAPABILITY_STATUS_DICTIONARY = [
  { value: 'PENDING', label: '待审核', color: 'warning' },
  { value: 'APPROVED', label: '已批准', color: 'success' },
  { value: 'REVOKED', label: '已撤销', color: 'error' },
];
export const AGENT_CAPABILITY_CONNECTION_DICTIONARY = [
  { value: 'ONLINE', label: '在线', color: 'success' },
  { value: 'OFFLINE', label: '离线', color: 'default' },
];

export const AGENT_ACTION_STATUS_DICTIONARY = [
  { value: 'PENDING', label: '待确认', color: 'warning' },
  { value: 'EXECUTING', label: '执行中', color: 'processing' },
  { value: 'SUCCEEDED', label: '已创建', color: 'success' },
  { value: 'FAILED', label: '执行失败', color: 'error' },
  { value: 'CANCELLED', label: '已取消', color: 'default' },
  { value: 'EXPIRED', label: '已过期', color: 'default' },
  { value: 'REJECTED', label: '已拒绝', color: 'error' },
  { value: 'UNKNOWN', label: '结果待核验', color: 'warning' },
];

export const AGENT_REMOTE_ACTION_STATUS_DICTIONARY = [
  { value: 'PENDING', label: '待确认', color: 'warning' },
  { value: 'EXECUTING', label: '执行中', color: 'processing' },
  { value: 'SUCCEEDED', label: '已完成', color: 'success' },
  { value: 'FAILED', label: '执行失败', color: 'error' },
  { value: 'CANCELLED', label: '已取消', color: 'default' },
  { value: 'EXPIRED', label: '已过期', color: 'default' },
  { value: 'REJECTED', label: '已拒绝', color: 'error' },
  { value: 'UNKNOWN', label: '结果待核验', color: 'warning' },
];
