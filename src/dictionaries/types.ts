/**
 * 受管字典选项的统一形状：后端 sys_dict_item 与本地 fallback 共用。
 *
 * 放在 dictionaries 下而不是某个组件里，避免类型依赖倒挂——
 * 组件消费字典，字典定义不应该反过来依赖组件。
 */
export type DictionaryOption = {
  value: string;
  label: string;
  color?: string;
};
