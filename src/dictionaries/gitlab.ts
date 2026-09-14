import type { DictionaryOption } from '@/dictionaries/types';

export const GITLAB_TEST_STATUS_DICTIONARY: DictionaryOption[] = [
  { value: 'SUCCESS', label: '连接成功', color: 'success' },
  { value: 'FAILED', label: '连接失败', color: 'error' },
];
