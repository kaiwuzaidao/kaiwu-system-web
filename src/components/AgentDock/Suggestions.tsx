import { useIntl } from '@umijs/max';
import LineIcon from '@/components/LineIcon';

/**
 * V5 起始卡片：标题 + 说明，点击即发送对应问题。
 * 「发起项目生成」仍发送创建项目的问题，走完新手主线：登记项目 → 继续生成第一版。
 */
const SUGGESTIONS = [
  {
    titleKey: 'agent.suggest.projects.title',
    descKey: 'agent.suggest.projects.desc',
    questionKey: 'agent.suggest.listProjects',
  },
  {
    titleKey: 'agent.suggest.failures.title',
    descKey: 'agent.suggest.failures.desc',
    questionKey: 'agent.suggest.failedGenerations',
  },
  {
    titleKey: 'agent.suggest.user.title',
    descKey: 'agent.suggest.user.desc',
    questionKey: 'agent.suggest.createUser',
  },
  {
    titleKey: 'agent.suggest.generate.title',
    descKey: 'agent.suggest.generate.desc',
    questionKey: 'agent.suggest.createProject',
  },
];

/** 空白会话的示例问题。X 的 Prompts 选项不可键盘操作，这里保留原生按钮。 */
export default function Suggestions({
  disabled,
  onAsk,
}: {
  disabled: boolean;
  onAsk: (question: string) => void;
}) {
  const intl = useIntl();
  const t = (id: string) => intl.formatMessage({ id });
  return (
    <div className="agent-dock-suggestions">
      <div className="agent-dock-suggestions-label">{t('agent.suggest.start')}</div>
      <div className="agent-dock-suggestions-list">
        {SUGGESTIONS.map(({ titleKey, descKey, questionKey }) => (
          <button
            type="button"
            key={questionKey}
            className="agent-dock-suggestion"
            disabled={disabled}
            onClick={() => onAsk(t(questionKey))}
          >
            <span>
              <strong>{t(titleKey)}</strong>
              <span>{t(descKey)}</span>
            </span>
            <LineIcon name="arrow" size={15} />
          </button>
        ))}
      </div>
    </div>
  );
}
