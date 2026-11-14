import {
  currentLocale,
  initializeLocale,
  normalizeLocale,
  type SupportedLocale,
} from '@/utils/locale';
import { resolveApiMessage, type ApiMessage } from '@/utils/apiMessage';
import { reloadNavigationMenus } from '@/utils/navigationMenu';

export type CurrentUser = {
  id: string;
  username: string;
  displayName: string;
  permissions: string[];
  locale: SupportedLocale;
  /** 为 true 表示密码由管理员设定或重置，必须先改密码才能使用其它功能。 */
  mustChangePassword?: boolean;
  /** 用户级偏好：登录后默认进入 AI 助手聊天模式。只影响界面入口，不授予权限。 */
  agentAutoOpen?: boolean;
};

export type TokenData = {
  accessToken: string;
  expiresIn: number;
  user: CurrentUser;
};

type ApiResult<T> = ApiMessage & {
  code: number;
  data: T;
};

function unavailableMessage(status: number): string | undefined {
  if (status === 502 || status === 503 || status === 504) {
    return resolveApiMessage({
      messageKey: 'client.serviceUnavailable',
      message: '服务暂时不可用，请检查 Gateway/Nacos 配置后重试',
    });
  }
  return undefined;
}

async function readApiResult<T>(response: Response): Promise<ApiResult<T> | undefined> {
  try {
    return (await response.json()) as ApiResult<T>;
  } catch {
    return undefined;
  }
}

const SESSION_EXIT_REASON_KEY = 'kaiwu_last_session_exit';

const PROACTIVE_REFRESH_MARGIN_MS = 60_000;
type SessionState = TokenData & { expiresAt: number };
const sessionListeners = new Set<() => void>();
let sessionState = readBootstrapSession();

export function hasSession() {
  return Boolean(sessionState?.accessToken);
}

export function saveSession(data: TokenData) {
  sessionState = {
    ...data,
    user: { ...data.user },
    expiresAt: Date.now() + Math.max(1, data.expiresIn) * 1000,
  };
  notifySessionChange();
}

export function currentUserSnapshot(): CurrentUser | undefined {
  return sessionState?.user;
}

export function currentAccessTokenSnapshot(): string {
  return sessionState?.accessToken ?? '';
}

export function subscribeSessionChange(listener: () => void): () => void {
  sessionListeners.add(listener);
  return () => sessionListeners.delete(listener);
}

export function currentSessionId(): string | undefined {
  const token = sessionState?.accessToken;
  if (!token) return undefined;
  try {
    const payload = token.split('.')[1];
    if (!payload) return undefined;
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
    const claims = JSON.parse(
      atob(normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), '=')),
    ) as { sid?: string };
    return claims.sid;
  } catch {
    return undefined;
  }
}

/** 当前用户的导航菜单节点，来自平台菜单表（system 项目），已按角色授权过滤。 */
export type NavigationMenu = {
  id: string;
  name: string;
  /** DIRECTORY 为分组，无路由；MENU 对应一个前端路由。 */
  type: 'DIRECTORY' | 'MENU';
  path?: string;
  icon?: string;
  children: NavigationMenu[];
};

export function queryNavigationMenus() {
  return apiRequest<NavigationMenu[]>('/api/auth/menus');
}

function synchronizeCurrentUser(user: CurrentUser) {
  if (sessionState) {
    sessionState = { ...sessionState, user };
    notifySessionChange();
  }
  return user;
}

/**
 * 读取完整目录并原子安装目标 catalog。失败时保留当前 catalog 与登录态。
 * 动态 import 避免 auth 请求层与 i18n service 形成模块初始化环。
 */
async function activateAuthenticatedLocale(locale: string) {
  const [{ queryI18nCatalog, queryI18nLocales }, runtime, localeUtils] = await Promise.all([
    import('@/services/i18n'),
    import('@/i18n/runtime'),
    import('@/utils/locale'),
  ]);
  const locales = await queryI18nLocales(locale);
  localeUtils.registerEnabledLocales(
    locales.filter((item) => item.selectable).map((item) => item.locale),
  );
  const target = locales.some((item) => item.locale === locale && item.selectable)
    ? locale
    : localeUtils.DEFAULT_LOCALE;
  const catalog = await queryI18nCatalog(target);
  runtime.installCatalog(catalog);
  return target;
}

/** 重新读取服务端用户事实，并让其它已打开会话的语言偏好在本次查询后收敛。 */
export async function queryCurrentUser() {
  const user = await apiRequest<CurrentUser>('/api/auth/me');
  const previousLocale = currentLocale();
  synchronizeCurrentUser(user);
  if (user.locale !== previousLocale) {
    const activeLocale = await activateAuthenticatedLocale(user.locale);
    return synchronizeCurrentUser({ ...user, locale: activeLocale });
  }
  return user;
}

/** 持久化当前用户语言偏好，并立即更新运行时语言与内存会话。 */
export async function updateCurrentUserLocale(locale: SupportedLocale) {
  // 先加载完整 catalog；失败时服务端偏好和当前页面都不改变。
  const [{ queryI18nCatalog }, runtime] = await Promise.all([
    import('@/services/i18n'),
    import('@/i18n/runtime'),
  ]);
  const catalog = await queryI18nCatalog(locale);
  const user = await apiRequest<CurrentUser>('/api/auth/me/locale', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ locale }),
  });
  runtime.installCatalog(catalog);
  const synchronizedUser = synchronizeCurrentUser(user);
  // 菜单名称由服务端按当前用户语言下发；ProLayout 已缓存旧树，必须显式刷新。
  reloadNavigationMenus();
  return synchronizedUser;
}

/**
 * 持久化「登录后默认进入 AI 助手」偏好，并同步内存中的用户快照。
 *
 * <p>接口挂在网关已放行的 /api/agent 下（/api/auth 逐条放行），权限沿用 system:agent:ask。</p>
 */
export async function updateAgentAutoOpen(autoOpen: boolean) {
  // PUT 幂等，与语言偏好一样允许令牌过期时刷新后重试。
  const user = await apiRequest<CurrentUser>('/api/agent/preferences', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ autoOpen }),
  });
  return synchronizeCurrentUser(user);
}

/** 改密成功后清除本地强制改密标记，否则用户会被一直挡在个人中心。 */
export function clearMustChangePassword() {
  const user = currentUserSnapshot();
  if (!user?.mustChangePassword) return;
  if (sessionState) {
    sessionState = {
      ...sessionState,
      user: { ...user, mustChangePassword: false },
    };
    notifySessionChange();
  }
}

export function clearSession() {
  sessionState = undefined;
  notifySessionChange();
}

/** 记录本次被踢的原因，供登录页读取展示。 */
export function readAndClearSessionExitReason(): string | undefined {
  const value = sessionStorage.getItem(SESSION_EXIT_REASON_KEY) ?? undefined;
  if (value) sessionStorage.removeItem(SESSION_EXIT_REASON_KEY);
  return value;
}

function markSessionExitReason(reason: string) {
  try {
    sessionStorage.setItem(SESSION_EXIT_REASON_KEY, reason);
  } catch {
    // sessionStorage 不可用时忽略。
  }
}

function isAccessTokenExpiringSoon() {
  return Boolean(sessionState && sessionState.expiresAt - Date.now() < PROACTIVE_REFRESH_MARGIN_MS);
}

export async function login(username: string, password: string) {
  let response: Response;
  try {
    response = await fetch('/api/auth/login', {
      method: 'POST',
      credentials: 'same-origin',
      headers: {
        'Content-Type': 'application/json',
        'Accept-Language': currentLocale(),
      },
      body: JSON.stringify({ username, password }),
    });
  } catch {
    throw new Error(
      resolveApiMessage({
        messageKey: 'client.connectionFailed',
        message: '无法连接服务，请确认 Kaiwu 网关已启动',
      }),
    );
  }
  const result = await readApiResult<TokenData>(response);
  if (!response.ok || !result || result.code !== 0) {
    throw new Error(
      resolveApiMessage(result) ||
        unavailableMessage(response.status) ||
        resolveApiMessage({
          messageKey: 'client.loginFailed',
          message: `登录失败（HTTP ${response.status}）`,
          messageArgs: { status: response.status },
        }),
    );
  }
  saveSession(result.data);
  try {
    const activeLocale = await activateAuthenticatedLocale(result.data.user.locale);
    synchronizeCurrentUser({ ...result.data.user, locale: activeLocale });
  } catch {
    // 登录与资源中心解耦：catalog 故障时保持最小救援包，不把已验证会话判为失败。
  }
  return result.data;
}

let redirectingToLogin = false;

/**
 * 会话彻底失效时的统一处理：清本地凭据 + 硬跳登录页。
 * 使用单例 flag 防并发多次 replace；用 window.location 而非 umi history，
 * 目的是把所有 in-flight 的 apiRequest / useEffect / message 队列一并卸掉，
 * 避免 dev 覆盖层的 Unhandled Rejection 和多条重复 toast。
 */
function goLogin(reason?: string) {
  if (reason) markSessionExitReason(reason);
  if (redirectingToLogin) return;
  redirectingToLogin = true;
  clearSession();
  if (window.location.pathname !== '/login') {
    window.location.replace('/login');
  }
}

/** 会话失效后 apiRequest 返回一个永不 resolve 的 Promise，让调用方的 then/catch/finally 都不再触发。 */
function pendingForever<T>(): Promise<T> {
  return new Promise<T>(() => {});
}

let refreshingPromise: Promise<TokenData | undefined> | null = null;

async function doRefresh(redirectOnFailure: boolean): Promise<TokenData | undefined> {
  const response = await fetch('/api/auth/refresh', {
    method: 'POST',
    credentials: 'same-origin',
    headers: {
      'Accept-Language': normalizeLocale(sessionState?.user.locale),
    },
  });
  let result: ApiResult<TokenData> | undefined;
  try {
    result = (await response.json()) as ApiResult<TokenData>;
  } catch {
    // ignore non-JSON body
  }
  if (!response.ok || !result || result.code !== 0) {
    const reason =
      resolveApiMessage(result) ||
      (response.status === 401
        ? resolveApiMessage({
            messageKey: 'client.refreshInvalid',
            message: '刷新令牌无效或已过期',
          })
        : resolveApiMessage({
            messageKey: 'client.refreshFailed',
            message: `刷新失败（HTTP ${response.status}）`,
            messageArgs: { status: response.status },
          }));
    if (redirectOnFailure) {
      // eslint-disable-next-line no-console
      console.warn('[auth] refresh 失败 →', reason);
    }
    clearSession();
    if (redirectOnFailure) goLogin(reason);
    return undefined;
  }
  saveSession(result.data);
  return result.data;
}

/**
 * 刷新令牌每次轮换，旧令牌立即作废；Cookie 又是各标签页共享的。两个标签页同时刷新时，
 * 后到的那个会拿着已作废的令牌得到 401，被当成会话失效而登出。用 Web Locks 把整个浏览器
 * 的刷新串行化：后拿到锁的标签页读到的是前一个标签页刚写入的新 Cookie，自然成功。
 * 不支持 Web Locks 的环境退回原行为。
 */
async function withRefreshLock<T>(task: () => Promise<T>): Promise<T> {
  const locks = typeof navigator === 'undefined' ? undefined : navigator.locks;
  return locks ? await locks.request('kaiwu-auth-refresh', task) : task();
}

async function refreshTokens(redirectOnFailure: boolean): Promise<TokenData | undefined> {
  if (!refreshingPromise) {
    refreshingPromise = withRefreshLock(() => doRefresh(redirectOnFailure)).finally(() => {
      refreshingPromise = null;
    });
  }
  return refreshingPromise;
}

async function refreshAccessToken(): Promise<string | undefined> {
  return (await refreshTokens(true))?.accessToken;
}

/** 页面启动时通过 HttpOnly Cookie 恢复会话；无有效 Cookie 属于正常未登录状态。 */
export async function restoreSession(): Promise<boolean> {
  if (hasSession()) return true;
  const restored = await refreshTokens(false);
  if (!restored) return false;
  try {
    const activeLocale = await activateAuthenticatedLocale(restored.user.locale);
    synchronizeCurrentUser({ ...restored.user, locale: activeLocale });
  } catch {
    // catalog 故障不撤销已恢复的会话，继续使用最小救援包。
  }
  return true;
}

/**
 * 刷新当前会话并重新载入服务端权限快照。
 *
 * <p>权限由登录/刷新时写入会话快照。部署期间已打开的页面可能仍持有旧快照，
 * 需要一个不跳转登录页的主动刷新入口来收敛到最新授权。</p>
 */
export async function refreshSession(): Promise<TokenData | undefined> {
  if (!hasSession()) return undefined;
  const refreshed = await refreshTokens(false);
  if (!refreshed) return undefined;
  try {
    const activeLocale = await activateAuthenticatedLocale(refreshed.user.locale);
    const synchronized = { ...refreshed, user: { ...refreshed.user, locale: activeLocale } };
    synchronizeCurrentUser(synchronized.user);
    return synchronized;
  } catch {
    // 权限刷新成功时不因目录服务短暂不可用而撤销会话。
    return refreshed;
  }
}

export async function apiRequest<T>(
  path: string,
  init: RequestInit = {},
  retry = true,
): Promise<T> {
  if (retry && sessionState?.accessToken && isAccessTokenExpiringSoon()) {
    const token = await refreshAccessToken();
    if (!token) return pendingForever<T>();
  }
  const accessToken = sessionState?.accessToken;
  const headers = new Headers(init.headers);
  headers.set('Accept-Language', normalizeLocale(sessionState?.user.locale));
  if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`);
  const response = await fetch(path, {
    ...init,
    headers,
  });
  if (response.status === 401) {
    if (retry) {
      const token = await refreshAccessToken();
      if (!token) return pendingForever<T>();
      return apiRequest<T>(path, init, false);
    }
    goLogin(resolveApiMessage({ messageKey: 'client.sessionExpired', message: '会话已失效' }));
    return pendingForever<T>();
  }
  const result = await readApiResult<T>(response);
  if (!response.ok || !result || result.code !== 0) {
    throw new Error(
      resolveApiMessage(result) ||
        unavailableMessage(response.status) ||
        resolveApiMessage({
          messageKey: 'client.requestFailed',
          message: `请求失败（HTTP ${response.status}）`,
          messageArgs: { status: response.status },
        }),
    );
  }
  return result.data;
}

/**
 * 自助修改密码。成功后后端只下线其它端的会话，当前会话继续有效，无需重新登录。
 * 旧密码错误等校验失败返回 400，会以 Error 抛出给调用方展示，不会触发登录跳转。
 */
export function changePassword(input: {
  oldPassword: string;
  newPassword: string;
  confirmPassword: string;
}) {
  return apiRequest<void>('/api/auth/password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
}

export async function logout() {
  try {
    await apiRequest<void>('/api/auth/logout', { method: 'POST' });
  } finally {
    clearSession();
  }
}

export async function downloadApiFile(path: string, filename: string, retry = true) {
  const accessToken = sessionState?.accessToken;
  const headers = new Headers();
  headers.set('Accept-Language', normalizeLocale(sessionState?.user.locale));
  if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`);
  const response = await fetch(path, {
    headers,
  });
  if (response.status === 401) {
    if (retry) {
      const token = await refreshAccessToken();
      if (!token) return pendingForever<void>();
      return downloadApiFile(path, filename, false);
    }
    goLogin(resolveApiMessage({ messageKey: 'client.sessionExpired', message: '会话已失效' }));
    return pendingForever<void>();
  }
  if (!response.ok) {
    let errorMessage = resolveApiMessage({
      messageKey: 'client.downloadFailed',
      message: `下载失败（HTTP ${response.status}）`,
      messageArgs: { status: response.status },
    });
    try {
      const result = (await response.json()) as ApiResult<unknown>;
      errorMessage = resolveApiMessage(result, errorMessage);
    } catch {
      // 非 JSON 错误体使用 HTTP 状态信息。
    }
    throw new Error(errorMessage);
  }
  const url = URL.createObjectURL(await response.blob());
  try {
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

function notifySessionChange() {
  sessionListeners.forEach((listener) => listener());
}

/**
 * Accepts a one-time bootstrap value supplied before this bundle executes, then deletes it.
 * This is used by same-page hosts and E2E fixtures without persisting credentials in Web Storage.
 */
function readBootstrapSession(): SessionState | undefined {
  if (typeof window === 'undefined') return undefined;
  const bootstrapWindow = window as Window & {
    __KAIWU_SESSION_BOOTSTRAP__?: unknown;
  };
  const candidate = bootstrapWindow.__KAIWU_SESSION_BOOTSTRAP__;
  delete bootstrapWindow.__KAIWU_SESSION_BOOTSTRAP__;
  if (!candidate || typeof candidate !== 'object') return undefined;

  const value = candidate as Partial<TokenData>;
  if (
    typeof value.accessToken !== 'string' ||
    typeof value.expiresIn !== 'number' ||
    !value.user ||
    typeof value.user !== 'object'
  ) {
    return undefined;
  }
  return {
    accessToken: value.accessToken,
    expiresIn: value.expiresIn,
    user: {
      ...(value.user as CurrentUser),
      // Provider 创建前只装载内存状态，不触发尚未就绪的 Umi locale 事件。
      locale: initializeLocale((value.user as Partial<CurrentUser>).locale),
    },
    expiresAt: Date.now() + Math.max(1, value.expiresIn) * 1000,
  };
}
