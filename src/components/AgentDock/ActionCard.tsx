import { useEffect, useRef, useState } from 'react';
import { useIntl } from '@umijs/max';
import { Alert, App, Button, Card, Descriptions, Input, Space, Typography } from 'antd';
import AuthButton from '@/components/AuthButton';
import DictTag from '@/components/DictTag';
import ProjectEntryCard from '@/components/ProjectEntryCard';
import { currentUserSnapshot } from '@/services/auth';
import {
  cancelAgentAction,
  confirmAgentAction,
  getAgentAction,
  type AgentAction,
} from '@/services/agent';

/** 确认凭证仅存在父组件当前会话内存；结果未知时只读查询，不重放 POST。 */
export default function ActionCard({
  action,
  onChange,
  onOpenProjects,
  onContinueGeneration,
}: {
  action: AgentAction;
  onChange: (next: AgentAction) => void;
  onOpenProjects: (keyword?: string) => void;
  /** 项目在聊天里登记后还没有代码，交给开通向导生成第一版。 */
  onContinueGeneration?: (project: NonNullable<AgentAction['project']>) => void;
}) {
  const intl = useIntl();
  const t = (key: string) => intl.formatMessage({ id: `agent.action.${key}` });
  const { message } = App.useApp();
  const [busy, setBusy] = useState(false);
  const [typedPhrase, setTypedPhrase] = useState('');
  const locked = useRef(false);
  const [now, setNow] = useState(Date.now());
  useEffect(() => setTypedPhrase(''), [action.actionId]);
  useEffect(() => {
    if (action.status !== 'PENDING') return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [action.status]);
  const expired = action.status === 'PENDING' && new Date(action.expiresAt).getTime() <= now;
  const status = expired ? 'EXPIRED' : action.status;
  const run = async (kind: 'confirm' | 'cancel' | 'refresh') => {
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    const token = action.confirmationToken;
    if (kind !== 'refresh')
      onChange({
        ...action,
        confirmationToken: undefined,
        confirmationPhrase: undefined,
        status: 'EXECUTING',
      });
    try {
      const next =
        kind === 'confirm' && token
          ? await confirmAgentAction(
              action.actionId,
              token,
              action.confirmationMode === 'STRONG' ? typedPhrase : undefined,
            )
          : kind === 'cancel'
            ? await cancelAgentAction(action.actionId)
            : await getAgentAction(action.actionId);
      onChange({
        ...next,
        confirmationToken: kind === 'refresh' && next.status === 'PENDING' ? token : undefined,
        confirmationPhrase:
          kind === 'refresh' && next.status === 'PENDING' ? action.confirmationPhrase : undefined,
      });
    } catch (failure) {
      if (kind !== 'refresh')
        onChange({
          ...action,
          confirmationToken: undefined,
          confirmationPhrase: undefined,
          status: 'UNKNOWN',
          reason: 'UNKNOWN_OUTCOME',
        });
      void message.error(failure instanceof Error ? failure.message : t('requestFailed'));
    } finally {
      locked.current = false;
      setBusy(false);
    }
  };
  return (
    <Card
      title={action.project ? t('title') : t('genericTitle')}
      size="small"
      style={{ marginBlock: 12, maxWidth: 900 }}
    >
      <Space direction="vertical" size={12} style={{ width: '100%' }}>
        <DictTag dictCode="agent.action.status" value={status} />
        <Descriptions
          column={1}
          size="small"
          items={
            action.project
              ? [
                  { key: 'name', label: t('projectName'), children: action.project.projectName },
                  { key: 'code', label: t('projectCode'), children: action.project.projectCode },
                  {
                    key: 'package',
                    label: t('packageName'),
                    children: action.project.packageName || '-',
                  },
                  {
                    key: 'description',
                    label: t('description'),
                    children: action.project.description || '-',
                  },
                ]
              : Object.entries(action.previewFields ?? {}).map(([key, value]) => ({
                  key,
                  label: intl.formatMessage({ id: `agent.input.${key}`, defaultMessage: key }),
                  children:
                    action.capabilityCode === 'system.user.status.update' &&
                    (key === 'status' || key === 'currentStatus') ? (
                      <DictTag dictCode="common.status" value={value} />
                    ) : (
                      value
                    ),
                }))
          }
        />
        {status === 'PENDING' && (
          <>
            <Alert
              type="info"
              showIcon
              message={t(action.project ? 'impact' : 'genericImpact')}
              description={
                action.confirmationToken
                  ? t(action.project ? 'pendingHint' : 'genericPendingHint')
                  : t('noToken')
              }
            />
            <Typography.Text type="secondary">
              {intl.formatMessage(
                { id: 'agent.action.expiresIn' },
                {
                  seconds: Math.max(
                    0,
                    Math.ceil((new Date(action.expiresAt).getTime() - now) / 1000),
                  ),
                },
              )}
            </Typography.Text>
            {action.confirmationMode === 'STRONG' && action.confirmationToken && (
              <Input
                aria-label={intl.formatMessage({ id: 'agent.remoteAction.strongPrompt' })}
                placeholder={intl.formatMessage(
                  { id: 'agent.remoteAction.strongPlaceholder' },
                  { phrase: action.confirmationPhrase ?? '' },
                )}
                value={typedPhrase}
                onChange={(event) => setTypedPhrase(event.target.value)}
                autoComplete="off"
              />
            )}
          </>
        )}
        {(status === 'UNKNOWN' || status === 'EXECUTING') && (
          <Alert type="warning" showIcon message={t('unknownHint')} />
        )}
        {(status === 'FAILED' || status === 'REJECTED') && (
          <Alert
            type="error"
            showIcon
            message={action.reason === 'PROJECT_CONFLICT' ? t('conflict') : t('failedHint')}
          />
        )}
        {status === 'EXPIRED' && <Alert type="warning" message={t('expiredHint')} />}
        {status === 'SUCCEEDED' && action.project && action.projectId && (
          <>
            <Alert type="success" message={intl.formatMessage({ id: 'agent.projects.created' })} />
            <ProjectEntryCard
              project={{
                id: action.projectId,
                projectCode: action.project.projectCode,
                projectName: action.project.projectName,
                status: 'ACTIVE',
              }}
              showNoEntry={false}
              onEnter={() => onOpenProjects(action.project?.projectCode)}
            />
            {onContinueGeneration &&
              currentUserSnapshot()?.permissions.includes('system:project-factory:generate') && (
                <Button type="primary" onClick={() => onContinueGeneration(action.project!)}>
                  {intl.formatMessage({ id: 'agent.projects.continueGeneration' })}
                </Button>
              )}
          </>
        )}
        {status === 'SUCCEEDED' && !action.project && (
          <Alert type="success" message={t('completed')} />
        )}
        {status === 'SUCCEEDED' && action.oneTimeSecret && (
          <Alert
            type="warning"
            showIcon
            message={t('oneTimePassword')}
            description={
              <Space direction="vertical">
                <Typography.Text code copyable={{ text: action.oneTimeSecret }}>
                  {action.oneTimeSecret}
                </Typography.Text>
                <Typography.Text type="secondary">{t('oneTimePasswordHint')}</Typography.Text>
              </Space>
            }
          />
        )}
        <Space wrap className="agent-dock-card-actions">
          {status === 'PENDING' && (
            <>
              <AuthButton
                type="primary"
                permission={action.permission ?? 'system:project:create'}
                permissions={currentUserSnapshot()?.permissions ?? []}
                disabled={
                  busy ||
                  !action.confirmationToken ||
                  (action.confirmationMode === 'STRONG' &&
                    typedPhrase !== action.confirmationPhrase)
                }
                loading={busy}
                onClick={() => void run('confirm')}
              >
                {t(action.project ? 'confirm' : 'genericConfirm')}
              </AuthButton>
              <Button disabled={busy} onClick={() => void run('cancel')}>
                {t('cancel')}
              </Button>
            </>
          )}
          <Button disabled={busy} onClick={() => void run('refresh')}>
            {t('refresh')}
          </Button>
          {action.project && (
            <AuthButton
              type="link"
              permission="system:project:list"
              permissions={currentUserSnapshot()?.permissions ?? []}
              onClick={() => onOpenProjects()}
            >
              {intl.formatMessage({ id: 'agent.projects.title' })}
            </AuthButton>
          )}
        </Space>
      </Space>
    </Card>
  );
}
