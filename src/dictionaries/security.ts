import type { DictionaryOption } from '@/dictionaries/types';

/**
 * 登录日志状态，对应后端 `security.login.status`（V20 + V21）。
 * 三个值都由 AuthService 真实写入：登录成功/失败，以及主动登出。
 */
export const LOGIN_LOG_STATUS_DICTIONARY: DictionaryOption[] = [
  { value: 'SUCCESS', label: '成功', color: 'success' },
  { value: 'FAILED', label: '失败', color: 'error' },
  { value: 'LOGOUT', label: '退出', color: 'default' },
];

/** 在线会话状态，对应后端 V20 seed 的 `security.session.status`。 */
export const ONLINE_SESSION_STATUS_DICTIONARY: DictionaryOption[] = [
  { value: 'ONLINE', label: '在线', color: 'success' },
  { value: 'REVOKED', label: '已撤销', color: 'default' },
];

/**
 * 操作审计的来源模块，对应后端 `security.audit.module`（V35）。
 *
 * 只对 module 做字典，operation 保持原始 code：module 是 12 个稳定取值，
 * operation 有 79 个且随每个新接口增长，给它建字典等于每加一个操作码都要同步加字典项，
 * 忘了就静默退回显示 code。
 */
export const AUDIT_MODULE_DICTIONARY: DictionaryOption[] = [
  { value: 'user', label: '用户管理', color: 'processing' },
  { value: 'role', label: '角色管理', color: 'processing' },
  { value: 'menu', label: '菜单管理', color: 'processing' },
  { value: 'org', label: '组织架构', color: 'processing' },
  { value: 'metadata', label: '配置与字典', color: 'purple' },
  { value: 'i18n', label: '国际化资源', color: 'purple' },
  { value: 'project', label: '项目管理', color: 'cyan' },
  { value: 'project-factory', label: '项目工厂', color: 'cyan' },
  { value: 'scheduler', label: '定时任务', color: 'cyan' },
  { value: 'gitlab', label: 'GitLab 配置', color: 'default' },
  { value: 'ai', label: '大模型配置', color: 'default' },
  { value: 'security', label: '安全运营', color: 'warning' },
];
