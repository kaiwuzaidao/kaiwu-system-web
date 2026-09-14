import type { DictionaryOption } from '@/dictionaries/types';

/** 站内信分类，对应后端 V18 seed 的 `notification.type`。 */
export const NOTIFICATION_TYPE_DICTIONARY: DictionaryOption[] = [
  { value: 'SYSTEM', label: '系统通知', color: 'processing' },
  { value: 'PROJECT', label: '项目消息', color: 'purple' },
  { value: 'TASK', label: '任务提醒', color: 'warning' },
];
