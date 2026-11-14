import type { DictionaryOption } from '@/dictionaries/types';

/** V107 storage.provider.type（ADR 0039）。 */
export const STORAGE_PROVIDER_TYPE_DICTIONARY: DictionaryOption[] = [
  { value: 'ALIYUN_OSS', label: '阿里云 OSS', color: 'processing' },
  { value: 'S3_COMPATIBLE_STS', label: 'S3 兼容（STS）', color: 'default' },
];

/** V107 storage.binding.status（ADR 0039）。 */
export const STORAGE_BINDING_STATUS_DICTIONARY: DictionaryOption[] = [
  { value: 'ACTIVE', label: '生效', color: 'success' },
  { value: 'READ_ONLY', label: '只读', color: 'warning' },
  { value: 'DISABLED', label: '停用', color: 'default' },
];
