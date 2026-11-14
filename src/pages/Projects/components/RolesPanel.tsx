import { ModalForm, ProFormText, ProTable } from '@ant-design/pro-components';
import { useIntl } from '@umijs/max';
import { App, Popconfirm, Space } from 'antd';
import { useEffect, useState } from 'react';
import AuthButton from '@/components/AuthButton';
import DictTag from '@/components/DictTag';
import {
  createProjectRole,
  deleteProjectRole,
  queryProjectMenus,
  queryProjectRoles,
  updateProjectRole,
  updateProjectRoleStatus,
  type ProjectMenu,
  type ProjectRole,
} from '@/services/projects';
import RoleGrantModal, { type GrantTab } from './RoleGrantModal';
import type { ProjectPermissionProps } from './types';

export default function RolesPanel({ project, permissions }: ProjectPermissionProps) {
  const { message } = App.useApp();
  const intl = useIntl();
  const [roles, setRoles] = useState<ProjectRole[]>([]);
  const [menus, setMenus] = useState<ProjectMenu[]>([]);
  const [editing, setEditing] = useState<ProjectRole>();
  const [formOpen, setFormOpen] = useState(false);
  const [granting, setGranting] = useState<{ role: ProjectRole; tab: GrantTab }>();

  const load = async () => {
    const [roleRows, menuRows] = await Promise.all([
      queryProjectRoles(project.id),
      queryProjectMenus(project.id),
    ]);
    setRoles(roleRows);
    setMenus(menuRows);
  };

  useEffect(() => {
    void load().catch((error) => {
      void message.error(error instanceof Error ? error.message : String(error));
    });
  }, [project.id]);

  return (
    <>
      <ProTable<ProjectRole>
        rowKey="id"
        search={false}
        pagination={false}
        dataSource={roles}
        columns={[
          { title: intl.formatMessage({ id: 'roles.code' }), dataIndex: 'roleCode' },
          { title: intl.formatMessage({ id: 'roles.name' }), dataIndex: 'roleName' },
          {
            title: intl.formatMessage({ id: 'roles.description' }),
            dataIndex: 'description',
            renderText: (value) => value || '-',
          },
          {
            title: intl.formatMessage({ id: 'roles.status' }),
            dataIndex: 'status',
            render: (_, record) => (
              <DictTag dictCode="project.member.status" value={record.status} />
            ),
          },
          {
            title: intl.formatMessage({ id: 'roles.menuCount' }),
            dataIndex: 'menuIds',
            renderText: (ids: string[]) => ids.length,
          },
          {
            title: intl.formatMessage({ id: 'roles.actions' }),
            valueType: 'option',
            render: (_, record) => (
              <Space>
                <AuthButton
                  type="link"
                  size="small"
                  permission="system:project:role"
                  permissions={permissions}
                  disabled={record.builtIn}
                  onClick={() => {
                    setEditing(record);
                    setFormOpen(true);
                  }}
                >
                  {intl.formatMessage({ id: 'roles.edit' })}
                </AuthButton>
                <AuthButton
                  type="link"
                  size="small"
                  permission="system:project:role"
                  permissions={permissions}
                  disabled={record.builtIn}
                  onClick={() => setGranting({ role: record, tab: 'menus' })}
                >
                  {intl.formatMessage({ id: 'roles.assignMenus' })}
                </AuthButton>
                <AuthButton
                  type="link"
                  size="small"
                  permission="system:project:role"
                  permissions={permissions}
                  onClick={() => setGranting({ role: record, tab: 'dataScope' })}
                >
                  {intl.formatMessage({ id: 'roles.dataScope' })}
                </AuthButton>
                <Popconfirm
                  title={intl.formatMessage({
                    id: record.status === 'ACTIVE' ? 'roles.disableConfirm' : 'roles.enableConfirm',
                  })}
                  onConfirm={async () => {
                    try {
                      await updateProjectRoleStatus(
                        project.id,
                        record.id,
                        record.status === 'ACTIVE' ? 'DISABLED' : 'ACTIVE',
                      );
                      await load();
                    } catch (error) {
                      void message.error(error instanceof Error ? error.message : String(error));
                    }
                  }}
                >
                  <AuthButton
                    type="link"
                    size="small"
                    permission="system:project:role"
                    permissions={permissions}
                    disabled={record.builtIn}
                  >
                    {intl.formatMessage({
                      id: record.status === 'ACTIVE' ? 'projects.disable' : 'projects.enable',
                    })}
                  </AuthButton>
                </Popconfirm>
                <Popconfirm
                  title={intl.formatMessage({ id: 'roles.deleteConfirm' })}
                  onConfirm={async () => {
                    try {
                      await deleteProjectRole(project.id, record.id);
                      void message.success(intl.formatMessage({ id: 'roles.deleted' }));
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
                    permission="system:project:role"
                    permissions={permissions}
                    disabled={record.builtIn}
                  >
                    {intl.formatMessage({ id: 'roles.delete' })}
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
            permission="system:project:role"
            permissions={permissions}
            onClick={() => {
              setEditing(undefined);
              setFormOpen(true);
            }}
          >
            {intl.formatMessage({ id: 'roles.create' })}
          </AuthButton>,
        ]}
      />
      <ModalForm<{ roleCode: string; roleName: string; description?: string }>
        key={editing?.id ?? `new-role-${formOpen}`}
        title={
          editing
            ? intl.formatMessage({ id: 'roles.editTitle' }, { name: editing.roleName })
            : intl.formatMessage({ id: 'roles.create' })
        }
        open={formOpen}
        initialValues={editing}
        modalProps={{ destroyOnHidden: true, onCancel: () => setFormOpen(false) }}
        onFinish={async (values) => {
          try {
            if (editing) {
              await updateProjectRole(project.id, editing.id, values);
            } else {
              await createProjectRole(project.id, values);
            }
            void message.success(intl.formatMessage({ id: 'roles.saved' }));
            setFormOpen(false);
            await load();
            return true;
          } catch (error) {
            void message.error(error instanceof Error ? error.message : String(error));
            return false;
          }
        }}
      >
        {!editing && (
          <ProFormText
            colProps={{ span: 12 }}
            name="roleCode"
            label={intl.formatMessage({ id: 'roles.code' })}
            rules={[{ required: true }, { pattern: /^[a-z][a-z0-9-]{1,63}$/ }]}
          />
        )}
        <ProFormText
          colProps={{ span: 12 }}
          name="roleName"
          label={intl.formatMessage({ id: 'roles.name' })}
          rules={[{ required: true }]}
        />
        <ProFormText
          colProps={{ span: 12 }}
          name="description"
          label={intl.formatMessage({ id: 'roles.roleDescription' })}
        />
      </ModalForm>
      {granting && (
        <RoleGrantModal
          key={`${granting.role.id}-${granting.tab}`}
          project={project}
          role={granting.role}
          menus={menus}
          initialTab={granting.tab}
          onClose={() => setGranting(undefined)}
          onSaved={() => {
            setGranting(undefined);
            void load();
          }}
        />
      )}
    </>
  );
}
