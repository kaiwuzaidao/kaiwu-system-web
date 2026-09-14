/**
 * 进入生成项目后台的统一入口。
 *
 * 只有一条路可走：先到平台的 /workspace/:projectId，由它把业务前端装进同源
 * iframe。不能直接把浏览器顶层地址换成业务前端——生成前端的 Access Token 只存在
 * 内存，靠受 nonce 约束的 postMessage 向平台索取，这要求它有 opener 或 parent；
 * 顶层直达的页面两者都没有，进去必然拿不到令牌。
 *
 * 跨源入口不适用这条桥接链路，由 /workspace 页判断后直接放行到目标站点。
 */

export type ProjectOpenMode = 'inline' | 'newTab';

const OPEN_MODE_KEY = 'kaiwu.projectOpenMode';
const DEFAULT_OPEN_MODE: ProjectOpenMode = 'inline';

export function projectWorkspacePath(projectId: string): string {
  return `/workspace/${encodeURIComponent(projectId)}`;
}

/** 读打开方式偏好；localStorage 不可用（隐私模式）时回落默认值，不抛错。 */
export function readProjectOpenMode(): ProjectOpenMode {
  try {
    return window.localStorage.getItem(OPEN_MODE_KEY) === 'newTab' ? 'newTab' : DEFAULT_OPEN_MODE;
  } catch {
    return DEFAULT_OPEN_MODE;
  }
}

export function writeProjectOpenMode(mode: ProjectOpenMode): void {
  try {
    window.localStorage.setItem(OPEN_MODE_KEY, mode);
  } catch {
    // 存不下就只在本次会话生效，不影响切换本身。
  }
}

/**
 * 打开项目后台。inline 换当前页地址，newTab 开新标签页。
 *
 * 新标签页必须保留 opener——那正是子应用取令牌的对端；因此这里不加 noopener。
 * 目标是平台自身的同源路由，不存在把 opener 交给外部站点的问题。
 */
export function openProjectEntry(projectId: string, mode: ProjectOpenMode): void {
  const path = projectWorkspacePath(projectId);
  if (mode === 'newTab') {
    window.open(path, '_blank');
    return;
  }
  window.location.assign(path);
}
