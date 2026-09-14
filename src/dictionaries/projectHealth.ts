/**
 * 只读项目体检结论（ADR 0012）。
 *
 * UNKNOWN 单独成项且用中性色：平台无法确认（仓库未绑定、GitLab 不可达）不等于不合格，
 * 用告警色会让用户把"看不到"误读成"有问题"。
 */
export const PROJECT_HEALTH_VERDICT_DICTIONARY = [
  { value: 'PASS', label: '通过', color: 'success' },
  { value: 'WARN', label: '待改进', color: 'warning' },
  { value: 'FAIL', label: '契约破坏', color: 'error' },
  { value: 'UNKNOWN', label: '无法确认', color: 'default' },
];
