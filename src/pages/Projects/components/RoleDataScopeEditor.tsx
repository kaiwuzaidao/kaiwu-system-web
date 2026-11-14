import { useIntl } from '@umijs/max';
import { Alert, App, Empty, Select, Space, Switch, Table, Tag, Typography, TreeSelect } from 'antd';
import { useMemo } from 'react';
import { useDict } from '@/hooks/useDict';
import type { Department } from '@/services/org';
import type { DataScopeType, RoleDataScopeItem } from '@/services/projects';
import { exceedsDataScopeLimit, MAX_CUSTOM_DEPARTMENTS } from './dataScope';

const DICT_CODE = 'project.data_scope.type';

type Props = {
  items: RoleDataScopeItem[];
  onChange: (items: RoleDataScopeItem[]) => void;
  /** 内置 project-admin：固定全部，只读。 */
  readOnly: boolean;
  loading: boolean;
  departments: Department[];
};

type TreeNode = { value: string; title: string; children?: TreeNode[] };

function toTree(departments: Department[]): TreeNode[] {
  return departments.map((department) => ({
    value: department.id,
    title: department.name,
    children: department.children?.length ? toTree(department.children) : undefined,
  }));
}

/**
 * 角色「数据范围」页签（ADR 0044）：每个受控资源一行，下拉只列该资源允许的范围；
 * 选「指定部门」时出现部门树与「含下级」开关，选「全部」要二次确认。
 */
export default function RoleDataScopeEditor({
  items,
  onChange,
  readOnly,
  loading,
  departments,
}: Props) {
  const intl = useIntl();
  const { modal } = App.useApp();
  const { options } = useDict(DICT_CODE);
  const tree = useMemo(() => toTree(departments), [departments]);
  const labelOf = (value: string) =>
    options.find((option) => option.value === value)?.label ?? value;

  const update = (resourceCode: string, patch: Partial<RoleDataScopeItem>) =>
    onChange(
      items.map((item) => (item.resourceCode === resourceCode ? { ...item, ...patch } : item)),
    );

  const choose = (item: RoleDataScopeItem, scope: DataScopeType) => {
    const apply = () =>
      update(item.resourceCode, {
        scope,
        configured: scope !== 'SELF',
        // 切走指定部门时清掉已勾选部门，避免保存时带出不属于该范围的数据。
        deptIds: scope === 'CUSTOM_DEPT' ? item.deptIds : [],
        includeChild: scope === 'CUSTOM_DEPT' ? item.includeChild : false,
      });
    if (scope === 'ALL') {
      modal.confirm({
        title: intl.formatMessage({ id: 'dataScope.confirmAllTitle' }),
        content: intl.formatMessage(
          { id: 'dataScope.confirmAll' },
          { resource: item.resourceName },
        ),
        onOk: apply,
      });
      return;
    }
    apply();
  };

  if (!loading && items.length === 0) {
    return <Empty description={intl.formatMessage({ id: 'dataScope.empty' })} />;
  }

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Table<RoleDataScopeItem>
        size="small"
        rowKey="resourceCode"
        loading={loading}
        pagination={false}
        dataSource={items}
        columns={[
          {
            title: intl.formatMessage({ id: 'dataScope.column.resource' }),
            dataIndex: 'resourceName',
            width: 200,
            render: (_, item) => (
              <Space direction="vertical" size={0}>
                <span>{item.resourceName}</span>
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  {item.resourceCode}
                </Typography.Text>
              </Space>
            ),
          },
          {
            title: intl.formatMessage({ id: 'dataScope.column.scope' }),
            dataIndex: 'scope',
            width: 220,
            render: (_, item) =>
              readOnly ? (
                <Tag>{intl.formatMessage({ id: 'dataScope.builtIn' })}</Tag>
              ) : (
                <Select<DataScopeType>
                  style={{ width: 200 }}
                  aria-label={`${item.resourceName} ${intl.formatMessage({ id: 'dataScope.column.scope' })}`}
                  value={item.scope}
                  options={item.allowedScopes.map((scope) => ({
                    value: scope,
                    label: labelOf(scope),
                  }))}
                  labelRender={(option) =>
                    option.value === 'SELF' && !item.configured
                      ? intl.formatMessage({ id: 'dataScope.defaultSelf' })
                      : labelOf(String(option.value))
                  }
                  onChange={(scope) => choose(item, scope)}
                />
              ),
          },
          {
            title: intl.formatMessage({ id: 'dataScope.column.departments' }),
            dataIndex: 'deptIds',
            render: (_, item) =>
              !readOnly && item.scope === 'CUSTOM_DEPT' ? (
                <Space>
                  <TreeSelect
                    multiple
                    treeDefaultExpandAll
                    allowClear
                    style={{ width: 280 }}
                    maxCount={MAX_CUSTOM_DEPARTMENTS}
                    aria-label={`${item.resourceName} ${intl.formatMessage({ id: 'dataScope.column.departments' })}`}
                    placeholder={intl.formatMessage({ id: 'dataScope.pickDepartments' })}
                    status={item.deptIds.length === 0 ? 'error' : undefined}
                    treeData={tree}
                    value={item.deptIds}
                    onChange={(deptIds: string[]) => update(item.resourceCode, { deptIds })}
                  />
                  <Switch
                    size="small"
                    aria-label={`${item.resourceName} ${intl.formatMessage({ id: 'dataScope.includeChild' })}`}
                    checked={item.includeChild}
                    onChange={(includeChild) => update(item.resourceCode, { includeChild })}
                  />
                  <span>{intl.formatMessage({ id: 'dataScope.includeChild' })}</span>
                </Space>
              ) : (
                '-'
              ),
          },
        ]}
      />
      {!readOnly && exceedsDataScopeLimit(items) && (
        <Alert
          type="warning"
          showIcon
          message={intl.formatMessage({ id: 'dataScope.sizeWarning' })}
        />
      )}
    </Space>
  );
}
