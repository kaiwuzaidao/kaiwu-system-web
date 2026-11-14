import usePlatformUiPreference from '@/hooks/usePlatformUiPreferences';
import {
  CheckCircleFilled,
  CloseCircleFilled,
  CloudDownloadOutlined,
  EditOutlined,
  FieldTimeOutlined,
  ReloadOutlined,
  RocketOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import { ModalForm, PageContainer, ProCard } from '@ant-design/pro-components';
import { history, useIntl } from '@umijs/max';
import {
  Alert,
  App,
  Button,
  Card,
  Col,
  Descriptions,
  Empty,
  List,
  Modal,
  Progress,
  Row,
  Space,
  Table,
  Tabs,
  Tooltip,
  Typography,
} from 'antd';
import { useCallback, useEffect, useMemo, useState } from 'react';
import AuthButton from '@/components/AuthButton';
import DictTag from '@/components/DictTag';
import { currentUserSnapshot } from '@/services/auth';
import {
  downloadProjectArtifact,
  queryProjectGenerationInput,
  queryProjectGenerations,
  retryProjectGeneration,
  type ProjectGeneration,
  type ProjectGenerationEditableInput,
  type ProjectGenerationRetryInput,
} from '@/services/projectFactory';
import { kaiwuPalette } from '@/theme/tokens';
import { useLocaleFormatters } from '@/utils/format';

type StatTone = 'primary' | 'success' | 'error' | 'warning' | 'default';

function deliveryReadiness(task: ProjectGeneration) {
  return [
    task.status === 'SUCCESS',
    task.backendFiles.length > 0,
    task.frontendFiles.length > 0,
  ].filter(Boolean).length;
}

export default function ProjectFactoryPage() {
  const pollSeconds = usePlatformUiPreference('platform.factory.poll_seconds');
  const { message } = App.useApp();
  const intl = useIntl();
  const format = useLocaleFormatters();
  const permissions = currentUserSnapshot()?.permissions ?? [];
  const [tasks, setTasks] = useState<ProjectGeneration[]>([]);
  const [retryTask, setRetryTask] = useState<ProjectGeneration>();
  const [retryInput, setRetryInput] = useState<ProjectGenerationEditableInput>();
  const [preview, setPreview] = useState<ProjectGeneration>();
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setTasks(await queryProjectGenerations());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load().catch((error: Error) => message.error(error.message));
  }, [load, message]);

  useEffect(() => {
    const active = tasks.some((task) => ['PENDING', 'RUNNING'].includes(task.status));
    if (!active) return undefined;
    const timer = window.setInterval(() => {
      void load().catch(() => {
        /* 自动轮询失败时保留现有结果，用户可手动刷新。 */
      });
    }, pollSeconds * 1000);
    return () => window.clearInterval(timer);
  }, [load, tasks, pollSeconds]);

  const stats = useMemo(() => {
    const total = tasks.length;
    const running = tasks.filter(
      (task) => task.status === 'PENDING' || task.status === 'RUNNING',
    ).length;
    const success = tasks.filter((task) => task.status === 'SUCCESS').length;
    const failed = tasks.filter((task) => task.status === 'FAILED').length;
    return { total, running, success, failed };
  }, [tasks]);

  return (
    <PageContainer
      header={{
        title: intl.formatMessage({ id: 'factory.title' }),
        breadcrumb: {},
      }}
      content={
        <Typography.Text type="secondary" style={{ fontSize: 13 }}>
          {intl.formatMessage({ id: 'factory.description' })}
        </Typography.Text>
      }
      extra={[
        <Button
          key="refresh"
          icon={<ReloadOutlined />}
          loading={loading}
          onClick={() =>
            void load().catch((error) =>
              message.error(error instanceof Error ? error.message : String(error)),
            )
          }
        >
          {intl.formatMessage({ id: 'factory.refresh' })}
        </Button>,
        <Button
          key="new"
          type="primary"
          icon={<RocketOutlined />}
          onClick={() => history.push('/projects')}
        >
          {intl.formatMessage({ id: 'factory.newProject' })}
        </Button>,
      ]}
    >
      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={12} sm={12} lg={6}>
          <StatCard
            label={intl.formatMessage({ id: 'factory.stat.total' })}
            value={stats.total}
            hint={intl.formatMessage({ id: 'factory.stat.totalHint' })}
            tone="primary"
            icon={<ThunderboltOutlined />}
          />
        </Col>
        <Col xs={12} sm={12} lg={6}>
          <StatCard
            label={intl.formatMessage({ id: 'factory.stat.running' })}
            value={stats.running}
            hint={intl.formatMessage({ id: 'factory.stat.runningHint' })}
            tone={stats.running > 0 ? 'warning' : 'default'}
            icon={<FieldTimeOutlined />}
          />
        </Col>
        <Col xs={12} sm={12} lg={6}>
          <StatCard
            label={intl.formatMessage({ id: 'factory.stat.success' })}
            value={stats.success}
            hint={intl.formatMessage({ id: 'factory.stat.ready' })}
            tone="success"
            icon={<CheckCircleFilled />}
          />
        </Col>
        <Col xs={12} sm={12} lg={6}>
          <StatCard
            label={intl.formatMessage({ id: 'factory.stat.failed' })}
            value={stats.failed}
            hint={
              stats.failed > 0
                ? intl.formatMessage({ id: 'factory.stat.retry' })
                : intl.formatMessage({ id: 'factory.stat.noFailure' })
            }
            tone={stats.failed > 0 ? 'error' : 'default'}
            icon={<CloseCircleFilled />}
          />
        </Col>
      </Row>

      <ProCard
        title={intl.formatMessage({ id: 'factory.myTasks' })}
        subTitle={
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {intl.formatMessage({ id: 'factory.taskCount' }, { count: stats.total })}
          </Typography.Text>
        }
        bordered={false}
        headerBordered
      >
        <Table<ProjectGeneration>
          sticky
          rowKey="taskNo"
          dataSource={tasks}
          loading={loading}
          scroll={{ x: 1370 }}
          pagination={{ pageSize: 10, showSizeChanger: false }}
          locale={{
            emptyText: (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description={intl.formatMessage({ id: 'factory.empty' })}
              />
            ),
          }}
          columns={[
            {
              title: intl.formatMessage({ id: 'factory.column.project' }),
              width: 200,
              render: (_, task) => (
                <Space direction="vertical" size={0}>
                  <Typography.Text strong ellipsis={{ tooltip: task.projectName }}>
                    {task.projectName}
                  </Typography.Text>
                  <Typography.Text
                    type="secondary"
                    ellipsis={{ tooltip: task.projectCode }}
                    style={{
                      fontSize: 12,
                      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                    }}
                  >
                    {task.projectCode}
                  </Typography.Text>
                </Space>
              ),
            },
            {
              title: intl.formatMessage({ id: 'factory.column.mode' }),
              dataIndex: 'generationMode',
              width: 120,
              render: (value) => (
                <DictTag dictCode="project.generation.mode" value={value as string} />
              ),
            },
            {
              title: intl.formatMessage({ id: 'factory.column.status' }),
              dataIndex: 'status',
              width: 110,
              render: (value) => (
                <DictTag dictCode="project.generation.status" value={value as string} />
              ),
            },
            {
              title: intl.formatMessage({ id: 'factory.column.failure' }),
              width: 280,
              render: (_, task) => {
                if (task.status !== 'FAILED') return '-';
                const detail =
                  task.lastError?.trim() || intl.formatMessage({ id: 'factory.failure.unknown' });
                return (
                  <Tooltip title={detail} placement="topLeft">
                    <Typography.Paragraph
                      type="danger"
                      copyable={Boolean(task.lastError)}
                      ellipsis={{ rows: 2 }}
                      style={{ marginBottom: 0, maxWidth: 260 }}
                    >
                      {detail}
                    </Typography.Paragraph>
                  </Tooltip>
                );
              },
            },
            {
              title: intl.formatMessage({ id: 'factory.column.readiness' }),
              width: 170,
              render: (_, task) => (
                <Tooltip title={intl.formatMessage({ id: 'factory.readiness.tooltip' })}>
                  <Progress
                    percent={Math.round((deliveryReadiness(task) / 3) * 100)}
                    size="small"
                    strokeColor="#3B82F6"
                    status={task.status === 'FAILED' ? 'exception' : 'normal'}
                  />
                </Tooltip>
              ),
            },
            {
              title: intl.formatMessage({ id: 'factory.column.createdAt' }),
              dataIndex: 'createdAt',
              width: 170,
              render: (value: string) =>
                value ? (
                  <Typography.Text style={{ fontSize: 12, fontVariantNumeric: 'tabular-nums' }}>
                    {format.dateTime(value)}
                  </Typography.Text>
                ) : (
                  '-'
                ),
            },
            {
              title: intl.formatMessage({ id: 'factory.column.actions' }),
              width: 320,
              render: (_, task) => (
                <Space wrap size={4}>
                  <Button type="link" size="small" onClick={() => setPreview(task)}>
                    {intl.formatMessage({ id: 'factory.action.details' })}
                  </Button>
                  <AuthButton
                    type="link"
                    size="small"
                    icon={<CloudDownloadOutlined />}
                    permission="system:project-factory:download"
                    permissions={permissions}
                    disabled={task.status !== 'SUCCESS'}
                    onClick={() =>
                      void downloadProjectArtifact(task, 'BACKEND').catch((error) =>
                        message.error(error instanceof Error ? error.message : String(error)),
                      )
                    }
                  >
                    {intl.formatMessage({ id: 'factory.action.backendZip' })}
                  </AuthButton>
                  <AuthButton
                    type="link"
                    size="small"
                    icon={<CloudDownloadOutlined />}
                    permission="system:project-factory:download"
                    permissions={permissions}
                    disabled={task.status !== 'SUCCESS'}
                    onClick={() =>
                      void downloadProjectArtifact(task, 'FRONTEND').catch((error) =>
                        message.error(error instanceof Error ? error.message : String(error)),
                      )
                    }
                  >
                    {intl.formatMessage({ id: 'factory.action.frontendZip' })}
                  </AuthButton>
                  {task.status === 'FAILED' && task.generationMode === 'BASIC_SCAFFOLD' && (
                    <AuthButton
                      type="link"
                      size="small"
                      icon={<EditOutlined />}
                      permission="system:project-factory:generate"
                      permissions={permissions}
                      onClick={async () => {
                        try {
                          const input = await queryProjectGenerationInput(task.taskNo);
                          setRetryInput(input);
                          setRetryTask(task);
                        } catch (error) {
                          void message.error(
                            error instanceof Error ? error.message : String(error),
                          );
                        }
                      }}
                    >
                      {intl.formatMessage({ id: 'factory.action.retry' })}
                    </AuthButton>
                  )}
                </Space>
              ),
            },
          ]}
        />
      </ProCard>

      <ModalForm<ProjectGenerationRetryInput>
        grid
        rowProps={{ gutter: 16 }}
        width={640}
        key={retryTask?.taskNo}
        title={intl.formatMessage(
          { id: 'factory.retry.title' },
          { project: retryTask?.projectName ?? '' },
        )}
        open={Boolean(retryTask && retryInput)}
        initialValues={retryInput}
        onOpenChange={(open) => {
          if (!open) {
            setRetryTask(undefined);
            setRetryInput(undefined);
          }
        }}
        modalProps={{ destroyOnHidden: true }}
        submitter={{
          searchConfig: { submitText: intl.formatMessage({ id: 'factory.retry.submit' }) },
        }}
        onFinish={async (values) => {
          try {
            if (!retryTask) return false;
            await retryProjectGeneration(retryTask.taskNo, values);
            void message.success(intl.formatMessage({ id: 'factory.retry.success' }));
            setRetryTask(undefined);
            setRetryInput(undefined);
            await load();
            return true;
          } catch (error) {
            // ProForm 会吞掉 onFinish 的异常，必须在此显式提示，否则表单静默失败。
            void message.error(error instanceof Error ? error.message : String(error));
            return false;
          }
        }}
      >
        <Alert
          showIcon
          type="warning"
          style={{ marginBottom: 16 }}
          message={retryTask?.lastError || intl.formatMessage({ id: 'factory.retry.lastFailed' })}
          description={intl.formatMessage({ id: 'factory.retry.description' })}
        />
        <Alert showIcon type="info" message={intl.formatMessage({ id: 'factory.retry.basic' })} />
      </ModalForm>

      <Modal
        width={780}
        title={
          preview
            ? intl.formatMessage(
                { id: 'factory.preview.projectTitle' },
                { project: preview.projectName },
              )
            : intl.formatMessage({ id: 'factory.preview.title' })
        }
        open={Boolean(preview)}
        onCancel={() => setPreview(undefined)}
        footer={
          <Button onClick={() => setPreview(undefined)}>
            {intl.formatMessage({ id: 'factory.preview.close' })}
          </Button>
        }
        destroyOnHidden
      >
        {preview && (
          <>
            {preview.lastError && (
              <Alert
                showIcon
                type="error"
                style={{ marginBottom: 16 }}
                message={intl.formatMessage({ id: 'factory.preview.error' })}
                description={preview.lastError}
              />
            )}
            <Tabs
              defaultActiveKey="overview"
              items={[
                {
                  key: 'overview',
                  label: intl.formatMessage({ id: 'factory.preview.overview' }),
                  children: (
                    <Descriptions size="small" column={2} colon={false}>
                      <Descriptions.Item
                        label={intl.formatMessage({ id: 'factory.preview.taskNo' })}
                      >
                        <Typography.Text
                          copyable
                          style={{
                            fontSize: 12,
                            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                          }}
                        >
                          {preview.taskNo}
                        </Typography.Text>
                      </Descriptions.Item>
                      <Descriptions.Item
                        label={intl.formatMessage({ id: 'factory.preview.template' })}
                      >
                        {preview.templateVersion}
                      </Descriptions.Item>
                      <Descriptions.Item
                        label={intl.formatMessage({ id: 'factory.preview.model' })}
                      >
                        {preview.aiModel || '-'}
                      </Descriptions.Item>
                      <Descriptions.Item
                        label={intl.formatMessage({ id: 'factory.preview.completedAt' })}
                      >
                        {format.dateTime(preview.completedAt)}
                      </Descriptions.Item>
                      <Descriptions.Item
                        label={intl.formatMessage({ id: 'factory.preview.summary' })}
                        span={2}
                      >
                        <Typography.Paragraph
                          style={{ margin: 0, whiteSpace: 'pre-wrap' }}
                          type={preview.designSummary ? undefined : 'secondary'}
                        >
                          {preview.designSummary || '-'}
                        </Typography.Paragraph>
                      </Descriptions.Item>
                    </Descriptions>
                  ),
                },
                {
                  key: 'backend',
                  label: intl.formatMessage(
                    { id: 'factory.preview.backendFiles' },
                    { count: preview.backendFiles.length },
                  ),
                  children: <FileList files={preview.backendFiles} />,
                },
                {
                  key: 'frontend',
                  label: intl.formatMessage(
                    { id: 'factory.preview.frontendFiles' },
                    { count: preview.frontendFiles.length },
                  ),
                  children: <FileList files={preview.frontendFiles} />,
                },
              ]}
            />
          </>
        )}
      </Modal>
    </PageContainer>
  );
}

function StatCard({
  label,
  value,
  hint,
  tone,
  icon,
}: {
  label: string;
  value: number | string;
  hint?: string;
  tone: StatTone;
  icon: React.ReactNode;
}) {
  const toneMap: Record<StatTone, { bg: string; fg: string; bar: string }> = {
    primary: { bg: kaiwuPalette.primarySoft, fg: kaiwuPalette.primary, bar: kaiwuPalette.primary },
    success: { bg: 'rgba(82,196,26,0.12)', fg: '#389e0d', bar: '#52c41a' },
    warning: { bg: 'rgba(250,173,20,0.14)', fg: '#d48806', bar: '#faad14' },
    error: { bg: 'rgba(255,77,79,0.12)', fg: '#cf1322', bar: '#ff4d4f' },
    default: {
      bg: 'rgba(0,0,0,0.04)',
      fg: kaiwuPalette.textTertiary,
      bar: 'rgba(0,0,0,0.12)',
    },
  };
  const t = toneMap[tone];
  return (
    <Card
      variant="outlined"
      styles={{
        body: {
          padding: '20px 20px 20px 24px',
          position: 'relative',
        },
      }}
      style={{ borderColor: '#f0f0f0', borderRadius: 8, overflow: 'hidden' }}
    >
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          bottom: 0,
          width: 3,
          background: t.bar,
        }}
      />
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 12,
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: 12,
              color: kaiwuPalette.textTertiary,
              lineHeight: 1.2,
            }}
          >
            {label}
          </div>
          <div
            style={{
              fontSize: 30,
              fontWeight: 600,
              lineHeight: 1.15,
              marginTop: 8,
              fontVariantNumeric: 'tabular-nums',
              color: kaiwuPalette.text,
            }}
          >
            {value}
          </div>
          {hint && (
            <div
              style={{
                fontSize: 12,
                color: kaiwuPalette.textTertiary,
                marginTop: 8,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {hint}
            </div>
          )}
        </div>
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: 8,
            background: t.bg,
            color: t.fg,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 16,
            flexShrink: 0,
          }}
        >
          {icon}
        </div>
      </div>
    </Card>
  );
}

function FileList({ files }: { files: string[] }) {
  const intl = useIntl();
  if (files.length === 0) {
    return (
      <Empty
        image={Empty.PRESENTED_IMAGE_SIMPLE}
        description={intl.formatMessage({ id: 'factory.preview.noFiles' })}
      />
    );
  }
  return (
    <List
      size="small"
      style={{ maxHeight: 320, overflow: 'auto' }}
      dataSource={files}
      renderItem={(file) => (
        <List.Item style={{ padding: '6px 0' }}>
          <Typography.Text
            style={{
              fontSize: 12,
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
              color: kaiwuPalette.textSecondary,
            }}
          >
            {file}
          </Typography.Text>
        </List.Item>
      )}
    />
  );
}
