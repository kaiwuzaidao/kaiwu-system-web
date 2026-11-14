import { DownloadOutlined, InboxOutlined } from '@ant-design/icons';
import { useIntl } from '@umijs/max';
import {
  Alert,
  App,
  Button,
  Card,
  Checkbox,
  Collapse,
  Empty,
  Popconfirm,
  Space,
  Table,
  Typography,
  Upload,
} from 'antd';
import { useCallback, useEffect, useMemo, useState } from 'react';
import DictTag from '@/components/DictTag';
import {
  applyProjectConfig,
  deleteKeyOf,
  exportProjectConfig,
  planProjectConfig,
  queryHandover,
  queryHandovers,
  type HandoverChange,
  type HandoverPackage,
  type HandoverPlan,
  type HandoverRecord,
} from '@/services/projectHandover';
import { useLocaleFormatters } from '@/utils/format';
import type { ProjectPermissionProps } from './types';

const SUPPORTED_FORMAT_VERSION = 1;

/** 把导出的移交包保存为浏览器下载文件。 */
function downloadPackage(pkg: HandoverPackage) {
  const stamp = new Date().toISOString().slice(0, 10).replaceAll('-', '');
  const name = `handover-${pkg.projectCode}-${stamp}.json`;
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(pkg, null, 2)], { type: 'application/json' }),
  );
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
  return name;
}

/** 读取并校验用户上传的文件是否像一个移交包；不合法时返回 undefined。 */
function parsePackage(text: string): HandoverPackage | undefined {
  try {
    const value = JSON.parse(text) as Partial<HandoverPackage>;
    if (
      typeof value.formatVersion !== 'number' ||
      typeof value.projectCode !== 'string' ||
      typeof value.files !== 'object' ||
      value.files === null
    ) {
      return undefined;
    }
    return value as HandoverPackage;
  } catch {
    return undefined;
  }
}

/** 计划条目表：类型、标识、动作、说明；动作与类型都走字典。 */
function ChangeTable({
  changes,
  selection,
}: {
  changes: HandoverChange[];
  selection?: {
    selected: string[];
    onChange: (keys: string[]) => void;
  };
}) {
  const intl = useIntl();
  return (
    <Table<HandoverChange>
      size="small"
      rowKey={deleteKeyOf}
      pagination={changes.length > 10 ? { pageSize: 10, hideOnSinglePage: true } : false}
      dataSource={changes}
      rowSelection={
        selection
          ? {
              selectedRowKeys: selection.selected,
              onChange: (keys) => selection.onChange(keys.map(String)),
            }
          : undefined
      }
      columns={[
        {
          title: intl.formatMessage({ id: 'configHandover.plan.column.resource' }),
          dataIndex: 'resource',
          width: 120,
          render: (value: string) => <DictTag dictCode="project.handover.resource" value={value} />,
        },
        {
          title: intl.formatMessage({ id: 'configHandover.plan.column.key' }),
          dataIndex: 'key',
          ellipsis: true,
        },
        {
          title: intl.formatMessage({ id: 'configHandover.plan.column.action' }),
          dataIndex: 'action',
          width: 140,
          render: (value: string) => <DictTag dictCode="project.handover.action" value={value} />,
        },
        {
          title: intl.formatMessage({ id: 'configHandover.plan.column.detail' }),
          dataIndex: 'detail',
          ellipsis: true,
        },
      ]}
    />
  );
}

/**
 * 项目「配置移交」页签（ADR 0042）：导出当前项目配置、上传移交包预览差异并执行、查看移交记录。
 *
 * 授权与删除默认不执行，需要在预览里显式勾选；执行前后端会重新计算并核对计划哈希。
 */
export default function ConfigHandoverPanel({ project }: ProjectPermissionProps) {
  const { message } = App.useApp();
  const intl = useIntl();
  const format = useLocaleFormatters();
  const [exporting, setExporting] = useState(false);
  const [exported, setExported] = useState<HandoverPackage>();
  const [pkg, setPkg] = useState<HandoverPackage>();
  const [plan, setPlan] = useState<HandoverPlan>();
  const [planning, setPlanning] = useState(false);
  const [applyAccess, setApplyAccess] = useState(false);
  const [deleteKeys, setDeleteKeys] = useState<string[]>([]);
  const [applying, setApplying] = useState(false);
  const [records, setRecords] = useState<HandoverRecord[]>([]);
  const [details, setDetails] = useState<Record<string, HandoverChange[]>>({});

  const loadRecords = useCallback(async () => {
    setRecords(await queryHandovers(project.id));
  }, [project.id]);

  useEffect(() => {
    void loadRecords().catch((error: Error) => message.error(error.message));
  }, [loadRecords, message]);

  const groups = useMemo(() => {
    const changes = plan?.changes ?? [];
    return {
      normal: changes.filter(
        (change) =>
          change.category === 'NORMAL' &&
          // REENABLE（ADR 0044）：下线的受控资源重新出现在清单里，随计划执行，必须可见。
          (change.action === 'CREATE' ||
            change.action === 'UPDATE' ||
            change.action === 'REENABLE'),
      ),
      access: changes.filter((change) => change.category === 'ACCESS'),
      removed: changes.filter((change) => change.category === 'DELETE'),
      drift: changes.filter((change) => change.action === 'DRIFT'),
    };
  }, [plan]);

  const runnable =
    groups.normal.length > 0 || (applyAccess && groups.access.length > 0) || deleteKeys.length > 0;

  const doExport = async () => {
    setExporting(true);
    try {
      const result = await exportProjectConfig(project.id);
      setExported(result);
      message.success(
        intl.formatMessage({ id: 'configHandover.export.done' }, { name: downloadPackage(result) }),
      );
    } catch (error) {
      message.error((error as Error).message);
    } finally {
      setExporting(false);
    }
  };

  /** 对已上传的移交包重新计算预览，并清掉旧的勾选。 */
  const refreshPlan = async (target: HandoverPackage) => {
    setPlanning(true);
    try {
      setPlan(await planProjectConfig(project.id, target));
      setApplyAccess(false);
      setDeleteKeys([]);
    } catch (error) {
      setPlan(undefined);
      message.error((error as Error).message);
    } finally {
      setPlanning(false);
    }
  };

  const onFile = async (file: File) => {
    const parsed = parsePackage(await file.text());
    if (!parsed) {
      message.error(intl.formatMessage({ id: 'configHandover.import.invalid' }));
      return;
    }
    if (parsed.formatVersion !== SUPPORTED_FORMAT_VERSION) {
      message.error(
        intl.formatMessage(
          { id: 'configHandover.import.versionUnsupported' },
          { version: parsed.formatVersion },
        ),
      );
      return;
    }
    if (parsed.projectCode !== project.projectCode) {
      message.error(
        intl.formatMessage(
          { id: 'configHandover.import.projectMismatch' },
          { packageProject: parsed.projectCode, project: project.projectCode },
        ),
      );
      return;
    }
    setPkg(parsed);
    await refreshPlan(parsed);
  };

  const doApply = async () => {
    if (!pkg || !plan) return;
    setApplying(true);
    try {
      await applyProjectConfig(project.id, pkg, plan.planHash, applyAccess, deleteKeys);
      message.success(
        intl.formatMessage(
          { id: 'configHandover.apply.success' },
          {
            changes: groups.normal.length + (applyAccess ? groups.access.length : 0),
            deletes: deleteKeys.length,
          },
        ),
      );
      await Promise.all([refreshPlan(pkg), loadRecords()]);
    } catch (error) {
      // 执行失败多半是目标环境在预览之后被改动（计划哈希对不上）：重新预览，哈希变了就明确告知。
      const previous = plan.planHash;
      try {
        const next = await planProjectConfig(project.id, pkg);
        setPlan(next);
        setApplyAccess(false);
        setDeleteKeys([]);
        message.warning(
          next.planHash !== previous
            ? intl.formatMessage({ id: 'configHandover.apply.stale' })
            : (error as Error).message,
        );
      } catch {
        message.error((error as Error).message);
      }
      void loadRecords().catch(() => undefined);
    } finally {
      setApplying(false);
    }
  };

  const loadDetail = async (record: HandoverRecord) => {
    if (details[record.id]) return;
    const detail = await queryHandover(project.id, record.id);
    setDetails((current) => ({ ...current, [record.id]: detail.changes }));
  };

  const sourceText = (host?: string, exportedAt?: string, user?: string) =>
    intl.formatMessage(
      { id: 'configHandover.import.source' },
      {
        host: host || '-',
        time: exportedAt ? format.dateTime(exportedAt) : '-',
        user: user || '-',
      },
    );

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Card title={intl.formatMessage({ id: 'configHandover.export.title' })} size="small">
        <Typography.Paragraph type="secondary">
          {intl.formatMessage({ id: 'configHandover.export.desc' })}
        </Typography.Paragraph>
        <Button
          type="primary"
          icon={<DownloadOutlined />}
          loading={exporting}
          onClick={() => void doExport()}
        >
          {intl.formatMessage({ id: 'configHandover.export.button' })}
        </Button>
        {exported && (
          <div style={{ marginTop: 16 }}>
            <Typography.Text>
              {intl.formatMessage(
                { id: 'configHandover.export.stats' },
                {
                  dicts: exported.stats.dicts ?? 0,
                  configs: exported.stats.configs ?? 0,
                  menus: exported.stats.menus ?? 0,
                  roles: exported.stats.roles ?? 0,
                  jobs: exported.stats.jobs ?? 0,
                  i18n: exported.stats.i18n ?? 0,
                },
              )}
            </Typography.Text>
            {exported.warnings.length > 0 && (
              <Alert
                showIcon
                type="warning"
                style={{ marginTop: 12 }}
                message={intl.formatMessage(
                  { id: 'configHandover.export.warnings' },
                  { count: exported.warnings.length },
                )}
                description={
                  <ul style={{ margin: 0, paddingLeft: 18 }}>
                    {exported.warnings.map((warning) => (
                      <li key={warning}>{warning}</li>
                    ))}
                  </ul>
                }
              />
            )}
          </div>
        )}
      </Card>

      <Card title={intl.formatMessage({ id: 'configHandover.import.title' })} size="small">
        <Typography.Paragraph type="secondary">
          {intl.formatMessage({ id: 'configHandover.import.desc' })}
        </Typography.Paragraph>
        <Upload.Dragger
          accept=".json,application/json"
          maxCount={1}
          showUploadList={false}
          beforeUpload={(file) => {
            void onFile(file);
            return false;
          }}
        >
          <p className="ant-upload-drag-icon">
            <InboxOutlined />
          </p>
          <p className="ant-upload-text">
            {intl.formatMessage({ id: 'configHandover.import.upload' })}
          </p>
        </Upload.Dragger>

        {pkg && (
          <Typography.Paragraph type="secondary" style={{ marginTop: 12, marginBottom: 0 }}>
            {sourceText(pkg.source?.host, pkg.source?.exportedAt, pkg.source?.exportedBy)}
          </Typography.Paragraph>
        )}

        {plan && (
          <Space direction="vertical" size={12} style={{ width: '100%', marginTop: 12 }}>
            {plan.missingPermissions.length > 0 && (
              <Alert
                showIcon
                type="error"
                message={intl.formatMessage(
                  { id: 'configHandover.plan.missingPermissions' },
                  { codes: plan.missingPermissions.join('、') },
                )}
              />
            )}
            {plan.alreadyApplied && (
              <Alert
                showIcon
                type="info"
                message={intl.formatMessage(
                  { id: 'configHandover.plan.alreadyApplied' },
                  {
                    time: format.dateTime(plan.alreadyApplied.appliedAt),
                    user: intl.formatMessage(
                      { id: 'configHandover.records.operatorValue' },
                      { id: plan.alreadyApplied.operatorId },
                    ),
                  },
                )}
              />
            )}
            {!plan.hasBaseline && (
              <Alert
                showIcon
                type="info"
                message={intl.formatMessage({ id: 'configHandover.plan.noBaseline' })}
              />
            )}
            {plan.changes.length === 0 && (
              <Alert
                showIcon
                type="success"
                message={intl.formatMessage({ id: 'configHandover.plan.inSync' })}
              />
            )}

            <Collapse
              defaultActiveKey={['normal', 'access', 'removed']}
              items={
                [
                  groups.normal.length > 0 && {
                    key: 'normal',
                    label: intl.formatMessage(
                      { id: 'configHandover.plan.section.normal' },
                      { count: groups.normal.length },
                    ),
                    children: <ChangeTable changes={groups.normal} />,
                  },
                  groups.access.length > 0 && {
                    key: 'access',
                    label: intl.formatMessage(
                      { id: 'configHandover.plan.section.access' },
                      { count: groups.access.length },
                    ),
                    children: (
                      <Space direction="vertical" size={8} style={{ width: '100%' }}>
                        <Typography.Text type="secondary">
                          {intl.formatMessage({ id: 'configHandover.plan.section.accessHint' })}
                        </Typography.Text>
                        <Checkbox
                          checked={applyAccess}
                          onChange={(event) => setApplyAccess(event.target.checked)}
                        >
                          {intl.formatMessage({ id: 'configHandover.plan.access.apply' })}
                        </Checkbox>
                        <ChangeTable changes={groups.access} />
                      </Space>
                    ),
                  },
                  groups.removed.length > 0 && {
                    key: 'removed',
                    label: intl.formatMessage(
                      { id: 'configHandover.plan.section.delete' },
                      { count: groups.removed.length },
                    ),
                    children: (
                      <Space direction="vertical" size={8} style={{ width: '100%' }}>
                        <Typography.Text type="secondary">
                          {intl.formatMessage({ id: 'configHandover.plan.section.deleteHint' })}
                        </Typography.Text>
                        <ChangeTable
                          changes={groups.removed}
                          selection={{ selected: deleteKeys, onChange: setDeleteKeys }}
                        />
                      </Space>
                    ),
                  },
                  groups.drift.length > 0 && {
                    key: 'drift',
                    label: intl.formatMessage(
                      { id: 'configHandover.plan.section.drift' },
                      { count: groups.drift.length },
                    ),
                    children: (
                      <Space direction="vertical" size={8} style={{ width: '100%' }}>
                        <Typography.Text type="secondary">
                          {intl.formatMessage({ id: 'configHandover.plan.section.driftHint' })}
                        </Typography.Text>
                        <ChangeTable changes={groups.drift} />
                      </Space>
                    ),
                  },
                ].filter(Boolean) as never
              }
            />

            <Popconfirm
              title={intl.formatMessage(
                { id: 'configHandover.apply.confirm' },
                {
                  changes: groups.normal.length,
                  access: applyAccess ? groups.access.length : 0,
                  deletes: deleteKeys.length,
                },
              )}
              disabled={!runnable || plan.missingPermissions.length > 0}
              onConfirm={() => void doApply()}
            >
              <Button
                type="primary"
                loading={applying || planning}
                disabled={!runnable || plan.missingPermissions.length > 0}
              >
                {intl.formatMessage({ id: 'configHandover.apply.button' })}
              </Button>
            </Popconfirm>
            {!runnable && plan.changes.length > 0 && (
              <Typography.Text type="secondary" style={{ marginLeft: 12 }}>
                {intl.formatMessage({ id: 'configHandover.apply.nothing' })}
              </Typography.Text>
            )}
          </Space>
        )}
      </Card>

      <Card title={intl.formatMessage({ id: 'configHandover.records.title' })} size="small">
        <Table<HandoverRecord>
          size="small"
          rowKey="id"
          pagination={false}
          dataSource={records}
          locale={{
            emptyText: (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description={intl.formatMessage({ id: 'configHandover.records.empty' })}
              />
            ),
          }}
          expandable={{
            onExpand: (expanded, record) => {
              if (expanded)
                void loadDetail(record).catch((error: Error) => message.error(error.message));
            },
            expandedRowRender: (record) =>
              record.failureReason ? (
                <Alert
                  type="error"
                  showIcon
                  message={intl.formatMessage({ id: 'configHandover.records.reason' })}
                  description={record.failureReason}
                />
              ) : (
                <ChangeTable changes={details[record.id] ?? []} />
              ),
          }}
          columns={[
            {
              title: intl.formatMessage({ id: 'configHandover.records.time' }),
              dataIndex: 'createdAt',
              render: (value: string) => format.dateTime(value),
            },
            {
              title: intl.formatMessage({ id: 'configHandover.records.result' }),
              dataIndex: 'status',
              render: (value: string) => (
                <DictTag dictCode="project.handover.status" value={value} />
              ),
            },
            {
              title: intl.formatMessage({ id: 'configHandover.records.operator' }),
              dataIndex: 'operatorId',
              render: (value: string) =>
                intl.formatMessage({ id: 'configHandover.records.operatorValue' }, { id: value }),
            },
            {
              title: intl.formatMessage({ id: 'configHandover.records.source' }),
              dataIndex: 'sourceHost',
              render: (value?: string) => value || '-',
            },
            {
              title: intl.formatMessage({ id: 'configHandover.records.exportedAt' }),
              dataIndex: 'sourceExportedAt',
              render: (value?: string) => (value ? format.dateTime(value) : '-'),
            },
            {
              title: intl.formatMessage({ id: 'configHandover.records.changes' }),
              dataIndex: 'changeCount',
            },
            {
              title: intl.formatMessage({ id: 'configHandover.records.deletes' }),
              dataIndex: 'deleteCount',
            },
            {
              title: intl.formatMessage({ id: 'configHandover.records.access' }),
              dataIndex: 'appliedAccess',
              render: (value: boolean) =>
                intl.formatMessage({
                  id: value
                    ? 'configHandover.records.accessYes'
                    : 'configHandover.records.accessNo',
                }),
            },
          ]}
        />
      </Card>
    </Space>
  );
}
