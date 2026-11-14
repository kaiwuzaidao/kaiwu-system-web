import { kaiwuPalette } from '@/theme/tokens';
import { history, useIntl, useLocation, useParams } from '@umijs/max';
import { Button, Result, Spin } from 'antd';
import { useEffect, useMemo, useState } from 'react';
import { hasSession } from '@/services/auth';
import {
  queryCurrentProjects,
  queryEffectiveProjectConfigs,
  type PlatformProject,
  type EffectiveProjectConfig,
} from '@/services/projects';
import { applyWorkspaceDeepLink, workspaceDeepLink } from '@/utils/workspaceDeepLink';

type Resolved =
  | { kind: 'loading' }
  | { kind: 'frame'; src: string; title: string }
  | { kind: 'external'; href: string }
  | { kind: 'missing' };

/**
 * 业务项目后台的宿主页。整屏渲染一个同源 iframe，浏览器地址停在平台上。
 *
 * 为什么必须套一层而不是直接把地址换成业务前端：生成前端的 Access Token 只存在
 * 内存，靠受 nonce 约束的 postMessage 向 opener/parent 索取（见 utils/projectAccessBridge）。
 * 顶层直达的页面两者都没有，进去必然 401。装进 iframe 后 parent 就是本页，
 * 桥接照常工作，用户看到的却是"在当前页面打开"。
 *
 * 入口地址不从 query 里取，只认 projectId、再由后端项目清单查出 backendUrl——
 * 否则这个路由就成了任人摆布的 iframe 跳板。
 */
export default function Workspace() {
  const intl = useIntl();
  const params = useParams<{ projectId?: string }>();
  const projectId = params.projectId ?? '';
  const { search } = useLocation();
  const [projects, setProjects] = useState<PlatformProject[]>();
  const [configs, setConfigs] = useState<EffectiveProjectConfig[]>([]);

  // layout:false 的路由不经 ProLayout 的 onPageChange，登录态要自己把关，
  // 否则未登录直接访问本路由会渲染成"入口不可用"，而不是回到登录页。
  useEffect(() => {
    if (!hasSession()) history.replace('/login');
  }, []);

  useEffect(() => {
    let active = true;
    if (!hasSession()) return () => {};
    setProjects(undefined);
    void Promise.all([
      queryCurrentProjects(),
      search ? queryEffectiveProjectConfigs(projectId).catch(() => []) : Promise.resolve([]),
    ])
      .then(([data, configuration]) => {
        if (active) {
          setProjects(data ?? []);
          setConfigs(configuration ?? []);
        }
      })
      .catch(() => {
        if (active) setProjects([]);
      });
    return () => {
      active = false;
    };
  }, [projectId, search]);

  const resolved = useMemo<Resolved>(() => {
    if (!projects) return { kind: 'loading' };
    const project = projects.find((item) => item.id === projectId);
    if (!project?.backendUrl) return { kind: 'missing' };
    let target: URL;
    try {
      target = new URL(project.backendUrl, window.location.href);
      if (!['http:', 'https:'].includes(target.protocol) || target.username || target.password)
        return { kind: 'missing' };
      target = applyWorkspaceDeepLink(
        target,
        workspaceDeepLink(search, projectId, configs),
        window.location.origin,
      );
    } catch {
      return { kind: 'missing' };
    }
    // 子应用靠 query 上的 projectId 认项目上下文，必须带上。
    target.searchParams.set('projectId', project.id);
    // 跨源入口用不了 postMessage 桥接，套 iframe 只是徒增一层；直接放行过去。
    if (target.origin !== window.location.origin) {
      return { kind: 'external', href: target.href };
    }
    return { kind: 'frame', src: target.href, title: project.projectName };
  }, [projects, projectId, search, configs]);

  useEffect(() => {
    if (resolved.kind === 'external') window.location.replace(resolved.href);
  }, [resolved]);

  if (resolved.kind === 'loading' || resolved.kind === 'external') {
    return (
      <div style={centered}>
        <Spin tip={intl.formatMessage({ id: 'layout.project.loadingEntry' })} size="large">
          <div style={{ width: 160, height: 1 }} />
        </Spin>
      </div>
    );
  }

  if (resolved.kind === 'missing') {
    return (
      <div style={centered}>
        <Result
          status="404"
          title={intl.formatMessage({ id: 'layout.project.entryUnavailable' })}
          extra={
            <Button type="primary" onClick={() => history.replace('/')}>
              {intl.formatMessage({ id: 'layout.project.backToPlatform' })}
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <iframe
      title={resolved.title}
      src={resolved.src}
      style={{
        position: 'fixed',
        inset: 0,
        width: '100%',
        height: '100%',
        border: 0,
        display: 'block',
      }}
    />
  );
}

const centered: React.CSSProperties = {
  minHeight: '100vh',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: kaiwuPalette.page,
};
