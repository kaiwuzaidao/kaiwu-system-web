/** 助手星标，单独导出供悬浮入口按钮作图标使用。 */
export function SparkIcon({ size = 16 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor" aria-hidden="true">
      <path d="M11 4c.5 5 4 8.5 9 9-5 .5-8.5 4-9 9-.5-5-4-8.5-9-9 5-.5 8.5-4 9-9Z" />
      <path d="M19 1.5c.2 1.9 1.1 2.8 3 3-1.9.2-2.8 1.1-3 3-.2-1.9-1.1-2.8-3-3 1.9-.2 2.8-1.1 3-3Z" />
    </svg>
  );
}

/** 助手标识：沿用平台 logo 的品牌渐变方块，让助手在视觉上属于 Kaiwu 而不是外挂组件。 */
export default function AgentMark({ size = 28 }: { size?: number }) {
  return (
    <span
      className="agent-mark"
      style={{ width: size, height: size, borderRadius: Math.round(size * 0.28) }}
      aria-hidden="true"
    >
      <SparkIcon size={Math.round(size * 0.58)} />
    </span>
  );
}
