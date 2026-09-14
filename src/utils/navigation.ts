/**
 * 只接受当前站点内的绝对路径，避免把服务端返回的通知链接变成外部跳转。
 */
export function safeInternalPath(value?: string | null): string | undefined {
  const path = value?.trim();
  if (
    !path ||
    !path.startsWith('/') ||
    path.startsWith('//') ||
    path.includes('\\') ||
    /[\r\n]/.test(path) ||
    /%(?:2f|5c|25)/i.test(path)
  ) {
    return undefined;
  }

  let decoded = path;
  try {
    for (let depth = 0; depth < 3; depth += 1) {
      const next = decodeURIComponent(decoded);
      if (next === decoded) break;
      decoded = next;
      if (decoded.startsWith('//') || decoded.includes('\\') || /[\r\n]/.test(decoded)) {
        return undefined;
      }
    }
  } catch {
    return undefined;
  }
  return path;
}
