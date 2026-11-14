import { useIntl } from '@umijs/max';
import DictTag from '@/components/DictTag';
import LineIcon from '@/components/LineIcon';

export type ProjectEntryCardData = {
  id: string;
  projectCode: string;
  projectName: string;
  status: string;
  backendUrl?: string;
};

/** 设计稿的项目图标色：内置 system 用珊瑚色，其余按项目编码稳定取色，避免一屏全是同一种蓝。 */
const AVATAR_TONES = ['is-blue', 'is-default', 'is-teal'];

function avatarTone(code: string) {
  let hash = 0;
  for (const char of code) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return AVATAR_TONES[hash % AVATAR_TONES.length];
}

/** 项目字母图标，工作台卡片与项目列表共用。 */
export function ProjectAvatar({ code, name }: { code: string; name: string }) {
  return (
    <div className={`kaiwu-project-avatar ${code === 'system' ? 'is-coral' : avatarTone(code)}`}>
      {name.slice(0, 1)}
    </div>
  );
}

export default function ProjectEntryCard({
  project,
  onEnter,
  showNoEntry = true,
}: {
  project: ProjectEntryCardData;
  onEnter: () => void;
  /** 为 false 时不提示「后台未配置」（聊天卡片里只做跳转，不需要配置状态）。 */
  showNoEntry?: boolean;
}) {
  const intl = useIntl();
  const isSystem = project.projectCode === 'system';
  const hasEntry = isSystem || Boolean(project.backendUrl);
  return (
    <div
      className={`kaiwu-project-entry${showNoEntry ? '' : ' is-chat'}`}
      role="button"
      tabIndex={0}
      onClick={onEnter}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onEnter();
        }
      }}
    >
      <ProjectAvatar code={project.projectCode} name={project.projectName} />
      <div className="kaiwu-project-entry-copy">
        <div className="kaiwu-project-entry-name">{project.projectName}</div>
        <div className="kaiwu-project-entry-code">{project.projectCode}</div>
      </div>
      <div className="kaiwu-project-card-state">
        {isSystem ? (
          <span className="kaiwu-dot-tag is-blue">
            {intl.formatMessage({ id: 'projects.builtIn' })}
          </span>
        ) : (
          <DictTag dictCode="project.status" value={project.status} />
        )}
      </div>
      {showNoEntry ? (
        <div className="kaiwu-project-card-footer">
          <span>
            {(showNoEntry || hasEntry) && (
              <>
                {intl.formatMessage({ id: 'projects.backend' })}{' '}
                <strong>
                  {intl.formatMessage({
                    id: isSystem
                      ? 'projects.builtIn'
                      : hasEntry
                        ? 'ai.configured'
                        : 'ai.notConfigured',
                  })}
                </strong>
              </>
            )}
          </span>
          <span className="kaiwu-project-card-go">
            {hasEntry && intl.formatMessage({ id: 'projects.openBackend' })}
            <LineIcon name="arrow" size={12} />
          </span>
        </div>
      ) : (
        <LineIcon name="arrow" size={12} />
      )}
    </div>
  );
}
