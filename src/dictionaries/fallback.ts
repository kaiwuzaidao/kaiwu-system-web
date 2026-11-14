import {
  AGENT_CAPABILITY_STATUS_DICTIONARY,
  AGENT_ACTION_STATUS_DICTIONARY,
  AGENT_REMOTE_ACTION_STATUS_DICTIONARY,
  AGENT_CAPABILITY_CONNECTION_DICTIONARY,
} from './agent';
import type { DictionaryOption } from '@/dictionaries/types';
import { AI_TEST_STATUS_DICTIONARY } from './ai';
import { COMMON_BOOLEAN_ENABLED_DICTIONARY, TAG_COLOR_DICTIONARY } from './common';
import { MENU_TYPE_DICTIONARY } from './menu';
import { CONFIG_VALUE_TYPE_DICTIONARY, METADATA_STATUS_DICTIONARY } from './metadata';
import { NOTIFICATION_TYPE_DICTIONARY } from './notification';
import {
  PROJECT_DATA_SCOPE_TYPE_DICTIONARY,
  PROJECT_HANDOVER_ACTION_DICTIONARY,
  PROJECT_HANDOVER_RESOURCE_DICTIONARY,
  PROJECT_HANDOVER_STATUS_DICTIONARY,
  PROJECT_MEMBER_STATUS_DICTIONARY,
  PROJECT_STATUS_DICTIONARY,
} from './project';
import {
  PROJECT_GENERATION_MODE_DICTIONARY,
  PROJECT_GENERATION_STATUS_DICTIONARY,
} from './projectFactory';
import {
  AUDIT_MODULE_DICTIONARY,
  LOGIN_LOG_STATUS_DICTIONARY,
  ONLINE_SESSION_STATUS_DICTIONARY,
  SESSION_SOURCE_DICTIONARY,
} from './security';
import { SCHEDULER_EXECUTION_STATUS_DICTIONARY } from './scheduler';
import { STORAGE_BINDING_STATUS_DICTIONARY, STORAGE_PROVIDER_TYPE_DICTIONARY } from './storage';
import { USER_STATUS_DICTIONARY } from './user';

/**
 * dictCode → 本地静态字典的映射；后端字典未加载或加载失败时兜底。
 *
 * 每个 key 都必须在后端有对应 seed，否则页面看着在用字典、实际永远是硬编码。
 * 一致性由 `pnpm check:dict` 校验（比对 kaiwu-system-service/sql 里的 dict_code），
 * 新增字典时前后端两处必须同批提交。
 */
export const DICT_FALLBACK: Record<string, DictionaryOption[]> = {
  'agent.capability.status': AGENT_CAPABILITY_STATUS_DICTIONARY,
  'agent.action.status': AGENT_ACTION_STATUS_DICTIONARY,
  'agent.remote_action.status': AGENT_REMOTE_ACTION_STATUS_DICTIONARY,
  'agent.capability.connection': AGENT_CAPABILITY_CONNECTION_DICTIONARY,
  // V8
  'common.status': METADATA_STATUS_DICTIONARY,
  'common.boolean_enabled': COMMON_BOOLEAN_ENABLED_DICTIONARY,
  // V25
  'common.tag_color': TAG_COLOR_DICTIONARY,
  // V17
  'user.status': USER_STATUS_DICTIONARY,
  'project.status': PROJECT_STATUS_DICTIONARY,
  'project.member.status': PROJECT_MEMBER_STATUS_DICTIONARY,
  'platform.menu.type': MENU_TYPE_DICTIONARY,
  'config.value.type': CONFIG_VALUE_TYPE_DICTIONARY,
  'ai.test.status': AI_TEST_STATUS_DICTIONARY,
  'project.generation.mode': PROJECT_GENERATION_MODE_DICTIONARY,
  'project.generation.status': PROJECT_GENERATION_STATUS_DICTIONARY,
  // V18
  'notification.type': NOTIFICATION_TYPE_DICTIONARY,
  // V20
  'security.audit.module': AUDIT_MODULE_DICTIONARY,
  'security.login.status': LOGIN_LOG_STATUS_DICTIONARY,
  'security.session.status': ONLINE_SESSION_STATUS_DICTIONARY,
  // CLI 设备授权（ADR 0035）
  'security.session.source': SESSION_SOURCE_DICTIONARY,
  // V22
  'scheduler.execution.status': SCHEDULER_EXECUTION_STATUS_DICTIONARY,
  // 只读项目体检（ADR 0012）
  // V107 对象存储（ADR 0039）
  'storage.provider.type': STORAGE_PROVIDER_TYPE_DICTIONARY,
  'storage.binding.status': STORAGE_BINDING_STATUS_DICTIONARY,
  // V114 配置移交（ADR 0042）
  'project.handover.status': PROJECT_HANDOVER_STATUS_DICTIONARY,
  'project.handover.action': PROJECT_HANDOVER_ACTION_DICTIONARY,
  'project.handover.resource': PROJECT_HANDOVER_RESOURCE_DICTIONARY,
  // V119 数据范围（ADR 0044）
  'project.data_scope.type': PROJECT_DATA_SCOPE_TYPE_DICTIONARY,
};
