import { DeleteOutlined, EditOutlined, PlusOutlined, TeamOutlined } from '@ant-design/icons';
import { PageContainer, ProCard } from '@ant-design/pro-components';
import {
  App,
  Button,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Select,
  Space,
  Table,
  Tag,
  Tree,
  Typography,
} from 'antd';
import { useEffect, useMemo, useState } from 'react';
import { useIntl } from '@umijs/max';
import type { DataNode } from 'antd/es/tree';
import AuthButton from '@/components/AuthButton';
import DictTag from '@/components/DictTag';
import { useDict } from '@/hooks/useDict';
import { currentUserSnapshot } from '@/services/auth';
import {
  assignUserDepartments,
  deleteDepartment,
  queryDepartments,
  queryUserDepartmentMappings,
  saveDepartment,
  type Department,
  type DepartmentInput,
} from '@/services/org';
import { queryUsers, type PlatformUser } from '@/services/users';

function flatten(items: Department[]): Department[] {
  return items.flatMap((item) => [item, ...flatten(item.children ?? [])]);
}

export default function OrganizationPage() {
  const { message } = App.useApp();
  const intl = useIntl();
  const permissions = currentUserSnapshot()?.permissions ?? [];
  // 部门启停状态复用通用字典 common.status，不在页面内维护映射。
  const { options: statusOptions } = useDict('common.status');
  const [departments, setDepartments] = useState<Department[]>([]);
  const [users, setUsers] = useState<PlatformUser[]>([]);
  const [userDepartments, setUserDepartments] = useState<Record<string, string[]>>({});
  const [userKeyword, setUserKeyword] = useState('');
  const [loading, setLoading] = useState(false);
  const [selectedId, setSelectedId] = useState<string>();
  const [editing, setEditing] = useState<Partial<DepartmentInput>>();
  const [assigning, setAssigning] = useState<PlatformUser>();
  const [primaryDepartmentId, setPrimaryDepartmentId] = useState<string>();
  const [additionalDepartmentIds, setAdditionalDepartmentIds] = useState<string[]>([]);
  const [assigningSaving, setAssigningSaving] = useState(false);
  const [form] = Form.useForm<DepartmentInput>();

  const allDepartments = useMemo(() => flatten(departments), [departments]);
  const departmentsById = useMemo(
    () => new Map(allDepartments.map((item) => [item.id, item])),
    [allDepartments],
  );
  const selected = allDepartments.find((item) => item.id === selectedId);
  const visibleUsers = useMemo(() => {
    const keyword = userKeyword.trim().toLowerCase();
    return users.filter((user) => {
      if (selectedId && !userDepartments[user.id]?.includes(selectedId)) return false;
      return (
        !keyword ||
        user.displayName.toLowerCase().includes(keyword) ||
        user.username.toLowerCase().includes(keyword)
      );
    });
  }, [selectedId, userDepartments, userKeyword, users]);
  const departmentUserCounts = useMemo(() => {
    const counts = new Map<string, number>();
    Object.values(userDepartments).forEach((ids) => {
      ids.forEach((id) => counts.set(id, (counts.get(id) ?? 0) + 1));
    });
    return counts;
  }, [userDepartments]);

  const reload = async () => {
    setLoading(true);
    try {
      const [departmentRows, userPage] = await Promise.all([
        queryDepartments(),
        queryUsers({ current: 1, pageSize: 100 }),
      ]);
      const mappings = await queryUserDepartmentMappings(userPage.records.map((user) => user.id));
      setDepartments(departmentRows);
      setUsers(userPage.records);
      setUserDepartments(mappings);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void reload().catch((reason) => {
      void message.error(
        reason instanceof Error ? reason.message : intl.formatMessage({ id: 'org.loadFailed' }),
      );
    });
  }, []);

  const openEditor = (input: Partial<DepartmentInput>) => {
    setEditing(input);
    form.setFieldsValue({
      sortNo: 0,
      status: 'ENABLED',
      ...input,
    });
  };

  const openAssignment = (user: PlatformUser) => {
    const ids = userDepartments[user.id] ?? [];
    setAssigning(user);
    setPrimaryDepartmentId(ids[0]);
    setAdditionalDepartmentIds(ids.slice(1));
  };

  return (
    <PageContainer
      title={intl.formatMessage({ id: 'org.title' })}
      subTitle={intl.formatMessage({ id: 'org.subtitle' })}
      extra={[
        <AuthButton
          key="create"
          type="primary"
          icon={<PlusOutlined />}
          permission="system:org:save"
          permissions={permissions}
          onClick={() => openEditor({ parentId: selectedId })}
        >
          {intl.formatMessage({ id: 'org.create' })}
        </AuthButton>,
      ]}
    >
      <ProCard split="vertical" bordered>
        <ProCard
          title={intl.formatMessage({ id: 'org.tree' })}
          subTitle={intl.formatMessage({ id: 'org.treeHint' })}
          colSpan="34%"
        >
          <Tree
            blockNode
            defaultExpandAll
            selectedKeys={selectedId ? [selectedId] : []}
            onSelect={(keys) => setSelectedId(keys[0]?.toString())}
            treeData={departments.map(function mapDepartment(item): DataNode {
              return {
                key: item.id,
                title: (
                  <Space>
                    <span>{item.name}</span>
                    <Typography.Text type="secondary">{item.code}</Typography.Text>
                    <Tag bordered={false}>
                      {intl.formatMessage(
                        { id: 'org.peopleCount' },
                        { count: departmentUserCounts.get(item.id) ?? 0 },
                      )}
                    </Tag>
                  </Space>
                ),
                children: (item.children ?? []).map(mapDepartment),
              };
            })}
          />
          {selected && (
            <Space style={{ marginTop: 20 }}>
              <AuthButton
                icon={<EditOutlined />}
                permission="system:org:save"
                permissions={permissions}
                onClick={() => openEditor(selected)}
              >
                {intl.formatMessage({ id: 'org.edit' })}
              </AuthButton>
              <Popconfirm
                title={intl.formatMessage({ id: 'org.deleteConfirm' })}
                description={intl.formatMessage({ id: 'org.deleteHint' })}
                onConfirm={async () => {
                  await deleteDepartment(selected.id);
                  setSelectedId(undefined);
                  void message.success(intl.formatMessage({ id: 'org.deleted' }));
                  await reload();
                }}
              >
                <AuthButton
                  danger
                  icon={<DeleteOutlined />}
                  permission="system:org:delete"
                  permissions={permissions}
                >
                  {intl.formatMessage({ id: 'org.delete' })}
                </AuthButton>
              </Popconfirm>
            </Space>
          )}
        </ProCard>
        <ProCard
          title={intl.formatMessage(
            { id: 'org.userMembership' },
            { scope: selected?.name ?? intl.formatMessage({ id: 'org.allUsers' }) },
          )}
          extra={
            <Space>
              <Input.Search
                allowClear
                placeholder={intl.formatMessage({ id: 'org.searchUsers' })}
                value={userKeyword}
                onChange={(event) => setUserKeyword(event.target.value)}
                style={{ width: 220 }}
              />
              {selectedId && (
                <Button onClick={() => setSelectedId(undefined)}>
                  {intl.formatMessage({ id: 'org.viewAll' })}
                </Button>
              )}
            </Space>
          }
        >
          <Table<PlatformUser>
            sticky
            rowKey="id"
            size="middle"
            loading={loading}
            pagination={{
              pageSize: 10,
              showTotal: (total) => intl.formatMessage({ id: 'org.totalUsers' }, { total }),
            }}
            dataSource={visibleUsers}
            columns={[
              {
                title: intl.formatMessage({ id: 'org.user' }),
                render: (_, user) => (
                  <Space direction="vertical" size={0}>
                    <Typography.Text strong>{user.displayName}</Typography.Text>
                    <Typography.Text type="secondary">@{user.username}</Typography.Text>
                  </Space>
                ),
              },
              {
                title: intl.formatMessage({ id: 'org.membership' }),
                render: (_, user) => {
                  const ids = userDepartments[user.id] ?? [];
                  if (ids.length === 0) {
                    return <Tag>{intl.formatMessage({ id: 'org.unassigned' })}</Tag>;
                  }
                  return (
                    <Space size={[4, 4]} wrap>
                      {ids.map((id, index) => {
                        const department = departmentsById.get(id);
                        const name =
                          department?.name ?? intl.formatMessage({ id: 'org.unknown' }, { id });
                        return (
                          <Tag key={id} color={index === 0 ? 'blue' : undefined}>
                            {index === 0
                              ? intl.formatMessage({ id: 'org.primaryTag' }, { name })
                              : name}
                          </Tag>
                        );
                      })}
                    </Space>
                  );
                },
              },
              {
                title: intl.formatMessage({ id: 'org.status' }),
                dataIndex: 'status',
                width: 90,
                render: (status) => <DictTag dictCode="common.status" value={status} />,
              },
              {
                title: intl.formatMessage({ id: 'org.actions' }),
                width: 130,
                render: (_, user) => (
                  <AuthButton
                    type="link"
                    icon={<TeamOutlined />}
                    permission="system:org:assign"
                    permissions={permissions}
                    onClick={() => openAssignment(user)}
                  >
                    {intl.formatMessage({ id: 'org.adjust' })}
                  </AuthButton>
                ),
              },
            ]}
          />
        </ProCard>
      </ProCard>

      <Modal
        title={intl.formatMessage({ id: editing?.id ? 'org.editTitle' : 'org.createTitle' })}
        open={Boolean(editing)}
        destroyOnHidden
        onCancel={() => setEditing(undefined)}
        onOk={() => form.submit()}
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={async (values) => {
            try {
              await saveDepartment({ ...editing, ...values });
              void message.success(
                intl.formatMessage({
                  id: editing?.id ? 'org.updated' : 'org.created',
                }),
              );
              setEditing(undefined);
              await reload();
            } catch (reason) {
              void message.error(
                reason instanceof Error
                  ? reason.message
                  : intl.formatMessage({ id: 'org.saveFailed' }),
              );
            }
          }}
        >
          <Form.Item name="parentId" label={intl.formatMessage({ id: 'org.parent' })}>
            <Select
              allowClear
              options={allDepartments
                .filter((item) => item.id !== editing?.id)
                .map((item) => ({
                  value: item.id,
                  label: intl.formatMessage(
                    { id: 'org.option' },
                    { name: item.name, code: item.code },
                  ),
                }))}
            />
          </Form.Item>
          <Form.Item
            name="name"
            label={intl.formatMessage({ id: 'org.name' })}
            rules={[{ required: true, max: 100 }]}
          >
            <Input />
          </Form.Item>
          <Form.Item
            name="code"
            label={intl.formatMessage({ id: 'org.code' })}
            rules={[
              { required: true },
              {
                pattern: /^[a-z][a-z0-9-]{1,63}$/,
                message: intl.formatMessage({ id: 'org.codeRule' }),
              },
            ]}
          >
            <Input disabled={Boolean(editing?.id)} />
          </Form.Item>
          <Form.Item name="sortNo" label={intl.formatMessage({ id: 'org.sort' })}>
            <InputNumber min={0} max={9999} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="status" label={intl.formatMessage({ id: 'org.status' })}>
            <Select options={statusOptions.map(({ value, label }) => ({ value, label }))} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={intl.formatMessage(
          { id: 'org.assignTitle' },
          { name: assigning?.displayName ?? '' },
        )}
        open={Boolean(assigning)}
        confirmLoading={assigningSaving}
        onCancel={() => {
          setAssigning(undefined);
          setPrimaryDepartmentId(undefined);
          setAdditionalDepartmentIds([]);
        }}
        onOk={async () => {
          if (!assigning) return;
          setAssigningSaving(true);
          try {
            const ids = primaryDepartmentId
              ? [primaryDepartmentId, ...additionalDepartmentIds]
              : [];
            await assignUserDepartments(assigning.id, ids);
            setUserDepartments((current) => ({ ...current, [assigning.id]: ids }));
            void message.success(intl.formatMessage({ id: 'org.assignmentUpdated' }));
            setAssigning(undefined);
          } catch (reason) {
            void message.error(
              reason instanceof Error
                ? reason.message
                : intl.formatMessage({ id: 'org.assignmentFailed' }),
            );
          } finally {
            setAssigningSaving(false);
          }
        }}
      >
        <Typography.Paragraph type="secondary">
          {intl.formatMessage({ id: 'org.assignmentHint' })}
        </Typography.Paragraph>
        <Space direction="vertical" size="middle" style={{ width: '100%' }}>
          <div>
            <Typography.Text strong>{intl.formatMessage({ id: 'org.primary' })}</Typography.Text>
            <Select
              aria-label={intl.formatMessage({ id: 'org.primary' })}
              allowClear
              showSearch
              optionFilterProp="label"
              placeholder={intl.formatMessage({ id: 'org.selectPrimary' })}
              style={{ width: '100%', marginTop: 8 }}
              value={primaryDepartmentId}
              onChange={(nextId) => {
                if (!nextId) {
                  setPrimaryDepartmentId(undefined);
                  setAdditionalDepartmentIds([]);
                  return;
                }
                setAdditionalDepartmentIds((current) => {
                  const next = current.filter((id) => id !== nextId);
                  if (primaryDepartmentId && primaryDepartmentId !== nextId) {
                    return [primaryDepartmentId, ...next];
                  }
                  return next;
                });
                setPrimaryDepartmentId(nextId);
              }}
              options={allDepartments.map((item) => ({
                value: item.id,
                label: intl.formatMessage(
                  { id: 'org.option' },
                  { name: item.name, code: item.code },
                ),
              }))}
            />
          </div>
          <div>
            <Typography.Text strong>{intl.formatMessage({ id: 'org.additional' })}</Typography.Text>
            <Select
              aria-label={intl.formatMessage({ id: 'org.additional' })}
              mode="multiple"
              allowClear
              showSearch
              optionFilterProp="label"
              maxTagCount="responsive"
              disabled={!primaryDepartmentId}
              placeholder={intl.formatMessage({
                id: primaryDepartmentId ? 'org.selectAdditional' : 'org.selectPrimaryFirst',
              })}
              style={{ width: '100%', marginTop: 8 }}
              value={additionalDepartmentIds}
              onChange={setAdditionalDepartmentIds}
              options={allDepartments
                .filter((item) => item.id !== primaryDepartmentId)
                .map((item) => ({
                  value: item.id,
                  label: intl.formatMessage(
                    { id: 'org.option' },
                    { name: item.name, code: item.code },
                  ),
                }))}
            />
          </div>
        </Space>
      </Modal>
    </PageContainer>
  );
}
