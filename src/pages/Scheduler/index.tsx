import { CopyOutlined, KeyOutlined, PlusOutlined, ReloadOutlined } from '@ant-design/icons';
import {
  ModalForm,
  PageContainer,
  ProFormSelect,
  ProFormSwitch,
  ProFormText,
  ProFormTextArea,
  ProTable,
  type ActionType,
  type ProColumns,
} from '@ant-design/pro-components';
import { Alert, App, Button, Empty, Popconfirm, Select, Space, Tabs, Typography } from 'antd';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useIntl } from '@umijs/max';
import AuthButton from '@/components/AuthButton';
import DictTag from '@/components/DictTag';
import { currentUserSnapshot } from '@/services/auth';
import { queryCurrentProjects, type PlatformProject } from '@/services/projects';
import {
  deleteSchedulerJob,
  querySchedulerExecutions,
  querySchedulerHandlers,
  querySchedulerJobs,
  rotateSchedulerCredential,
  saveSchedulerJob,
  type SchedulerExecution,
  type SchedulerHandler,
  type SchedulerJob,
  type SchedulerJobInput,
} from '@/services/scheduler';
import { useLocaleFormatters } from '@/utils/format';

const DEFAULT_ZONE = 'Asia/Shanghai';

export default function SchedulerPage() {
  const { message, modal } = App.useApp();
  const intl = useIntl();
  const format = useLocaleFormatters();
  const permissions = currentUserSnapshot()?.permissions ?? [];
  const jobActionRef = useRef<ActionType>();
  const executionActionRef = useRef<ActionType>();
  const [projects, setProjects] = useState<PlatformProject[]>([]);
  const [projectId, setProjectId] = useState<string>();
  const [handlers, setHandlers] = useState<SchedulerHandler[]>([]);
  const [editing, setEditing] = useState<SchedulerJob>();
  const [formOpen, setFormOpen] = useState(false);

  useEffect(() => {
    void queryCurrentProjects().then((items) => {
      const active = items.filter((item) => item.status === 'ACTIVE');
      setProjects(active);
      setProjectId((current) => current ?? active[0]?.id);
    });
  }, []);

  useEffect(() => {
    if (!projectId) {
      setHandlers([]);
      return;
    }
    void querySchedulerHandlers(projectId)
      .then(setHandlers)
      .catch(() => setHandlers([]));
    jobActionRef.current?.reload();
    executionActionRef.current?.reload();
  }, [projectId]);

  const projectOptions = useMemo(
    () =>
      projects.map((project) => ({
        value: project.id,
        label: intl.formatMessage(
          { id: 'scheduler.projectOption' },
          { name: project.projectName, code: project.projectCode },
        ),
      })),
    [intl, projects],
  );

  const jobColumns: ProColumns<SchedulerJob>[] = [
    {
      title: intl.formatMessage({ id: 'scheduler.job' }),
      render: (_, job) => (
        <Space direction="vertical" size={0}>
          <Typography.Text strong>{job.jobName}</Typography.Text>
          <Typography.Text type="secondary" copyable={{ text: job.taskType }}>
            {job.taskType}
          </Typography.Text>
        </Space>
      ),
    },
    {
      title: intl.formatMessage({ id: 'scheduler.cronZone' }),
      render: (_, job) => (
        <Space direction="vertical" size={0}>
          <Typography.Text code copyable={{ text: job.cronExpression }}>
            {job.cronExpression}
          </Typography.Text>
          <Typography.Text type="secondary">{job.zoneId}</Typography.Text>
        </Space>
      ),
    },
    {
      title: intl.formatMessage({ id: 'scheduler.status' }),
      width: 90,
      render: (_, job) => (
        <DictTag dictCode="common.boolean_enabled" value={job.enabled ? 'true' : 'false'} />
      ),
    },
    {
      title: intl.formatMessage({ id: 'scheduler.version' }),
      dataIndex: 'configVersion',
      width: 70,
      renderText: (value) => `v${value}`,
    },
    {
      title: intl.formatMessage({ id: 'scheduler.lastRun' }),
      dataIndex: 'lastRunTime',
      width: 170,
      render: (_, row) => format.dateTime(row.lastRunTime),
    },
    {
      title: intl.formatMessage({ id: 'scheduler.actions' }),
      valueType: 'option',
      width: 130,
      render: (_, job) => (
        <Space>
          <AuthButton
            type="link"
            size="small"
            permission="system:scheduler:save"
            permissions={permissions}
            onClick={() => {
              setEditing(job);
              setFormOpen(true);
            }}
          >
            {intl.formatMessage({ id: 'scheduler.edit' })}
          </AuthButton>
          <Popconfirm
            title={intl.formatMessage({ id: 'scheduler.deleteConfirm' })}
            onConfirm={async () => {
              await deleteSchedulerJob(job.id);
              void message.success(intl.formatMessage({ id: 'scheduler.deleted' }));
              jobActionRef.current?.reload();
            }}
          >
            <AuthButton
              type="link"
              size="small"
              danger
              permission="system:scheduler:save"
              permissions={permissions}
            >
              {intl.formatMessage({ id: 'scheduler.delete' })}
            </AuthButton>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const executionColumns: ProColumns<SchedulerExecution>[] = [
    { title: intl.formatMessage({ id: 'scheduler.job' }), dataIndex: 'jobName', ellipsis: true },
    {
      title: intl.formatMessage({ id: 'scheduler.scheduledAt' }),
      dataIndex: 'scheduledAt',
      width: 180,
      render: (_, row) => format.dateTime(row.scheduledAt),
    },
    {
      title: intl.formatMessage({ id: 'scheduler.status' }),
      dataIndex: 'status',
      width: 90,
      render: (_, row) => <DictTag dictCode="scheduler.execution.status" value={row.status} />,
    },
    {
      title: intl.formatMessage({ id: 'scheduler.instance' }),
      dataIndex: 'instanceId',
      ellipsis: true,
      copyable: true,
    },
    {
      title: intl.formatMessage({ id: 'scheduler.result' }),
      dataIndex: 'message',
      ellipsis: true,
      render: (_, row) =>
        row.message ? (
          <Typography.Text type={row.status === 'FAILED' ? 'danger' : undefined} copyable>
            {row.message}
          </Typography.Text>
        ) : (
          '-'
        ),
    },
    {
      title: intl.formatMessage({ id: 'scheduler.completedAt' }),
      dataIndex: 'completedAt',
      width: 180,
      render: (_, row) => format.dateTime(row.completedAt),
    },
  ];

  const projectPicker = (
    <Space>
      <Typography.Text strong>{intl.formatMessage({ id: 'scheduler.project' })}</Typography.Text>
      <Select
        value={projectId}
        options={projectOptions}
        showSearch
        optionFilterProp="label"
        placeholder={intl.formatMessage({ id: 'scheduler.selectProject' })}
        style={{ minWidth: 300 }}
        onChange={setProjectId}
      />
    </Space>
  );

  const showCredential = async () => {
    if (!projectId) return;
    const credential = await rotateSchedulerCredential(projectId);
    modal.warning({
      title: intl.formatMessage({ id: 'scheduler.credentialTitle' }),
      width: 680,
      okText: intl.formatMessage({ id: 'scheduler.credentialSaved' }),
      content: (
        <Space direction="vertical" style={{ width: '100%' }}>
          <Alert
            type="warning"
            showIcon
            message={intl.formatMessage({ id: 'scheduler.credentialOnce' })}
          />
          <Typography.Paragraph
            code
            copyable={{ text: credential.token, icon: <CopyOutlined /> }}
            style={{ wordBreak: 'break-all', marginBottom: 0 }}
          >
            {credential.token}
          </Typography.Paragraph>
          <Typography.Text type="secondary">
            {intl.formatMessage({ id: 'scheduler.credentialEnv' })}
          </Typography.Text>
        </Space>
      ),
    });
  };

  return (
    <PageContainer
      title={intl.formatMessage({ id: 'scheduler.title' })}
      subTitle={intl.formatMessage({ id: 'scheduler.subtitle' })}
      extra={[
        <AuthButton
          key="credential"
          icon={<KeyOutlined />}
          permission="system:scheduler:credential"
          permissions={permissions}
          disabled={!projectId}
          onClick={() => void showCredential()}
        >
          {intl.formatMessage({ id: 'scheduler.generateCredential' })}
        </AuthButton>,
      ]}
    >
      <Alert
        showIcon
        type="info"
        style={{ marginBottom: 16 }}
        message={intl.formatMessage({ id: 'scheduler.securityTitle' })}
        description={intl.formatMessage({ id: 'scheduler.securityDescription' })}
      />
      <Tabs
        items={[
          {
            key: 'jobs',
            label: intl.formatMessage({ id: 'scheduler.jobs' }),
            children: (
              <>
                {projectId && handlers.length === 0 && (
                  <Alert
                    showIcon
                    type="warning"
                    style={{ marginBottom: 16 }}
                    message={intl.formatMessage({ id: 'scheduler.noHandlers' })}
                    description={intl.formatMessage({ id: 'scheduler.noHandlersHint' })}
                  />
                )}
                <ProTable<SchedulerJob>
                  sticky
                  rowKey="id"
                  actionRef={jobActionRef}
                  columns={jobColumns}
                  search={false}
                  params={{ projectId }}
                  request={async (params) => {
                    if (!projectId) return { data: [], total: 0, success: true };
                    const page = await querySchedulerJobs({
                      projectId,
                      current: params.current,
                      pageSize: params.pageSize,
                    });
                    return { data: page.records, total: page.total, success: true };
                  }}
                  toolbar={{ title: projectPicker }}
                  toolBarRender={() => [
                    <Button
                      key="reload"
                      icon={<ReloadOutlined />}
                      onClick={() => {
                        if (projectId) {
                          void querySchedulerHandlers(projectId).then(setHandlers);
                        }
                        jobActionRef.current?.reload();
                      }}
                    >
                      {intl.formatMessage({ id: 'scheduler.refresh' })}
                    </Button>,
                    <AuthButton
                      key="create"
                      type="primary"
                      icon={<PlusOutlined />}
                      permission="system:scheduler:save"
                      permissions={permissions}
                      disabled={!projectId || handlers.length === 0}
                      onClick={() => {
                        setEditing(undefined);
                        setFormOpen(true);
                      }}
                    >
                      {intl.formatMessage({ id: 'scheduler.create' })}
                    </AuthButton>,
                  ]}
                  locale={{
                    emptyText: (
                      <Empty
                        image={Empty.PRESENTED_IMAGE_SIMPLE}
                        description={intl.formatMessage({ id: 'scheduler.emptyJobs' })}
                      />
                    ),
                  }}
                />
              </>
            ),
          },
          {
            key: 'executions',
            label: intl.formatMessage({ id: 'scheduler.executions' }),
            children: (
              <ProTable<SchedulerExecution>
                sticky
                rowKey="id"
                actionRef={executionActionRef}
                columns={executionColumns}
                search={false}
                params={{ projectId }}
                request={async (params) => {
                  if (!projectId) return { data: [], total: 0, success: true };
                  const page = await querySchedulerExecutions({
                    projectId,
                    current: params.current,
                    pageSize: params.pageSize,
                  });
                  return { data: page.records, total: page.total, success: true };
                }}
                toolbar={{ title: projectPicker }}
                locale={{
                  emptyText: (
                    <Empty
                      image={Empty.PRESENTED_IMAGE_SIMPLE}
                      description={intl.formatMessage({ id: 'scheduler.emptyExecutions' })}
                    />
                  ),
                }}
              />
            ),
          },
        ]}
      />
      <ModalForm<SchedulerJobInput>
        grid
        rowProps={{ gutter: 16 }}
        width={640}
        key={editing?.id ?? `new-scheduler-${formOpen}`}
        title={intl.formatMessage({
          id: editing ? 'scheduler.editTitle' : 'scheduler.createTitle',
        })}
        open={formOpen}
        initialValues={
          editing ?? {
            projectId,
            cronExpression: '0 0 * * * *',
            zoneId: DEFAULT_ZONE,
            payload: '{}',
            enabled: false,
          }
        }
        modalProps={{
          destroyOnHidden: true,
          onCancel: () => setFormOpen(false),
        }}
        onFinish={async (values) => {
          let parsedPayload: unknown;
          try {
            parsedPayload = JSON.parse(values.payload);
          } catch {
            void message.error(intl.formatMessage({ id: 'scheduler.payloadJson' }));
            return false;
          }
          if (
            parsedPayload === null ||
            Array.isArray(parsedPayload) ||
            typeof parsedPayload !== 'object'
          ) {
            void message.error(intl.formatMessage({ id: 'scheduler.payloadObject' }));
            return false;
          }
          await saveSchedulerJob({ ...values, projectId: projectId! }, editing?.id);
          void message.success(intl.formatMessage({ id: 'scheduler.saved' }));
          setFormOpen(false);
          jobActionRef.current?.reload();
          return true;
        }}
      >
        <ProFormText
          colProps={{ span: 12 }}
          name="jobName"
          label={intl.formatMessage({ id: 'scheduler.name' })}
          rules={[
            { required: true, message: intl.formatMessage({ id: 'scheduler.nameRequired' }) },
          ]}
        />
        <ProFormSelect
          colProps={{ span: 12 }}
          name="taskType"
          label={intl.formatMessage({ id: 'scheduler.handler' })}
          options={handlers.map((handler) => ({
            value: handler.taskType,
            label: intl.formatMessage(
              { id: 'scheduler.handlerOption' },
              { name: handler.taskName, type: handler.taskType },
            ),
          }))}
          rules={[
            { required: true, message: intl.formatMessage({ id: 'scheduler.handlerRequired' }) },
          ]}
          tooltip={intl.formatMessage({ id: 'scheduler.handlerTooltip' })}
        />
        <ProFormText
          colProps={{ span: 12 }}
          name="cronExpression"
          label={intl.formatMessage({ id: 'scheduler.cron' })}
          rules={[{ required: true }]}
          tooltip={intl.formatMessage({ id: 'scheduler.cronTooltip' })}
        />
        <ProFormText
          colProps={{ span: 12 }}
          name="zoneId"
          label={intl.formatMessage({ id: 'scheduler.zone' })}
          rules={[{ required: true }]}
          placeholder={DEFAULT_ZONE}
        />
        <ProFormTextArea
          colProps={{ span: 24 }}
          name="payload"
          label={intl.formatMessage({ id: 'scheduler.payload' })}
          fieldProps={{ rows: 6 }}
          tooltip={intl.formatMessage({ id: 'scheduler.payloadTooltip' })}
          rules={[
            {
              validator: (_: unknown, value: unknown) => {
                // 留空由后端归一为 {}，这里只校验填了内容时必须是 JSON 对象。
                if (!value || !String(value).trim()) return Promise.resolve();
                try {
                  const parsed = JSON.parse(String(value));
                  return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
                    ? Promise.resolve()
                    : Promise.reject(
                        new Error(intl.formatMessage({ id: 'scheduler.payloadObject' })),
                      );
                } catch {
                  return Promise.reject(
                    new Error(intl.formatMessage({ id: 'scheduler.payloadInvalid' })),
                  );
                }
              },
            },
          ]}
        />
        <ProFormSwitch
          colProps={{ span: 12 }}
          name="enabled"
          label={intl.formatMessage({ id: 'scheduler.enabled' })}
          tooltip={intl.formatMessage({ id: 'scheduler.enabledTooltip' })}
        />
      </ModalForm>
    </PageContainer>
  );
}
