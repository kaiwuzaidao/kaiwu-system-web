import { ModalForm, ProFormSelect, ProTable } from '@ant-design/pro-components';
import { useIntl } from '@umijs/max';
import { App, Popconfirm, Space } from 'antd';
import { useEffect, useState } from 'react';
import AuthButton from '@/components/AuthButton';
import DictSelect from '@/components/DictSelect';
import DictTag from '@/components/DictTag';
import {
  deleteProjectMember,
  queryProjectMembers,
  queryProjectRoles,
  saveProjectMember,
  type ProjectMember,
  type ProjectRole,
} from '@/services/projects';
import { queryUsers, type PlatformUser } from '@/services/users';
import type { ProjectPermissionProps } from './types';

export default function MembersPanel({ project, permissions }: ProjectPermissionProps) {
  const { message } = App.useApp();
  const intl = useIntl();
  const [members, setMembers] = useState<ProjectMember[]>([]);
  const [roles, setRoles] = useState<ProjectRole[]>([]);
  const [users, setUsers] = useState<PlatformUser[]>([]);
  const [editing, setEditing] = useState<ProjectMember>();
  const [open, setOpen] = useState(false);

  const load = async () => {
    const [memberRows, roleRows, userPage] = await Promise.all([
      queryProjectMembers(project.id),
      queryProjectRoles(project.id),
      queryUsers({ current: 1, pageSize: 100 }),
    ]);
    setMembers(memberRows);
    setRoles(roleRows);
    setUsers(userPage.records.filter((user) => user.status === 'ENABLED'));
  };

  useEffect(() => {
    void load().catch((error) => {
      void message.error(error instanceof Error ? error.message : String(error));
    });
  }, [project.id]);

  // 角色在同一抽屉的「角色授权」页维护，本页加载后可能新增或停用了角色；打开表单前刷新一次。
  const openForm = (member?: ProjectMember) => {
    setEditing(member);
    setOpen(true);
    void queryProjectRoles(project.id)
      .then(setRoles)
      .catch((error) => {
        void message.error(error instanceof Error ? error.message : String(error));
      });
  };

  return (
    <>
      <ProTable<ProjectMember>
        rowKey="userId"
        search={false}
        pagination={false}
        dataSource={members}
        columns={[
          { title: intl.formatMessage({ id: 'members.username' }), dataIndex: 'username' },
          { title: intl.formatMessage({ id: 'members.displayName' }), dataIndex: 'displayName' },
          {
            title: intl.formatMessage({ id: 'members.roles' }),
            dataIndex: 'roleIds',
            renderText: (ids: string[]) =>
              ids.map((id) => roles.find((role) => role.id === id)?.roleName ?? id).join('、'),
          },
          {
            title: intl.formatMessage({ id: 'members.status' }),
            dataIndex: 'status',
            render: (_, record) => (
              <DictTag dictCode="project.member.status" value={record.status} />
            ),
          },
          {
            title: intl.formatMessage({ id: 'members.actions' }),
            valueType: 'option',
            render: (_, record) => (
              <Space>
                <AuthButton
                  type="link"
                  size="small"
                  permission="system:project:member"
                  permissions={permissions}
                  onClick={() => openForm(record)}
                >
                  {intl.formatMessage({ id: 'members.edit' })}
                </AuthButton>
                <Popconfirm
                  title={intl.formatMessage({ id: 'members.removeConfirm' })}
                  onConfirm={async () => {
                    try {
                      await deleteProjectMember(project.id, record.userId);
                      void message.success(intl.formatMessage({ id: 'members.removed' }));
                      await load();
                    } catch (error) {
                      void message.error(error instanceof Error ? error.message : String(error));
                    }
                  }}
                >
                  <AuthButton
                    type="link"
                    size="small"
                    danger
                    permission="system:project:member"
                    permissions={permissions}
                    disabled={record.userId === project.createdBy}
                  >
                    {intl.formatMessage({ id: 'members.remove' })}
                  </AuthButton>
                </Popconfirm>
              </Space>
            ),
          },
        ]}
        toolBarRender={() => [
          <AuthButton
            key="add"
            type="primary"
            permission="system:project:member"
            permissions={permissions}
            onClick={() => openForm()}
          >
            {intl.formatMessage({ id: 'members.add' })}
          </AuthButton>,
        ]}
      />
      <ModalForm<{ userId: string; roleIds: string[]; status: string }>
        key={editing?.userId ?? `new-member-${open}`}
        title={
          editing
            ? intl.formatMessage({ id: 'members.editTitle' }, { username: editing.username })
            : intl.formatMessage({ id: 'members.add' })
        }
        open={open}
        initialValues={
          editing
            ? { userId: editing.userId, roleIds: editing.roleIds, status: editing.status }
            : { status: 'ACTIVE', roleIds: [] }
        }
        modalProps={{ destroyOnHidden: true, onCancel: () => setOpen(false) }}
        onFinish={async (values) => {
          try {
            await saveProjectMember(project.id, values.userId, {
              roleIds: values.roleIds,
              status: values.status,
            });
            void message.success(intl.formatMessage({ id: 'members.saved' }));
            setOpen(false);
            await load();
            return true;
          } catch (error) {
            void message.error(error instanceof Error ? error.message : String(error));
            return false;
          }
        }}
      >
        <ProFormSelect
          colProps={{ span: 12 }}
          name="userId"
          label={intl.formatMessage({ id: 'members.platformUser' })}
          disabled={Boolean(editing)}
          showSearch
          options={users.map((user) => ({
            label: intl.formatMessage(
              { id: 'members.userOption' },
              { name: user.displayName, username: user.username },
            ),
            value: user.id,
          }))}
          rules={[{ required: true }]}
        />
        <ProFormSelect
          colProps={{ span: 12 }}
          name="roleIds"
          label={intl.formatMessage({ id: 'members.projectRole' })}
          mode="multiple"
          options={roles
            .filter((role) => role.status === 'ACTIVE')
            .map((role) => ({ label: role.roleName, value: role.id }))}
          rules={[{ required: true }]}
        />
        <DictSelect
          colProps={{ span: 12 }}
          name="status"
          label={intl.formatMessage({ id: 'members.memberStatus' })}
          dictCode="project.member.status"
          rules={[{ required: true }]}
        />
      </ModalForm>
    </>
  );
}
