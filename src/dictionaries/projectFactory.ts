import type { DictionaryOption } from '@/dictionaries/types';

export const PROJECT_GENERATION_MODE_DICTIONARY: DictionaryOption[] = [
  { value: 'AI_PROJECT', label: 'AI 生成项目', color: 'purple' },
  { value: 'BASIC_SCAFFOLD', label: '基础空脚手架', color: 'default' },
  { value: 'ADOPT_FRONTEND', label: '沿用已有前端', color: 'blue' },
  { value: 'DDL_SCAFFOLD', label: 'DDL 确定性生成', color: 'blue' },
];

export const PROJECT_GENERATION_STATUS_DICTIONARY: DictionaryOption[] = [
  { value: 'PENDING', label: '等待生成', color: 'default' },
  { value: 'RUNNING', label: '正在生成', color: 'processing' },
  { value: 'SUCCESS', label: '生成成功', color: 'success' },
  { value: 'FAILED', label: '生成失败', color: 'error' },
];
