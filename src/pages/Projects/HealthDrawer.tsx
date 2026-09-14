import { ProDescriptions } from '@ant-design/pro-components';
import { App, Button, Drawer, Empty, Space, Switch, Table, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useEffect, useState } from 'react';
import { useIntl } from '@umijs/max';
import AuthButton from '@/components/AuthButton';
import DictTag from '@/components/DictTag';
import {
  queryProjectHealth,
  runProjectHealthCheck,
  setProjectHealthEnabled,
  type ProjectHealth,
  type ProjectHealthCheck,
} from '@/services/projectHealth';
import { formatDateTime } from '@/utils/format';

export type HealthDrawerProps = {
  projectId?: string;
  projectName?: string;
  permissions: string[];
  onClose: () => void;
};

/**
 * 只读项目体检结果（ADR 0012）。
 *
 * 体检只报告、不阻断，也不会写业务仓库，因此这里没有任何"修复"动作——
 * 平台没有写入权，给一个点了没用的修复按钮只会误导用户。
 */
export default function HealthDrawer({
  projectId,
  projectName,
  permissions,
  onClose,
}: HealthDrawerProps) {
  const { message } = App.useApp();
  const intl = useIntl();
  const [report, setReport] = useState<ProjectHealth>();
  const [enabled, setEnabled] = useState(true);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!projectId) {
      setReport(undefined);
      return;
    }
    setLoading(true);
    void queryProjectHealth(projectId)
      .then((latest) => {
        setReport(latest);
        setEnabled(latest.enabled);
      })
      .catch((reason) => {
        void message.error(
          reason instanceof Error
            ? reason.message
            : intl.formatMessage({ id: 'projectHealth.failed' }),
        );
      })
      .finally(() => setLoading(false));
  }, [projectId, intl, message]);

  const runCheck = async () => {
    if (!projectId) return;
    setLoading(true);
    try {
      setReport(await runProjectHealthCheck(projectId));
      void message.success(intl.formatMessage({ id: 'projectHealth.done' }));
    } catch (reason) {
      void message.error(
        reason instanceof Error
          ? reason.message
          : intl.formatMessage({ id: 'projectHealth.failed' }),
      );
    } finally {
      setLoading(false);
    }
  };

  const toggleEnabled = async (next: boolean) => {
    if (!projectId) return;
    try {
      await setProjectHealthEnabled(projectId, next);
      setEnabled(next);
      void message.success(intl.formatMessage({ id: 'projectHealth.switchUpdated' }));
    } catch (reason) {
      void message.error(
        reason instanceof Error
          ? reason.message
          : intl.formatMessage({ id: 'projectHealth.failed' }),
      );
    }
  };

  const columns: ColumnsType<ProjectHealthCheck> = [
    {
      title: intl.formatMessage({ id: 'projectHealth.item' }),
      dataIndex: 'name',
      width: 140,
    },
    {
      title: intl.formatMessage({ id: 'projectHealth.result' }),
      dataIndex: 'verdict',
      width: 110,
      render: (_, row) => <DictTag dictCode="project.health.verdict" value={row.verdict} />,
    },
    {
      title: intl.formatMessage({ id: 'projectHealth.detail' }),
      dataIndex: 'detail',
      ellipsis: true,
    },
  ];

  return (
    <Drawer
      width={720}
      open={Boolean(projectId)}
      onClose={onClose}
      title={intl.formatMessage({ id: 'projectHealth.title' }, { project: projectName ?? '' })}
      extra={
        <Space>
          <Switch
            checked={enabled}
            onChange={(next) => void toggleEnabled(next)}
            checkedChildren={intl.formatMessage({ id: 'projectHealth.enabled' })}
            unCheckedChildren={intl.formatMessage({ id: 'projectHealth.enabled' })}
          />
          <AuthButton
            type="primary"
            permission="system:project:health"
            permissions={permissions}
            loading={loading}
            onClick={() => void runCheck()}
          >
            {intl.formatMessage({ id: 'projectHealth.run' })}
          </AuthButton>
        </Space>
      }
    >
      <Typography.Paragraph type="secondary">
        {intl.formatMessage({ id: 'projectHealth.readOnlyHint' })}
      </Typography.Paragraph>
      {report?.checkedAt ? (
        <>
          <ProDescriptions column={2} style={{ marginBottom: 16 }}>
            <ProDescriptions.Item label={intl.formatMessage({ id: 'projectHealth.verdict' })}>
              <DictTag dictCode="project.health.verdict" value={report.verdict} />
            </ProDescriptions.Item>
            <ProDescriptions.Item label={intl.formatMessage({ id: 'projectHealth.checkedAt' })}>
              {formatDateTime(report.checkedAt)}
            </ProDescriptions.Item>
          </ProDescriptions>
          <Table<ProjectHealthCheck>
            rowKey="code"
            size="small"
            pagination={false}
            loading={loading}
            columns={columns}
            dataSource={report.checks}
          />
        </>
      ) : (
        <Empty description={intl.formatMessage({ id: 'projectHealth.empty' })}>
          <Button type="primary" loading={loading} onClick={() => void runCheck()}>
            {intl.formatMessage({ id: 'projectHealth.run' })}
          </Button>
        </Empty>
      )}
    </Drawer>
  );
}
