type MessageFormatter = {
  formatMessage(descriptor: { id: string; defaultMessage?: string }): string;
};

/**
 * 解析管理页面中的引用式多语言字段。
 *
 * 列表展示使用当前已原子安装的 catalog，编辑表单继续使用 fallback 原始字段，
 * 避免把译文误保存成默认原文。key 不存在或未命中时由 Intl 回退到录入原文。
 */
export function referencedText(
  intl: MessageFormatter,
  messageKey: string | undefined,
  fallback: string,
): string {
  if (!messageKey) return fallback;
  return intl.formatMessage({ id: messageKey, defaultMessage: fallback });
}
