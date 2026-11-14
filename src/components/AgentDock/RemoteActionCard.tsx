import { useEffect, useRef, useState } from 'react';
import { useIntl } from '@umijs/max';
import { Alert, App, Button, Card, Descriptions, Input, Space, Typography } from 'antd';
import AuthButton from '@/components/AuthButton';
import DictTag from '@/components/DictTag';
import { currentUserSnapshot } from '@/services/auth';
import {
  cancelAgentRemoteAction,
  confirmAgentRemoteAction,
  getAgentRemoteAction,
  type AgentRemoteAction,
} from '@/services/agent';

/** 通用业务写卡片。凭证只留在当前对话内存，发送失败后只查询状态，不重放执行。 */
export default function RemoteActionCard({
  action,
  onChange,
  onOpenProjects,
}: {
  action: AgentRemoteAction;
  onChange: (next: AgentRemoteAction) => void;
  onOpenProjects: () => void;
}) {
  const intl = useIntl();
  const t = (key: string) => intl.formatMessage({ id: `agent.remoteAction.${key}` });
  const { message } = App.useApp();
  const [busy, setBusy] = useState(false);
  const [typedPhrase, setTypedPhrase] = useState('');
  const [now, setNow] = useState(Date.now());
  const locked = useRef(false);
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
    if (kind === 'confirm') {
      // 已经触发确认后不能根据浏览器网络异常判断业务未执行。
      onChange({
        ...action,
        confirmationToken: undefined,
        confirmationPhrase: undefined,
        status: 'EXECUTING',
      });
    }
    try {
      const next =
        kind === 'confirm' && token
          ? await confirmAgentRemoteAction(
              action.actionId,
              token,
              action.confirmationMode === 'STRONG' ? typedPhrase : undefined,
            )
          : kind === 'cancel'
            ? await cancelAgentRemoteAction(action.actionId)
            : await getAgentRemoteAction(action.actionId);
      onChange({
        ...next,
        confirmationToken: kind === 'refresh' && next.status === 'PENDING' ? token : undefined,
        confirmationPhrase:
          kind === 'refresh' && next.status === 'PENDING' ? action.confirmationPhrase : undefined,
      });
    } catch (failure) {
      if (kind === 'confirm') {
        onChange({
          ...action,
          confirmationToken: undefined,
          confirmationPhrase: undefined,
          status: 'UNKNOWN',
        });
      }
      void message.error(failure instanceof Error ? failure.message : t('requestFailed'));
    } finally {
      locked.current = false;
      setBusy(false);
    }
  };

  const items = Object.entries(action.displayFields ?? {}).map(([key, value]) => ({
    key,
    label: action.displayLabels?.[key] || key,
    children: value,
  }));
  const resultItems = Object.entries(action.result ?? {}).flatMap(([key, value]) => {
    const label = action.displayLabels?.[key];
    return label ? [{ key, label, children: String(value) }] : [];
  });
  return (
    <Card
      title={action.capabilityName || t('title')}
      size="small"
      style={{ marginBlock: 12, maxWidth: 900 }}
    >
      <Space direction="vertical" size={12} style={{ width: '100%' }}>
        <DictTag dictCode="agent.remote_action.status" value={status} />
        <Descriptions
          column={1}
          size="small"
          items={[
            { key: 'project', label: t('project'), children: action.projectCode },
            { key: 'affected', label: t('affectedCount'), children: action.affectedCount },
            ...items,
          ]}
        />
        {status === 'PENDING' && (
          <>
            <Alert
              type="info"
              showIcon
              message={t('pendingHint')}
              description={action.confirmationToken ? t('reviewHint') : t('noToken')}
            />
            {action.confirmationMode === 'STRONG' && action.confirmationToken && (
              <Input
                aria-label={t('strongPrompt')}
                placeholder={intl.formatMessage(
                  { id: 'agent.remoteAction.strongPlaceholder' },
                  { phrase: action.confirmationPhrase ?? '' },
                )}
                value={typedPhrase}
                onChange={(event) => setTypedPhrase(event.target.value)}
                autoComplete="off"
              />
            )}
            <Typography.Text type="secondary">
              {intl.formatMessage(
                { id: 'agent.remoteAction.expiresIn' },
                {
                  seconds: Math.max(
                    0,
                    Math.ceil((new Date(action.expiresAt).getTime() - now) / 1000),
                  ),
                },
              )}
            </Typography.Text>
          </>
        )}
        {(status === 'EXECUTING' || status === 'UNKNOWN') && (
          <Alert type="warning" showIcon message={t('unknownHint')} />
        )}
        {(status === 'FAILED' || status === 'REJECTED') && (
          <Alert type="error" showIcon message={t('failedHint')} />
        )}
        {status === 'EXPIRED' && <Alert type="warning" showIcon message={t('expiredHint')} />}
        {status === 'SUCCEEDED' && (
          <>
            <Alert type="success" showIcon message={t('successHint')} />
            {resultItems.length > 0 && (
              <Descriptions column={1} size="small" title={t('result')} items={resultItems} />
            )}
          </>
        )}
        <Space wrap className="agent-dock-card-actions">
          {status === 'PENDING' && (
            <>
              <AuthButton
                type="primary"
                permission="system:agent:ask"
                permissions={currentUserSnapshot()?.permissions ?? []}
                loading={busy}
                disabled={
                  busy ||
                  !action.confirmationToken ||
                  (action.confirmationMode === 'STRONG' &&
                    typedPhrase !== action.confirmationPhrase)
                }
                onClick={() => void run('confirm')}
              >
                {t('confirm')}
              </AuthButton>
              <Button disabled={busy} onClick={() => void run('cancel')}>
                {t('cancel')}
              </Button>
            </>
          )}
          <Button disabled={busy} onClick={() => void run('refresh')}>
            {t('refresh')}
          </Button>
          <AuthButton
            type="link"
            permission="system:project:list"
            permissions={currentUserSnapshot()?.permissions ?? []}
            onClick={onOpenProjects}
          >
            {intl.formatMessage({ id: 'agent.projects.title' })}
          </AuthButton>
        </Space>
      </Space>
    </Card>
  );
}
