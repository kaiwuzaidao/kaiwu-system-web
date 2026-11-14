import {
  ApartmentOutlined,
  DeleteOutlined,
  EditOutlined,
  PlusOutlined,
  TeamOutlined,
} from '@ant-design/icons';
import { PageContainer, ProCard } from '@ant-design/pro-components';
import {
  App,
  Avatar,
  Button,
  Empty,
  Form,
  Grid,
  Input,
  InputNumber,
  Modal,
  Pagination,
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
  addDepartmentMembers,
  deleteDepartment,
  queryDepartments,
  queryUserDepartmentMappings,
  saveDepartment,
  type Department,
  type DepartmentInput,
} from '@/services/org';
import { queryUsers, type PlatformUser } from '@/services/users';
import './dialogs.less';
import './index.less';

function flatten(items: Department[]): Department[] {
  return items.flatMap((item) => [item, ...flatten(item.children ?? [])]);
}

export default function OrganizationPage() {
  const { message } = App.useApp();
  const intl = useIntl();
  const screens = Grid.useBreakpoint();
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
  const [bulkDepartment, setBulkDepartment] = useState<Department>();
  const [bulkIds, setBulkIds] = useState<string[]>([]);
  const [bulkKeyword, setBulkKeyword] = useState('');
  const [bulkSearch, setBulkSearch] = useState('');
  const [bulkPage, setBulkPage] = useState(1);
  const [bulkUsers, setBulkUsers] = useState<PlatformUser[]>([]);
  const [bulkTotal, setBulkTotal] = useState(0);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkSaving, setBulkSaving] = useState(false);
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

  useEffect(() => {
    if (!bulkDepartment) return;
    let active = true;
    setBulkLoading(true);
    void queryUsers({ current: bulkPage, pageSize: 10, keyword: bulkSearch })
      .then((page) => {
        if (active) {
          setBulkUsers(page.records);
          setBulkTotal(page.total);
        }
      })
      .catch((reason) => {
        if (active) {
          setBulkUsers([]);
          setBulkTotal(0);
          void message.error(
            reason instanceof Error ? reason.message : intl.formatMessage({ id: 'org.loadFailed' }),
          );
        }
      })
      .finally(() => {
        if (active) setBulkLoading(false);
      });
    return () => {
      active = false;
    };
  }, [bulkDepartment, bulkPage, bulkSearch]);

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
      className="kaiwu-organization-page"
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
      <ProCard
        className="kaiwu-organization"
        split={screens.md === false ? 'horizontal' : 'vertical'}
        bordered
      >
        <ProCard
          className="kaiwu-organization-tree"
          title={intl.formatMessage({ id: 'org.tree' })}
          subTitle={intl.formatMessage({ id: 'org.treeHint' })}
          colSpan={screens.md === false ? '100%' : '34%'}
        >
          {departments.length > 0 && (
            <Tree
              blockNode
              showIcon
              icon={<ApartmentOutlined />}
              defaultExpandAll
              selectedKeys={selectedId ? [selectedId] : []}
              onSelect={(keys) => setSelectedId(keys[0]?.toString())}
              treeData={departments.map(function mapDepartment(item): DataNode {
                return {
                  key: item.id,
                  title: (
                    <Space size={8} className="kaiwu-organization-node">
                      <Typography.Text strong title={`${item.name} · ${item.code}`}>
                        {item.name}
                      </Typography.Text>
                      <Typography.Text type="secondary">{item.code}</Typography.Text>
                      <Tag bordered={false} icon={<TeamOutlined />}>
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
          )}
          {selected && (
            <Space style={{ marginTop: 16 }}>
              <AuthButton
                type="text"
                size="small"
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
                  try {
                    await deleteDepartment(selected.id);
                    setSelectedId(undefined);
                    void message.success(intl.formatMessage({ id: 'org.deleted' }));
                    await reload();
                  } catch (error) {
                    void message.error(error instanceof Error ? error.message : String(error));
                  }
                }}
              >
                <AuthButton
                  type="text"
                  size="small"
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
          className="kaiwu-organization-members"
          title={intl.formatMessage(
            { id: 'org.userMembership' },
            { scope: selected?.name ?? intl.formatMessage({ id: 'org.allUsers' }) },
          )}
          extra={
            <Space wrap>
              {selected && (
                <AuthButton
                  type="primary"
                  icon={<PlusOutlined />}
                  permission="system:org:assign"
                  permissions={permissions}
                  onClick={() => {
                    setBulkIds([]);
                    setBulkKeyword('');
                    setBulkSearch('');
                    setBulkPage(1);
                    setBulkDepartment(selected);
                  }}
                >
                  {intl.formatMessage({ id: 'org.bulkAdd' })}
                </AuthButton>
              )}
              <Input.Search
                allowClear
                placeholder={intl.formatMessage({ id: 'org.searchUsers' })}
                value={userKeyword}
                onChange={(event) => setUserKeyword(event.target.value)}
                style={{ width: 220 }}
              />
              {selectedId && (
                <Button icon={<TeamOutlined />} onClick={() => setSelectedId(undefined)}>
                  {intl.formatMessage({ id: 'org.viewAll' })}
                </Button>
              )}
            </Space>
          }
        >
          <Table<PlatformUser>
            className="kaiwu-organization-table"
            sticky
            scroll={{ x: 620 }}
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
                  <Space size={14}>
                    <Avatar className="kaiwu-organization-avatar" aria-hidden="true">
                      {(user.displayName || user.username).trim().charAt(0).toUpperCase()}
                    </Avatar>
                    <Space direction="vertical" size={0}>
                      <Typography.Text strong>{user.displayName}</Typography.Text>
                      <Typography.Text type="secondary">@{user.username}</Typography.Text>
                    </Space>
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
        title={intl.formatMessage({ id: 'org.bulkTitle' }, { name: bulkDepartment?.name ?? '' })}
        width={700}
        centered
        className="kaiwu-org-dialog"
        open={Boolean(bulkDepartment)}
        confirmLoading={bulkSaving}
        okButtonProps={{ disabled: bulkIds.length === 0 }}
        onCancel={() => {
          if (!bulkSaving) setBulkDepartment(undefined);
        }}
        onOk={async () => {
          if (!bulkDepartment || bulkSaving || !bulkIds.length) return;
          setBulkSaving(true);
          try {
            const count = await addDepartmentMembers(bulkDepartment.id, bulkIds);
            setBulkDepartment(undefined);
            void message.success(intl.formatMessage({ id: 'org.bulkAdded' }, { count }));
            await reload().catch(() => {
              void message.error(intl.formatMessage({ id: 'org.loadFailed' }));
            });
          } catch (reason) {
            void message.error(
              reason instanceof Error
                ? reason.message
                : intl.formatMessage({ id: 'org.assignmentFailed' }),
            );
          } finally {
            setBulkSaving(false);
          }
        }}
      >
        <Typography.Paragraph type="secondary">
          {intl.formatMessage({ id: 'org.bulkHint' })}
        </Typography.Paragraph>
        <Input.Search
          allowClear
          aria-label={intl.formatMessage({ id: 'org.searchUsers' })}
          value={bulkKeyword}
          placeholder={intl.formatMessage({ id: 'org.searchUsers' })}
          onChange={(event) => setBulkKeyword(event.target.value)}
          onSearch={(value) => {
            setBulkPage(1);
            setBulkSearch(value.trim());
          }}
        />
        <Table<PlatformUser>
          className="kaiwu-org-member-table"
          rowKey="id"
          size="small"
          loading={bulkLoading}
          dataSource={bulkUsers}
          scroll={{ y: 305 }}
          locale={{
            emptyText: (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description={
                  bulkSearch ? intl.formatMessage({ id: 'layout.search.empty' }) : undefined
                }
              />
            ),
          }}
          rowSelection={{
            selectedRowKeys: bulkIds,
            preserveSelectedRowKeys: true,
            columnTitle: (checkbox) => (
              <Space size={6}>
                {checkbox}
                <Typography.Text type="secondary">
                  {intl.formatMessage({ id: 'layout.project.openMode.inline' })}
                </Typography.Text>
              </Space>
            ),
            columnWidth: 116,
            onChange: (keys) => setBulkIds(keys.map(String).slice(0, 100)),
            getCheckboxProps: (user) => ({
              disabled: !bulkIds.includes(user.id) && bulkIds.length >= 100,
            }),
          }}
          pagination={false}
          columns={[
            {
              title: intl.formatMessage({ id: 'org.user' }),
              render: (_, user) => (
                <Space direction="vertical" size={0}>
                  <Typography.Text strong>{user.displayName || user.username}</Typography.Text>
                  <Typography.Text type="secondary">@{user.username}</Typography.Text>
                </Space>
              ),
            },
          ]}
        />
        <div className="kaiwu-org-dialog-pagination">
          <Typography.Text type={bulkIds.length >= 100 ? 'warning' : 'secondary'}>
            {intl.formatMessage({ id: 'org.bulkSelected' }, { count: bulkIds.length })}
          </Typography.Text>
          <Pagination
            current={bulkPage}
            pageSize={10}
            total={bulkTotal}
            showSizeChanger={false}
            onChange={setBulkPage}
          />
        </div>
      </Modal>

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
        width={560}
        centered
        className="kaiwu-org-dialog"
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
