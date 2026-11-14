/**
 * 「AI 助手模式 / 传统模式」切换信号。
 *
 * <p>入口在侧栏（RightContent），对话窗挂在布局的 childrenRender（AgentDock），两者没有共同的
 * React 状态。这里只传一个「请打开」的信号，打开与否仍由 AgentDock 按权限决定。</p>
 */
type Listener = () => void;

const listeners = new Set<Listener>();

export function requestAgentMode() {
  listeners.forEach((listener) => listener());
}

export function subscribeAgentMode(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

let visible = false;
const visibilityListeners = new Set<() => void>();
export const isAgentVisible = () => visible;
export function subscribeAgentVisibility(listener: () => void) {
  visibilityListeners.add(listener);
  return () => {
    visibilityListeners.delete(listener);
  };
}
export function publishAgentVisibility(next: boolean) {
  if (next === visible) return;
  visible = next;
  visibilityListeners.forEach((listener) => listener());
}
