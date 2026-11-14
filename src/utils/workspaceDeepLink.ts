import type { EffectiveProjectConfig } from '../services/projectConfigTypes';

/** 项目管理员通过 kaiwu/configs.yml 登记；只能读取本项目来源，不能继承全局白名单。 */
export const WORKSPACE_DEEP_LINK_CONFIG = 'workspace.deep-links';

type RegisteredRoute = { prefix: string; queryParameters: string[] };
type Registry = { version: number; routes: RegisteredRoute[] };

function pathAllowed(path: string): boolean {
  return (
    path.length > 0 &&
    path.length <= 512 &&
    /^\/[A-Za-z0-9._~/-]*$/.test(path) &&
    !path.includes('//') &&
    !path.includes('..')
  );
}

/** 配置整体校验失败就不启用；版本随项目配置持久化，不在浏览器缓存权限事实。 */
function parseRegistry(configs: EffectiveProjectConfig[], projectId: string): Registry | undefined {
  const found = configs.filter((config) => config.key === WORKSPACE_DEEP_LINK_CONFIG);
  if (found.length !== 1) return undefined;
  const config = found[0];
  if (
    config.sourceScopeId !== projectId ||
    config.valueType !== 'JSON' ||
    typeof config.value !== 'string' ||
    config.value.length > 16384
  ) {
    return undefined;
  }
  try {
    const registry: unknown = JSON.parse(config.value);
    if (!registry || typeof registry !== 'object' || Array.isArray(registry)) return undefined;
    const candidate = registry as Record<string, unknown>;
    if (
      Object.keys(candidate).sort().join(',') !== 'routes,version' ||
      !Number.isSafeInteger(candidate.version) ||
      (candidate.version as number) <= 0 ||
      !Array.isArray(candidate.routes) ||
      candidate.routes.length > 64
    ) {
      return undefined;
    }
    const prefixes = new Set<string>();
    for (const item of candidate.routes) {
      if (!item || typeof item !== 'object' || Array.isArray(item)) return undefined;
      const route = item as Record<string, unknown>;
      if (
        Object.keys(route).sort().join(',') !== 'prefix,queryParameters' ||
        typeof route.prefix !== 'string' ||
        !pathAllowed(route.prefix) ||
        route.prefix.endsWith('/') ||
        prefixes.has(route.prefix) ||
        !Array.isArray(route.queryParameters) ||
        route.queryParameters.length > 32
      ) {
        return undefined;
      }
      const names = new Set<string>();
      for (const name of route.queryParameters) {
        if (
          typeof name !== 'string' ||
          !/^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(name) ||
          /^(projectId|token|access_token|refresh_token|authorization)$/i.test(name) ||
          names.has(name)
        ) {
          return undefined;
        }
        names.add(name);
      }
      prefixes.add(route.prefix);
    }
    return candidate as Registry;
  } catch {
    return undefined;
  }
}

/** 外层查询严格解码一次；非法 UTF-8、重复 route 和残留百分号均不能进入子应用。 */
function readRoute(search: string): string | undefined {
  if (!search || search.length > 4096) return undefined;
  let route: string | undefined;
  try {
    for (const part of search.replace(/^\?/, '').split('&')) {
      const equals = part.indexOf('=');
      const name = decodeURIComponent(
        (equals < 0 ? part : part.slice(0, equals)).replace(/\+/g, ' '),
      );
      if (name !== 'route') continue;
      if (route !== undefined || equals < 0) return undefined;
      route = decodeURIComponent(part.slice(equals + 1).replace(/\+/g, ' '));
    }
  } catch {
    return undefined;
  }
  if (!route || route.length > 512 || route.includes('%')) return undefined;
  return route;
}

/** 通知或待办先进入同源宿主；允许单层编码的 route，精确项目白名单仍由宿主读取后验证。 */
export function safeWorkspaceEntryPath(value: string): string | undefined {
  const match = /^(\/workspace\/[A-Za-z0-9-]{1,64})(\?[^#]*)$/.exec(value);
  if (!match) return undefined;
  const route = readRoute(match[2]);
  if (!route) return undefined;
  const [path, query, extra] = route.split('?');
  if (!pathAllowed(path) || extra !== undefined) return undefined;
  if (query !== undefined) {
    const names = new Set<string>();
    for (const item of query.split('&')) {
      if (!/^[A-Za-z][A-Za-z0-9_-]{0,63}=[A-Za-z0-9._~-]*$/.test(item)) return undefined;
      const name = item.slice(0, item.indexOf('='));
      if (names.has(name)) return undefined;
      names.add(name);
    }
  }
  return `${match[1]}?route=${encodeURIComponent(route)}`;
}

/** 返回通过最长路径段前缀与精确参数白名单的子路由；失败时调用方保持项目首页。 */
export function workspaceDeepLink(
  search: string,
  projectId: string,
  configs: EffectiveProjectConfig[],
): string | undefined {
  const registry = parseRegistry(configs, projectId);
  const route = readRoute(search);
  if (!registry || !route) return undefined;
  const [path, query, extra] = route.split('?');
  if (extra !== undefined || !pathAllowed(path)) return undefined;
  const registered = registry.routes
    .filter((entry) => path === entry.prefix || path.startsWith(`${entry.prefix}/`))
    .sort((a, b) => b.prefix.length - a.prefix.length)[0];
  if (!registered) return undefined;
  if (query !== undefined) {
    const names = new Set<string>();
    for (const part of query.split('&')) {
      const equals = part.indexOf('=');
      if (equals < 1) return undefined;
      const name = part.slice(0, equals);
      const value = part.slice(equals + 1);
      if (
        !registered.queryParameters.includes(name) ||
        !/^[A-Za-z0-9._~-]*$/.test(value) ||
        names.has(name)
      ) {
        return undefined;
      }
      names.add(name);
    }
  }
  return route;
}

/** 子路由仅拼到后端登记的同源项目入口，不允许覆盖入口 origin、上下文或片段。 */
export function applyWorkspaceDeepLink(
  target: URL,
  route: string | undefined,
  origin: string,
): URL {
  const result = new URL(target.href);
  if (!route || result.origin !== origin) return result;
  const [path, query] = route.split('?');
  result.pathname = `${result.pathname.replace(/\/+$/, '')}${path}`;
  result.hash = '';
  if (query) {
    for (const [name, value] of new URLSearchParams(query)) result.searchParams.set(name, value);
  }
  return result;
}
