import type { DictionaryOption } from '@/dictionaries/types';

export const PROJECT_GENERATION_MODE_DICTIONARY: DictionaryOption[] = [
  { value: 'AI_PROJECT', label: 'AI 生成项目', color: 'purple' },
  { value: 'BASIC_SCAFFOLD', label: '基础空脚手架', color: 'default' },
];

export const PROJECT_GENERATION_STATUS_DICTIONARY: DictionaryOption[] = [
  { value: 'PENDING', label: '等待生成', color: 'default' },
  { value: 'RUNNING', label: '正在生成', color: 'processing' },
  { value: 'SUCCESS', label: '生成成功', color: 'success' },
  { value: 'FAILED', label: '生成失败', color: 'error' },
];

export const PROJECT_REPOSITORY_PUSH_STATUS_DICTIONARY: DictionaryOption[] = [
  { value: 'NOT_CONFIGURED', label: '尚未推送', color: 'default' },
  { value: 'PUSHING', label: '正在推送', color: 'processing' },
  { value: 'PUSHED', label: '已完成初始推送', color: 'success' },
  { value: 'FAILED', label: '推送失败', color: 'error' },
];
