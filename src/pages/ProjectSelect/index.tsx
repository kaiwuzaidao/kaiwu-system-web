import { AppstoreOutlined } from '@ant-design/icons';
import { history, useIntl } from '@umijs/max';
import { Alert, Button, Empty, Segmented, Skeleton } from 'antd';
import { useEffect, useState } from 'react';
import ForcePasswordChange from '@/components/ForcePasswordChange';
import LineIcon from '@/components/LineIcon';
import { currentUserSnapshot, hasSession, logout } from '@/services/auth';
import { queryCurrentProjects, type PlatformProject } from '@/services/projects';
import { kaiwuBrand } from '@/theme/tokens';
import {
  enterableProjects,
  enterProject,
  readProjectOpenMode,
  writeProjectOpenMode,
  type ProjectOpenMode,
} from '@/utils/projectEntry';
import './index.less';

/**
 * 登录后的项目选择页：只列出当前用户有权访问的项目（/api/current/projects 已按有效成员
 * 与项目启用过滤），选中后进入对应入口。
 *
 * 这是 layout:false 的独立整屏页，不经 ProLayout，因此强制改密弹窗要自己挂载——
 * 否则需要改密的新用户能借这个页面绕过它。
 */
export default function ProjectSelect() {
  const intl = useIntl();
  const [projects, setProjects] = useState<PlatformProject[]>();
  const [failed, setFailed] = useState(false);
  const [openMode, setOpenMode] = useState<ProjectOpenMode>(() => readProjectOpenMode());
  const user = currentUserSnapshot();
  // 从其他项目带 ?project=<编码> 登录、但该项目不可访问时，登录页把编码带过来提示。
  // 只作为文本显示（React 会转义），不参与任何跳转。
  const denied = new URLSearchParams(window.location.search).get('denied') ?? undefined;

  // layout:false 的路由不经 ProLayout 的 onPageChange，登录态要自己把关。
  useEffect(() => {
    if (!hasSession()) history.replace('/login');
  }, []);

  const load = () => {
    setFailed(false);
    setProjects(undefined);
    void queryCurrentProjects()
      .then((data) => setProjects(data ?? []))
      .catch(() => {
        setFailed(true);
        setProjects([]);
      });
  };

  useEffect(() => {
    if (hasSession()) load();
  }, []);

  const entries = enterableProjects(projects ?? []).sort(
    (a, b) => Number(b.builtIn) - Number(a.builtIn),
  );

  const signOut = async () => {
    await logout().catch(() => undefined);
    window.location.replace('/login');
  };

  return (
    <div className="kaiwu-select">
      <header className="kaiwu-select-bar">
        <span className="kaiwu-select-brand">
          {/* i18n-ignore-next-line -- 产品字标，不是自然语言文案。 */}
          <span className="kaiwu-select-mark">K</span>
          {kaiwuBrand.name}
        </span>
        <span className="kaiwu-select-user">
          {user?.displayName}
          <Button type="link" size="small" onClick={() => void signOut()}>
            {intl.formatMessage({ id: 'layout.user.logout' })}
          </Button>
        </span>
      </header>

      <main className="kaiwu-select-main">
        <div className="kaiwu-select-head">
          <div>
            <h1>{intl.formatMessage({ id: 'projectSelect.title' })}</h1>
            <p>{intl.formatMessage({ id: 'projectSelect.subtitle' })}</p>
          </div>
          <Segmented<ProjectOpenMode>
            size="small"
            value={openMode}
            onChange={(value) => {
              setOpenMode(value);
              writeProjectOpenMode(value);
            }}
            options={[
              {
                value: 'inline',
                label: intl.formatMessage({ id: 'layout.project.openMode.inline' }),
              },
              {
                value: 'newTab',
                label: intl.formatMessage({ id: 'layout.project.openMode.newTab' }),
              },
            ]}
          />
        </div>

        {denied && (
          <Alert
            type="warning"
            showIcon
            className="kaiwu-select-notice"
            message={intl.formatMessage({ id: 'projectSelect.denied' }, { project: denied })}
          />
        )}
        {failed && (
          <Alert
            type="error"
            showIcon
            className="kaiwu-select-notice"
            message={intl.formatMessage({ id: 'home.load.failed' })}
            action={
              <Button size="small" onClick={load}>
                {intl.formatMessage({ id: 'common.refresh' })}
              </Button>
            }
          />
        )}

        {projects === undefined ? (
          <div className="kaiwu-select-grid">
            {[0, 1, 2].map((index) => (
              <div className="kaiwu-select-card is-loading" key={index}>
                <Skeleton active avatar paragraph={{ rows: 1 }} title={false} />
              </div>
            ))}
          </div>
        ) : entries.length === 0 ? (
          !failed && (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description={
                <>
                  <strong>{intl.formatMessage({ id: 'projectSelect.emptyTitle' })}</strong>
                  <br />
                  {intl.formatMessage({ id: 'projectSelect.emptyDesc' })}
                </>
              }
            />
          )
        ) : (
          <div className="kaiwu-select-grid">
            {entries.map((project) => (
              <button
                type="button"
                key={project.id}
                className="kaiwu-select-card"
                title={[project.projectName, project.projectCode, project.backendLabel]
                  .filter(Boolean)
                  .join(' · ')}
                onClick={() => enterProject(project, openMode)}
              >
                <span className={`kaiwu-select-avatar${project.builtIn ? ' is-platform' : ''}`}>
                  {project.builtIn ? <AppstoreOutlined /> : project.projectName.slice(0, 1)}
                </span>
                <span className="kaiwu-select-copy">
                  <strong>{project.projectName}</strong>
                  <small>
                    {[project.projectCode, project.backendLabel].filter(Boolean).join(' · ')}
                  </small>
                </span>
                <LineIcon name="arrow" size={14} />
              </button>
            ))}
          </div>
        )}
      </main>
      <ForcePasswordChange />
    </div>
  );
}
