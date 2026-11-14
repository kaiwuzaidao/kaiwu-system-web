import { ArrowRightOutlined } from '@ant-design/icons';
import { useIntl } from '@umijs/max';
import { Button, Empty, Space, Table, Typography } from 'antd';
import ProjectEntryCard from '@/components/ProjectEntryCard';
import DictTag from '@/components/DictTag';
import type { AgentCard, AgentCardCommand } from '@/services/agent';

const INTERNAL_KEYS = new Set(['sourceProjectId']);
const PROJECT_LIST = 'system.project.list';

function columnsOf(card: AgentCard) {
  if (card.outputView) {
    return card.outputView.fields
      .filter((field) => !INTERNAL_KEYS.has(field.name))
      .map((field) => ({
        title: field.label,
        dataIndex: field.name,
        key: field.name,
        render: (value: unknown, row: Record<string, unknown>) => {
          if (value === null || value === undefined) return '-';
          if (field.format === 'BOOLEAN_ENABLED') {
            const normalized =
              value === 1 || value === '1'
                ? true
                : value === 0 || value === '0'
                  ? false
                  : String(value);
            return <DictTag dictCode="common.boolean_enabled" value={normalized} />;
          }
          if (field.format === 'DICTIONARY' && field.dictCode) {
            return (
              <DictTag
                dictCode={field.dictCode}
                projectId={
                  card.capabilityCode &&
                  !card.capabilityCode.startsWith('system.') &&
                  typeof row.sourceProjectId === 'string'
                    ? row.sourceProjectId
                    : undefined
                }
                value={String(value)}
              />
            );
          }
          if (field.format === 'DATETIME' && typeof value === 'string') {
            // Keep the source timezone and precision; never silently convert to browser local time.
            return value.replace(/^(\d{4}-\d{2}-\d{2})T(?=\d{2}:\d{2})/, '$1 ');
          }
          return String(value);
        },
      }));
  }
  const rows = card.rows;
  const first = rows[0] ?? {};
  return Object.keys(first)
    .filter((key) => !INTERNAL_KEYS.has(key))
    .map((key) => ({
      title: key,
      dataIndex: key,
      key,
      render: (value: unknown) => (value === null || value === undefined ? '-' : String(value)),
    }));
}

function projectFromRow(row: Record<string, unknown>) {
  return {
    id: String(row.id ?? ''),
    projectCode: String(row.projectCode ?? ''),
    projectName: String(row.projectName ?? row.projectCode ?? '项目'),
    status: String(row.status ?? ''),
    backendUrl: typeof row.backendUrl === 'string' ? row.backendUrl : undefined,
  };
}

export default function Cards({
  cards,
  onOpenProjects,
  disabled,
  onCommand,
}: {
  cards: AgentCard[];
  disabled?: boolean;
  onCommand?: (command: AgentCardCommand) => void;
  onOpenProjects: (keyword?: string) => void;
}) {
  const intl = useIntl();
  if (!cards.length) return null;

  return (
    <>
      {cards.map((card, index) => {
        const isProjectList = card.capabilityCode === PROJECT_LIST;
        return (
          <div key={`${card.title}-${index}`} className="agent-dock-card">
            <div className="agent-dock-card-header">
              <Typography.Text strong>{card.outputView?.title ?? card.title}</Typography.Text>
              {isProjectList && (
                <Button type="link" size="small" onClick={() => onOpenProjects()}>
                  {intl.formatMessage({ id: 'agent.projects.title' })}
                  <ArrowRightOutlined />
                </Button>
              )}
            </div>
            {card.rows.length === 0 ? (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} style={{ margin: '8px 0' }} />
            ) : isProjectList ? (
              <div className="agent-project-list">
                {card.rows.map((row, rowIndex) => {
                  const project = projectFromRow(row);
                  return (
                    <div key={`${project.id}-${rowIndex}`}>
                      <ProjectEntryCard
                        project={project}
                        showNoEntry={false}
                        onEnter={() => onOpenProjects(project.projectCode)}
                      />
                    </div>
                  );
                })}
              </div>
            ) : (
              <Table
                size="small"
                pagination={false}
                rowKey={(_, rowIndex) => String(rowIndex)}
                columns={[
                  ...columnsOf(card),
                  ...(card.navigation?.details.length && onCommand
                    ? [
                        {
                          title: intl.formatMessage({ id: 'agent.navigation.actions' }),
                          key: 'actions',
                          render: (_: unknown, __: Record<string, unknown>, rowIndex: number) => {
                            const command = card.navigation?.details.find(
                              (item) => item.rowIndex === rowIndex,
                            )?.command;
                            return command ? (
                              <Button
                                type="link"
                                disabled={disabled}
                                onClick={() => onCommand(command)}
                              >
                                {command.label}
                              </Button>
                            ) : null;
                          },
                        },
                      ]
                    : []),
                ]}
                dataSource={card.rows}
                scroll={{ x: true }}
              />
            )}
            {card.navigation?.page != null && onCommand && (
              <Space style={{ marginTop: 12 }}>
                <Button
                  disabled={disabled || !card.navigation.previous}
                  onClick={() => card.navigation?.previous && onCommand(card.navigation.previous)}
                >
                  {intl.formatMessage({ id: 'agent.navigation.previous' })}
                </Button>
                <Typography.Text>
                  {intl.formatMessage(
                    { id: 'agent.navigation.page' },
                    { page: card.navigation.page },
                  )}
                </Typography.Text>
                <Button
                  disabled={disabled || !card.navigation.next}
                  onClick={() => card.navigation?.next && onCommand(card.navigation.next)}
                >
                  {intl.formatMessage({ id: 'agent.navigation.next' })}
                </Button>
              </Space>
            )}
            <Typography.Text type="secondary" className="agent-dock-data-at">
              {intl.formatMessage({ id: 'agent.dock.dataAt' })}：
              {new Date(card.dataAt).toLocaleString()}
            </Typography.Text>
          </div>
        );
      })}
    </>
  );
}
