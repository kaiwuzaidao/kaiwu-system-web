import type { DictionaryOption } from './types';

export const SCHEDULER_EXECUTION_STATUS_DICTIONARY: DictionaryOption[] = [
  { value: 'RUNNING', label: '执行中', color: 'processing' },
  { value: 'SUCCESS', label: '成功', color: 'success' },
  { value: 'FAILED', label: '失败', color: 'error' },
];
