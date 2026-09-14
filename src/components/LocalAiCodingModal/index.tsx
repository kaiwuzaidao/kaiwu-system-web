import { CodeOutlined } from '@ant-design/icons';
import { useIntl } from '@umijs/max';
import { Alert, App, Modal, Radio, Space, Typography } from 'antd';
import { useMemo, useState } from 'react';
import type { ProjectGeneration } from '@/services/projectFactory';

type CloneProtocol = 'SSH' | 'HTTPS';

type Props = {
  task?: ProjectGeneration;
  onClose: () => void;
};

function shellQuote(value: string) {
  return `'${value.replaceAll("'", `'"'"'`)}'`;
}

function workspaceCommand(task: ProjectGeneration, protocol: CloneProtocol) {
  const backendUrl = protocol === 'SSH' ? task.backendSshCloneUrl : task.backendHttpCloneUrl;
  const frontendUrl = protocol === 'SSH' ? task.frontendSshCloneUrl : task.frontendHttpCloneUrl;
  if (!backendUrl || !frontendUrl) return '';

  const workspace = `kaiwu-${task.projectCode}-workspace`;
  const backend = `kaiwu-${task.projectCode}-service`;
  const frontend = `kaiwu-${task.projectCode}-web`;
  return [
    `mkdir -p ${shellQuote(workspace)}`,
    `cd ${shellQuote(workspace)}`,
    `git clone ${shellQuote(backendUrl)} ${shellQuote(backend)}`,
    `git clone ${shellQuote(frontendUrl)} ${shellQuote(frontend)}`,
  ].join(' && \\\n');
}

export default function LocalAiCodingModal({ task, onClose }: Props) {
  const { message } = App.useApp();
  const intl = useIntl();
  const [protocol, setProtocol] = useState<CloneProtocol>('SSH');
  const command = useMemo(() => (task ? workspaceCommand(task, protocol) : ''), [protocol, task]);

  return (
    <Modal
      width={760}
      title={intl.formatMessage(
        { id: 'projects.localAiCodingTitle' },
        { name: task?.projectName ?? '' },
      )}
      open={Boolean(task)}
      onCancel={onClose}
      footer={null}
      destroyOnHidden
    >
      <Alert
        showIcon
        type="success"
        icon={<CodeOutlined />}
        message={intl.formatMessage({ id: 'projects.localAiCodingReady' })}
        description={intl.formatMessage({ id: 'projects.localAiCodingDescription' })}
        style={{ marginBottom: 20 }}
      />
      <Space direction="vertical" size={12} style={{ width: '100%' }}>
        <Radio.Group
          value={protocol}
          onChange={(event) => setProtocol(event.target.value as CloneProtocol)}
          optionType="button"
          buttonStyle="solid"
          options={[
            { label: intl.formatMessage({ id: 'projects.localAiCodingSsh' }), value: 'SSH' },
            { label: intl.formatMessage({ id: 'projects.localAiCodingHttps' }), value: 'HTTPS' },
          ]}
        />
        <Typography.Text strong>
          {intl.formatMessage({ id: 'projects.localAiCodingCommand' })}
        </Typography.Text>
        {command ? (
          <Typography.Paragraph
            copyable={{
              text: command,
              onCopy: () =>
                void message.success(intl.formatMessage({ id: 'projects.localAiCodingCopied' })),
            }}
            style={{
              margin: 0,
              padding: 16,
              borderRadius: 8,
              background: '#0f172a',
              color: '#e2e8f0',
              whiteSpace: 'pre-wrap',
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
            }}
          >
            {command}
          </Typography.Paragraph>
        ) : (
          <Alert
            showIcon
            type="warning"
            message={intl.formatMessage({ id: 'projects.localAiCodingCloneMissing' })}
          />
        )}
        <Typography.Text strong>
          {intl.formatMessage({ id: 'projects.localAiCodingNextTitle' })}
        </Typography.Text>
        <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
          {intl.formatMessage({ id: 'projects.localAiCodingNext' })}
        </Typography.Paragraph>
        <Alert
          showIcon
          type="info"
          message={intl.formatMessage({ id: 'projects.localAiCodingBoundary' })}
        />
      </Space>
    </Modal>
  );
}
