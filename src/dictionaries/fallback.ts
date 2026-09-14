import type { DictionaryOption } from '@/dictionaries/types';
import { AI_TEST_STATUS_DICTIONARY } from './ai';
import { COMMON_BOOLEAN_ENABLED_DICTIONARY, TAG_COLOR_DICTIONARY } from './common';
import { GITLAB_TEST_STATUS_DICTIONARY } from './gitlab';
import { MENU_TYPE_DICTIONARY } from './menu';
import { CONFIG_VALUE_TYPE_DICTIONARY, METADATA_STATUS_DICTIONARY } from './metadata';
import { NOTIFICATION_TYPE_DICTIONARY } from './notification';
import { PROJECT_MEMBER_STATUS_DICTIONARY, PROJECT_STATUS_DICTIONARY } from './project';
import { PROJECT_HEALTH_VERDICT_DICTIONARY } from './projectHealth';
import {
  PROJECT_GENERATION_MODE_DICTIONARY,
  PROJECT_GENERATION_STATUS_DICTIONARY,
  PROJECT_REPOSITORY_PUSH_STATUS_DICTIONARY,
} from './projectFactory';
import {
  LOGIN_LOG_STATUS_DICTIONARY,
  ONLINE_SESSION_STATUS_DICTIONARY,
  AUDIT_MODULE_DICTIONARY,
} from './security';
import { SCHEDULER_EXECUTION_STATUS_DICTIONARY } from './scheduler';
import { USER_STATUS_DICTIONARY } from './user';

/**
 * dictCode → 本地静态字典的映射；后端字典未加载或加载失败时兜底。
 *
 * 每个 key 都必须在后端有对应 seed，否则页面看着在用字典、实际永远是硬编码。
 * 一致性由 `pnpm check:dict` 校验（比对 kaiwu-system-service/sql 里的 dict_code），
 * 新增字典时前后端两处必须同批提交。
 */
export const DICT_FALLBACK: Record<string, DictionaryOption[]> = {
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
  'gitlab.test.status': GITLAB_TEST_STATUS_DICTIONARY,
  'project.generation.mode': PROJECT_GENERATION_MODE_DICTIONARY,
  'project.generation.status': PROJECT_GENERATION_STATUS_DICTIONARY,
  'project.repository.push.status': PROJECT_REPOSITORY_PUSH_STATUS_DICTIONARY,
  // V18
  'notification.type': NOTIFICATION_TYPE_DICTIONARY,
  // V20
  'security.audit.module': AUDIT_MODULE_DICTIONARY,
  'security.login.status': LOGIN_LOG_STATUS_DICTIONARY,
  'security.session.status': ONLINE_SESSION_STATUS_DICTIONARY,
  // V22
  'scheduler.execution.status': SCHEDULER_EXECUTION_STATUS_DICTIONARY,
  // 只读项目体检（ADR 0012）
  'project.health.verdict': PROJECT_HEALTH_VERDICT_DICTIONARY,
};
