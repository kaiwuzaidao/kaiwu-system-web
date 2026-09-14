import { CodeOutlined } from '@ant-design/icons';
import { ModalForm, ProFormText } from '@ant-design/pro-components';
import { history, useIntl } from '@umijs/max';
import { Alert, App, Button, Divider, Space, Spin, Typography } from 'antd';
import { useState } from 'react';
import LocalAiCodingModal from '@/components/LocalAiCodingModal';
import DictTag from '@/components/DictTag';
import {
  canStartLocalAiCoding,
  pushProjectGeneration,
  type ProjectGeneration,
  type ProjectGenerationPushInput,
} from '@/services/projectFactory';
import type { PlatformProject } from '@/services/projects';

type Props = {
  project?: PlatformProject;
  task?: ProjectGeneration;
  loading: boolean;
  canPush: boolean;
  onClose: () => void;
  onGenerate: (project: PlatformProject) => void;
};

export default function RepositoryDeliveryDialog({
  project,
  task,
  loading,
  canPush,
  onClose,
  onGenerate,
}: Props) {
  const { message } = App.useApp();
  const intl = useIntl();
  const [localCodingOpen, setLocalCodingOpen] = useState(false);
  const pushed = task?.backendPushStatus === 'PUSHED' && task.frontendPushStatus === 'PUSHED';
  const localAiCodingReady = task ? canStartLocalAiCoding(task) : false;

  return (
    <>
      <ModalForm<ProjectGenerationPushInput>
        title={intl.formatMessage(
          { id: 'projects.deliveryTitle' },
          { name: project?.projectName ?? '' },
        )}
        open={Boolean(project)}
        onOpenChange={(open) => {
          if (!open) onClose();
        }}
        modalProps={{ destroyOnHidden: true }}
        submitter={
          !loading && task?.status === 'SUCCESS' && !pushed && canPush
            ? { searchConfig: { submitText: intl.formatMessage({ id: 'projects.pushConfirm' }) } }
            : false
        }
        onFinish={async (values) => {
          try {
            if (!task) return false;
            await pushProjectGeneration(task.taskNo, values);
            void message.success(intl.formatMessage({ id: 'projects.pushQueued' }));
            onClose();
            return true;
          } catch (error) {
            void message.error(error instanceof Error ? error.message : String(error));
            return false;
          }
        }}
      >
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center' }}>
            <Spin />
          </div>
        ) : !task ? (
          <Alert
            showIcon
            type="warning"
            message={intl.formatMessage({ id: 'projects.noGeneration' })}
            description={
              project && (
                <Button
                  type="link"
                  style={{ paddingLeft: 0 }}
                  onClick={() => {
                    onClose();
                    onGenerate(project);
                  }}
                >
                  {intl.formatMessage({ id: 'projects.generateFirst' })}
                </Button>
              )
            }
          />
        ) : task.status === 'FAILED' ? (
          <Alert
            showIcon
            type="error"
            message={intl.formatMessage({ id: 'projects.generationFailed' })}
            description={
              <Space direction="vertical" size={8}>
                <Typography.Text type="danger">
                  {task.lastError || intl.formatMessage({ id: 'projects.noFailure' })}
                </Typography.Text>
                <Button type="link" onClick={() => history.push('/project-factory')}>
                  {intl.formatMessage({ id: 'projects.retryInFactory' })}
                </Button>
              </Space>
            }
          />
        ) : ['PENDING', 'RUNNING'].includes(task.status) ? (
          <Alert
            showIcon
            type="info"
            message={intl.formatMessage({ id: 'projects.generating' })}
            description={
              <Button type="link" onClick={() => history.push('/project-factory')}>
                {intl.formatMessage({ id: 'projects.viewProgress' })}
              </Button>
            }
          />
        ) : (
          <>
            <Alert
              showIcon
              type={pushed ? 'success' : 'info'}
              style={{ marginBottom: 16 }}
              message={intl.formatMessage({
                id: pushed ? 'projects.pushComplete' : 'projects.deliveryChoice',
              })}
              description={intl.formatMessage({
                id: pushed ? 'projects.pushCompleteHint' : 'projects.deliveryChoiceHint',
              })}
            />
            <Space direction="vertical" size={4} style={{ marginBottom: 16 }}>
              <Space>
                <Typography.Text type="secondary">
                  {intl.formatMessage({ id: 'projects.backendRepo' })}
                </Typography.Text>
                <DictTag dictCode="project.repository.push.status" value={task.backendPushStatus} />
                {task.backendRepositoryUrl && (
                  <a href={task.backendRepositoryUrl} target="_blank" rel="noreferrer">
                    {intl.formatMessage({ id: 'projects.openRepo' })}
                  </a>
                )}
              </Space>
              <Space>
                <Typography.Text type="secondary">
                  {intl.formatMessage({ id: 'projects.frontendRepo' })}
                </Typography.Text>
                <DictTag
                  dictCode="project.repository.push.status"
                  value={task.frontendPushStatus}
                />
                {task.frontendRepositoryUrl && (
                  <a href={task.frontendRepositoryUrl} target="_blank" rel="noreferrer">
                    {intl.formatMessage({ id: 'projects.openRepo' })}
                  </a>
                )}
              </Space>
            </Space>
            {localAiCodingReady && (
              <Button
                type="primary"
                icon={<CodeOutlined />}
                onClick={() => setLocalCodingOpen(true)}
              >
                {intl.formatMessage({ id: 'projects.localAiCoding' })}
              </Button>
            )}
            {!pushed && (
              <>
                <ProFormText
                  colProps={{ span: 12 }}
                  name="groupId"
                  label={intl.formatMessage({ id: 'projects.groupId' })}
                  placeholder={intl.formatMessage({ id: 'projects.groupPlaceholder' })}
                />
                <Divider plain>{intl.formatMessage({ id: 'projects.orExisting' })}</Divider>
                <ProFormText
                  colProps={{ span: 12 }}
                  name="backendRepositoryUrl"
                  label={intl.formatMessage({ id: 'projects.backendRepoUrl' })}
                  placeholder={intl.formatMessage({ id: 'projects.backendRepoPlaceholder' })}
                />
                <ProFormText
                  colProps={{ span: 12 }}
                  name="frontendRepositoryUrl"
                  label={intl.formatMessage({ id: 'projects.frontendRepoUrl' })}
                  placeholder={intl.formatMessage({ id: 'projects.frontendRepoPlaceholder' })}
                />
              </>
            )}
          </>
        )}
      </ModalForm>
      <LocalAiCodingModal
        task={localCodingOpen ? task : undefined}
        onClose={() => setLocalCodingOpen(false)}
      />
    </>
  );
}
