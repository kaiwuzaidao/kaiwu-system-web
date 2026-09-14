import type { DictionaryOption } from '@/dictionaries/types';

/**
 * 通用布尔字典，对应后端 V8 seed 的 `common.boolean_enabled`。
 * 「是否启用」类字段一律复用它，不要按模块各造一个 xxx.enabled。
 */
export const COMMON_BOOLEAN_ENABLED_DICTIONARY: DictionaryOption[] = [
  { value: 'true', label: '是', color: 'success' },
  { value: 'false', label: '否', color: 'default' },
];

/**
 * 字典项 Tag 的展示颜色，对应后端 V25 seed 的 `common.tag_color`。
 *
 * 取值是**库里实际在用**的 7 种：前五个是语义色（状态类用），
 * purple/cyan 供值类型、生成模式一类的类别型枚举区分，删掉会让存量项变成未知值。
 */
export const TAG_COLOR_DICTIONARY: DictionaryOption[] = [
  { value: 'success', label: '成功（绿）', color: 'success' },
  { value: 'processing', label: '处理中（蓝）', color: 'processing' },
  { value: 'warning', label: '警告（橙）', color: 'warning' },
  { value: 'error', label: '失败（红）', color: 'error' },
  { value: 'default', label: '默认（灰）', color: 'default' },
  { value: 'purple', label: '紫（类别）', color: 'purple' },
  { value: 'cyan', label: '青（类别）', color: 'cyan' },
];
