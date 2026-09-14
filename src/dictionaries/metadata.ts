import type { DictionaryOption } from '@/dictionaries/types';

export const METADATA_STATUS_DICTIONARY: DictionaryOption[] = [
  { value: 'ENABLED', label: '启用', color: 'success' },
  { value: 'DISABLED', label: '停用', color: 'default' },
];

export const CONFIG_VALUE_TYPE_DICTIONARY: DictionaryOption[] = [
  { value: 'STRING', label: '文本', color: 'blue' },
  { value: 'NUMBER', label: '数值', color: 'cyan' },
  { value: 'BOOLEAN', label: '布尔值', color: 'purple' },
  { value: 'JSON', label: 'JSON', color: 'gold' },
];
