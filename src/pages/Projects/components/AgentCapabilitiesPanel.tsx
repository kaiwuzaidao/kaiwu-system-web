import { useIntl } from '@umijs/max';
import { ProTable } from '@ant-design/pro-components';
import {
  Alert,
  App,
  Button,
  Checkbox,
  Collapse,
  Descriptions,
  Empty,
  Input,
  Modal,
  Popconfirm,
  Space,
  Typography,
} from 'antd';
import { useCallback, useEffect, useRef, useState } from 'react';
import AuthButton from '@/components/AuthButton';
import DictTag from '@/components/DictTag';
import {
  getAgentCapability,
  listAgentCapabilities,
  revokeAgentCredential,
  reviewAgentCapability,
  reviewAgentCapabilitiesBatch,
  rotateAgentCredential,
  type AgentCredential,
  type AgentManifestDetail,
  type AgentRegistration,
} from '@/services/agentRegistry';
import { useLocaleFormatters } from '@/utils/format';
import type { ProjectPermissionProps } from './types';

export default function AgentCapabilitiesPanel({ project, permissions }: ProjectPermissionProps) {
  const intl = useIntl();
  const t = useCallback(
    (key: string, values?: Record<string, string | number>) =>
      intl.formatMessage({ id: `agent.registry.${key}` }, values),
    [intl],
  );
  const descriptionLabel = intl.formatMessage({ id: 'agent.local.description' });
  const { message } = App.useApp();
  const format = useLocaleFormatters();
  const active = useRef(true);
  const loadSequence = useRef(0);
  const [rows, setRows] = useState<AgentRegistration[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [detail, setDetail] = useState<AgentManifestDetail>();
  const [credential, setCredential] = useState<AgentCredential>();
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [batchDetails, setBatchDetails] = useState<AgentManifestDetail[]>([]);
  const [batchLoading, setBatchLoading] = useState(false);
  const [batchReviewed, setBatchReviewed] = useState(false);
  const load = useCallback(async () => {
    const sequence = ++loadSequence.current;
    setLoading(true);
    try {
      const data = await listAgentCapabilities(project.id);
      if (active.current && sequence === loadSequence.current) {
        setRows(data);
        setSelectedKeys([]);
        setError('');
      }
    } catch (failure) {
      if (active.current && sequence === loadSequence.current) {
        setRows([]);
        setError(failure instanceof Error ? failure.message : t('loadFailed'));
      }
    } finally {
      if (active.current && sequence === loadSequence.current) setLoading(false);
    }
  }, [project.id, t]);
  useEffect(() => {
    active.current = true;
    void load();
    return () => {
      active.current = false;
    };
  }, [load]);
  const mutate = async (operation: () => Promise<unknown>, rotating = false) => {
    if (busy) return;
    setBusy(true);
    try {
      await operation();
      if (active.current) {
        setDetail(undefined);
        void message.success(t('updated'));
        await load();
      }
    } catch (failure) {
      if (active.current) {
        setDetail(undefined);
        void message.error(
          rotating ? t('unknownOutcome') : failure instanceof Error ? failure.message : t('failed'),
        );
        await load();
      }
    } finally {
      if (active.current) setBusy(false);
    }
  };
  const inspect = async (row: AgentRegistration) => {
    setBusy(true);
    try {
      const loaded = await getAgentCapability(project.id, row.capabilityCode);
      JSON.parse(loaded.manifestJson);
      if (active.current) setDetail(loaded);
    } catch (failure) {
      if (active.current)
        void message.error(failure instanceof Error ? failure.message : t('failed'));
    } finally {
      if (active.current) setBusy(false);
    }
  };
  const action = (
    status: AgentRegistration['status'],
    label: string,
    confirm: string,
    disabled = false,
  ) => (
    <Popconfirm
      key={status}
      title={t(confirm)}
      onConfirm={() =>
        detail && mutate(() => reviewAgentCapability(project.id, detail.registration, status))
      }
    >
      <AuthButton
        permission="system:project:update"
        permissions={permissions}
        loading={busy}
        disabled={busy || disabled}
        danger={status === 'REVOKED'}
      >
        {t(label)}
      </AuthButton>
    </Popconfirm>
  );
  const writeManifest = detail ? JSON.parse(detail.manifestJson).readOnly === false : false;
  const selected = rows.filter((row) => selectedKeys.includes(row.id));
  const openBatch = async () => {
    if (batchLoading || busy || selected.length === 0) return;
    setBatchLoading(true);
    try {
      const loaded = await Promise.all(
        selected.map((row) => getAgentCapability(project.id, row.capabilityCode)),
      );
      if (
        loaded.some(
          ({ registration, manifestJson }, index) =>
            registration.id !== selected[index].id ||
            registration.version !== selected[index].version ||
            registration.manifestHash !== selected[index].manifestHash ||
            registration.status !== 'PENDING' ||
            !registration.online ||
            !registration.readOnly ||
            JSON.parse(manifestJson).readOnly !== true,
        )
      ) {
        void message.error(t('batchChanged'));
        await load();
        return;
      }
      if (active.current) {
        setBatchReviewed(false);
        setBatchDetails(loaded);
      }
    } catch (failure) {
      void message.error(failure instanceof Error ? failure.message : t('failed'));
      await load();
    } finally {
      if (active.current) setBatchLoading(false);
    }
  };
  const submitBatch = async () => {
    if (busy || !batchReviewed || batchDetails.length === 0) return;
    setBusy(true);
    try {
      await reviewAgentCapabilitiesBatch(
        project.id,
        batchDetails.map((item) => item.registration),
      );
      void message.success(t('updated'));
    } catch (failure) {
      void message.error(failure instanceof Error ? failure.message : t('failed'));
    } finally {
      if (active.current) {
        setBatchDetails([]);
        setBatchReviewed(false);
        await load();
        setBusy(false);
      }
    }
  };
  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Alert type="info" showIcon message={t('intro')} description={t('boundary')} />
      <Space wrap>
        <Button onClick={() => void load()} loading={loading} disabled={busy}>
          {t('refresh')}
        </Button>
        <AuthButton
          permission="system:project:update"
          permissions={permissions}
          disabled={busy || selected.length === 0}
          loading={batchLoading}
          onClick={() => void openBatch()}
        >
          {t('batchApprove', { count: selected.length })}
        </AuthButton>
        <Popconfirm
          title={t('rotateConfirm')}
          onConfirm={() =>
            mutate(async () => {
              setCredential(undefined);
              const issued = await rotateAgentCredential(project.id);
              if (active.current) setCredential(issued);
            }, true)
          }
        >
          <AuthButton
            permission="system:project:update"
            permissions={permissions}
            loading={busy}
            disabled={busy || project.status !== 'ACTIVE'}
          >
            {t('issue')}
          </AuthButton>
        </Popconfirm>
        <Popconfirm
          title={t('revokeCredentialConfirm')}
          onConfirm={() =>
            mutate(async () => {
              setCredential(undefined);
              await revokeAgentCredential(project.id);
            })
          }
        >
          <AuthButton
            danger
            permission="system:project:update"
            permissions={permissions}
            loading={busy}
            disabled={busy}
          >
            {t('revokeCredential')}
          </AuthButton>
        </Popconfirm>
      </Space>
      {error && <Alert type="error" showIcon message={t('loadFailed')} description={error} />}
      <ProTable<AgentRegistration>
        rowKey="id"
        rowSelection={{
          selectedRowKeys: selectedKeys,
          onChange: (keys) => {
            if (keys.length > 50) {
              void message.error(t('batchMax'));
              return;
            }
            setSelectedKeys(keys.map(String));
          },
          getCheckboxProps: (row) => ({
            disabled:
              busy ||
              !permissions.includes('system:project:update') ||
              row.status !== 'PENDING' ||
              !row.online ||
              !row.readOnly,
          }),
        }}
        loading={loading}
        dataSource={rows}
        search={false}
        options={false}
        pagination={false}
        scroll={{ x: 900 }}
        locale={{ emptyText: <Empty description={t('empty')} /> }}
        columns={[
          {
            title: descriptionLabel,
            dataIndex: 'description',
            width: 360,
            render: (_, row) => (
              <Typography.Text style={{ whiteSpace: 'normal', overflowWrap: 'anywhere' }}>
                {row.description || '—'}
              </Typography.Text>
            ),
          },
          { title: t('code'), dataIndex: 'capabilityCode', width: 280 },
          { title: t('version'), dataIndex: 'version' },
          {
            title: t('status'),
            render: (_, row) => <DictTag dictCode="agent.capability.status" value={row.status} />,
          },
          {
            title: t('online'),
            render: (_, row) => (
              <DictTag
                dictCode="agent.capability.connection"
                value={row.online ? 'ONLINE' : 'OFFLINE'}
              />
            ),
          },
          { title: t('lastSeen'), render: (_, row) => format.dateTime(row.lastSeenAt) },
          {
            title: t('actions'),
            render: (_, row) => (
              <AuthButton
                type="link"
                permission="system:project:list"
                permissions={permissions}
                disabled={busy}
                onClick={() => void inspect(row)}
              >
                {t('detail')}
              </AuthButton>
            ),
          },
        ]}
      />
      <Modal
        title={t('batchReviewTitle', { count: batchDetails.length })}
        open={batchDetails.length > 0}
        width="min(1000px, 94vw)"
        onCancel={() => !busy && setBatchDetails([])}
        onOk={() => void submitBatch()}
        okText={t('batchApprove', { count: batchDetails.length })}
        okButtonProps={{ disabled: !batchReviewed || busy }}
        confirmLoading={busy}
        destroyOnHidden
      >
        <Space direction="vertical" style={{ width: '100%' }}>
          <Alert type="warning" showIcon message={t('batchReviewHint')} />
          <Collapse
            items={batchDetails.map(({ registration, manifestJson }) => ({
              key: registration.id,
              label: (
                <Space wrap>
                  <Typography.Text strong>{JSON.parse(manifestJson).description}</Typography.Text>
                  <Typography.Text code>{registration.capabilityCode}</Typography.Text>
                  <Typography.Text>{registration.version}</Typography.Text>
                  <Typography.Text>{registration.manifestHash}</Typography.Text>
                </Space>
              ),
              children: (
                <pre
                  style={{
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                    maxHeight: 300,
                    overflow: 'auto',
                  }}
                >
                  {JSON.stringify(JSON.parse(manifestJson), null, 2)}
                </pre>
              ),
            }))}
          />
          <Checkbox
            checked={batchReviewed}
            onChange={(event) => setBatchReviewed(event.target.checked)}
          >
            {t('batchAcknowledge')}
          </Checkbox>
        </Space>
      </Modal>
      <Modal
        title={t('manifest')}
        open={Boolean(detail)}
        width="min(1000px, 94vw)"
        destroyOnHidden
        onCancel={() => !busy && setDetail(undefined)}
        closable={!busy}
        maskClosable={!busy}
        footer={
          detail ? (
            <Space wrap>
              {action(
                'APPROVED',
                writeManifest ? 'approveWrite' : 'approve',
                writeManifest ? 'approveWriteConfirm' : 'approveConfirm',
                detail.registration.status !== 'PENDING' || !detail.registration.online,
              )}
              {action(
                'REVOKED',
                'revoke',
                'revokeConfirm',
                detail.registration.status === 'REVOKED',
              )}
              {action(
                'PENDING',
                'reopen',
                'reopenConfirm',
                detail.registration.status !== 'REVOKED',
              )}
              <Button disabled={busy} onClick={() => setDetail(undefined)}>
                {t('close')}
              </Button>
            </Space>
          ) : null
        }
      >
        {detail && (
          <Space direction="vertical" style={{ width: '100%' }}>
            <Alert
              type={writeManifest ? 'warning' : 'info'}
              message={t(writeManifest ? 'writeApprovalHint' : 'approvalHint')}
            />
            <Descriptions
              column={1}
              items={[
                {
                  key: 'description',
                  label: descriptionLabel,
                  children: JSON.parse(detail.manifestJson).description,
                },
                { key: 'code', label: t('code'), children: detail.registration.capabilityCode },
                { key: 'version', label: t('version'), children: detail.registration.version },
                {
                  key: 'hash',
                  label: t('hash'),
                  children: (
                    <Typography.Text style={{ wordBreak: 'break-all' }}>
                      {detail.registration.manifestHash}
                    </Typography.Text>
                  ),
                },
              ]}
            />
            <pre
              style={{
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                maxHeight: '50vh',
                overflow: 'auto',
                background: '#f5f5f5',
                padding: 16,
              }}
            >
              {JSON.stringify(JSON.parse(detail.manifestJson), null, 2)}
            </pre>
          </Space>
        )}
      </Modal>
      <Modal
        title={t('credentialTitle')}
        open={Boolean(credential)}
        destroyOnHidden
        onCancel={() => setCredential(undefined)}
        footer={<Button onClick={() => setCredential(undefined)}>{t('close')}</Button>}
      >
        <Space direction="vertical" style={{ width: '100%' }}>
          <Alert type="warning" message={t('credentialHint')} />
          <Input.Password
            aria-label={t('credentialLabel')}
            readOnly
            value={credential?.token ?? ''}
            autoComplete="off"
          />
          <Button
            onClick={async () => {
              try {
                if (credential) {
                  await navigator.clipboard.writeText(credential.token);
                  void message.success(t('copied'));
                }
              } catch {
                void message.error(t('failed'));
              }
            }}
          >
            {t('copy')}
          </Button>
        </Space>
      </Modal>
    </Space>
  );
}
