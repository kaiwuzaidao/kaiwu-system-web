import { ArrowDownOutlined, ArrowUpOutlined } from '@ant-design/icons';
import {
  ModalForm,
  ProFormDigit,
  ProFormSelect,
  ProFormSwitch,
  ProFormText,
  ProTable,
} from '@ant-design/pro-components';
import { useIntl } from '@umijs/max';
import { App, Button, Popconfirm, Space, Typography } from 'antd';
import { useEffect, useMemo, useState } from 'react';
import AuthButton from '@/components/AuthButton';
import DictSelect from '@/components/DictSelect';
import DictTag from '@/components/DictTag';
import LocalizedNameField from '@/components/LocalizedNameField';
import { MENU_ICON_OPTIONS, resolveMenuIcon } from '@/constants/menuIcons';
import {
  createProjectMenu,
  deleteProjectMenu,
  queryProjectMenus,
  updateProjectMenu,
  updateProjectMenuStatus,
  type ProjectMenu,
  type ProjectMenuInput,
} from '@/services/projects';
import { referencedText } from '@/utils/referencedI18n';
import { flattenMenus, type ProjectPermissionProps } from './types';
import { kaiwuPalette } from '@/theme/tokens';

export default function MenusPanel({ project, permissions }: ProjectPermissionProps) {
  const { message } = App.useApp();
  const intl = useIntl();
  const [menus, setMenus] = useState<ProjectMenu[]>([]);
  const [editing, setEditing] = useState<ProjectMenu>();
  const [open, setOpen] = useState(false);
  const [creatingParentId, setCreatingParentId] = useState<string>();
  const [expandedKeys, setExpandedKeys] = useState<React.Key[]>([]);
  const [expandInited, setExpandInited] = useState(false);
  const [moving, setMoving] = useState(false);

  const load = async () => {
    const rows = await queryProjectMenus(project.id);
    setMenus(rows);
    if (!expandInited) {
      setExpandedKeys(
        flattenMenus(rows)
          .filter((menu) => (menu.children?.length ?? 0) > 0)
          .map((menu) => menu.id),
      );
      setExpandInited(true);
    }
  };
  useEffect(() => {
    setExpandInited(false);
    setExpandedKeys([]);
    void load().catch((error) => {
      void message.error(error instanceof Error ? error.message : String(error));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.id, intl.locale]);

  const getSiblings = (record: ProjectMenu): ProjectMenu[] => {
    const stack: ProjectMenu[] = [...menus];
    while (stack.length) {
      const cur = stack.pop() as ProjectMenu;
      if (cur.children?.some((child) => child.id === record.id)) {
        return cur.children;
      }
      if (cur.children?.length) stack.push(...cur.children);
    }
    return menus;
  };

  const toInput = (menu: ProjectMenu, sortNo: number): ProjectMenuInput => ({
    parentId: menu.parentId || undefined,
    menuName: menu.menuName,
    menuNameKey: menu.menuNameKey,
    menuType: menu.menuType as 'DIR' | 'MENU' | 'BUTTON',
    routePath: menu.routePath,
    componentPath: menu.componentPath,
    permissionCode: menu.permissionCode,
    icon: menu.icon,
    sortNo,
    visible: menu.visible,
  });

  const moveMenu = async (record: ProjectMenu, direction: -1 | 1) => {
    const siblings = getSiblings(record);
    const idx = siblings.findIndex((item) => item.id === record.id);
    const target = siblings[idx + direction];
    if (!target) return;
    setMoving(true);
    try {
      await updateProjectMenu(project.id, record.id, toInput(record, target.sortNo));
      await updateProjectMenu(project.id, target.id, toInput(target, record.sortNo));
      void message.success(intl.formatMessage({ id: 'menus.orderUpdated' }));
      await load();
    } catch (reason) {
      void message.error(
        reason instanceof Error ? reason.message : intl.formatMessage({ id: 'menus.orderFailed' }),
      );
    } finally {
      setMoving(false);
    }
  };
  const parentOptions = useMemo(
    () => [
      { label: intl.formatMessage({ id: 'menus.root' }), value: '' },
      ...flattenMenus(menus)
        .filter((menu) => menu.menuType !== 'BUTTON')
        .map((menu) => ({
          label: referencedText(intl, menu.menuNameKey, menu.menuName),
          value: menu.id,
        })),
    ],
    [intl, menus],
  );

  const fields = (
    <>
      <ProFormSelect
        colProps={{ span: 12 }}
        name="parentId"
        label={intl.formatMessage({ id: 'menus.parent' })}
        options={parentOptions}
      />
      <LocalizedNameField
        fallbackName="menuName"
        fallbackLabel={intl.formatMessage({ id: 'menus.name' })}
        fallbackRequired
        keyName="menuNameKey"
      />
      <DictSelect
        colProps={{ span: 12 }}
        name="menuType"
        label={intl.formatMessage({ id: 'menus.type' })}
        dictCode="platform.menu.type"
        rules={[{ required: true }]}
      />
      <ProFormText
        colProps={{ span: 12 }}
        name="routePath"
        label={intl.formatMessage({ id: 'menus.routePath' })}
        placeholder={intl.formatMessage({ id: 'menus.routeRequired' })}
      />
      <ProFormText
        colProps={{ span: 12 }}
        name="componentPath"
        label={intl.formatMessage({ id: 'menus.componentPath' })}
      />
      <ProFormSelect
        colProps={{ span: 12 }}
        name="icon"
        label={intl.formatMessage({ id: 'menus.icon' })}
        options={MENU_ICON_OPTIONS}
        placeholder={intl.formatMessage({ id: 'menus.iconPlaceholder' })}
        fieldProps={{ allowClear: true, showSearch: true }}
        tooltip={intl.formatMessage({ id: 'menus.iconExtra' })}
      />
      <ProFormText
        colProps={{ span: 12 }}
        name="permissionCode"
        label={intl.formatMessage({ id: 'menus.permission' })}
        placeholder={intl.formatMessage({ id: 'menus.permissionPlaceholder' })}
        tooltip={intl.formatMessage({ id: 'menus.permissionExtra' })}
      />
      <ProFormDigit
        colProps={{ span: 12 }}
        name="sortNo"
        label={intl.formatMessage({ id: 'menus.sort' })}
        min={0}
        max={9999}
        rules={[{ required: true }]}
      />
      <ProFormSwitch
        colProps={{ span: 12 }}
        name="visible"
        label={intl.formatMessage({ id: 'menus.visible' })}
      />
    </>
  );

  return (
    <>
      <ProTable<ProjectMenu>
        rowKey="id"
        search={false}
        pagination={false}
        options={false}
        loading={moving}
        dataSource={menus}
        expandable={{
          expandedRowKeys: expandedKeys,
          onExpandedRowsChange: (keys) => setExpandedKeys([...keys]),
        }}
        columns={[
          {
            title: intl.formatMessage({ id: 'menus.name' }),
            dataIndex: 'menuName',
            width: 180,
            render: (_, menu) => referencedText(intl, menu.menuNameKey, menu.menuName),
          },
          {
            title: intl.formatMessage({ id: 'menus.icon' }),
            dataIndex: 'icon',
            width: 160,
            render: (_, record) =>
              record.icon ? (
                <Space size={6}>
                  {resolveMenuIcon(record.icon)}
                  <Typography.Text type="secondary">{record.icon}</Typography.Text>
                </Space>
              ) : (
                '-'
              ),
          },
          {
            title: intl.formatMessage({ id: 'menus.order' }),
            width: 92,
            align: 'center',
            render: (_, record) => {
              const siblings = getSiblings(record);
              const idx = siblings.findIndex((item) => item.id === record.id);
              const isFirst = idx <= 0;
              const isLast = idx < 0 || idx >= siblings.length - 1;
              if (!permissions.includes('system:project:menu')) {
                return <span style={{ color: kaiwuPalette.textTertiary }}>{record.sortNo}</span>;
              }
              return (
                <Space size={2}>
                  <Button
                    type="text"
                    size="small"
                    disabled={isFirst || moving}
                    icon={<ArrowUpOutlined />}
                    onClick={() => void moveMenu(record, -1)}
                  />
                  <Button
                    type="text"
                    size="small"
                    disabled={isLast || moving}
                    icon={<ArrowDownOutlined />}
                    onClick={() => void moveMenu(record, 1)}
                  />
                </Space>
              );
            },
          },
          {
            title: intl.formatMessage({ id: 'menus.type' }),
            dataIndex: 'menuType',
            render: (_, record) => (
              <DictTag dictCode="platform.menu.type" value={record.menuType} />
            ),
          },
          {
            title: intl.formatMessage({ id: 'menus.route' }),
            dataIndex: 'routePath',
            renderText: (value) => value || '-',
          },
          {
            title: intl.formatMessage({ id: 'menus.permission' }),
            dataIndex: 'permissionCode',
            renderText: (value) => value || '-',
          },
          {
            title: intl.formatMessage({ id: 'menus.status' }),
            dataIndex: 'status',
            render: (_, record) => (
              <DictTag dictCode="project.member.status" value={record.status} />
            ),
          },
          {
            title: intl.formatMessage({ id: 'menus.actions' }),
            valueType: 'option',
            render: (_, record) => (
              <Space>
                <AuthButton
                  type="link"
                  size="small"
                  permission="system:project:menu"
                  permissions={permissions}
                  disabled={record.menuType === 'BUTTON'}
                  onClick={() => {
                    setEditing(undefined);
                    setCreatingParentId(record.id);
                    setOpen(true);
                  }}
                >
                  {intl.formatMessage({ id: 'menus.addChild' })}
                </AuthButton>
                <AuthButton
                  type="link"
                  size="small"
                  permission="system:project:menu"
                  permissions={permissions}
                  onClick={() => {
                    setEditing(record);
                    setCreatingParentId(undefined);
                    setOpen(true);
                  }}
                >
                  {intl.formatMessage({ id: 'menus.edit' })}
                </AuthButton>
                <Popconfirm
                  title={intl.formatMessage({
                    id: record.status === 'ACTIVE' ? 'menus.disableConfirm' : 'menus.enableConfirm',
                  })}
                  onConfirm={async () => {
                    try {
                      await updateProjectMenuStatus(
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
                    permission="system:project:menu"
                    permissions={permissions}
                  >
                    {intl.formatMessage({
                      id: record.status === 'ACTIVE' ? 'projects.disable' : 'projects.enable',
                    })}
                  </AuthButton>
                </Popconfirm>
                <Popconfirm
                  title={intl.formatMessage({ id: 'menus.deleteConfirm' })}
                  onConfirm={async () => {
                    try {
                      await deleteProjectMenu(project.id, record.id);
                      void message.success(intl.formatMessage({ id: 'menus.deleted' }));
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
                    permission="system:project:menu"
                    permissions={permissions}
                  >
                    {intl.formatMessage({ id: 'menus.delete' })}
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
            permission="system:project:menu"
            permissions={permissions}
            onClick={() => {
              setEditing(undefined);
              setCreatingParentId(undefined);
              setOpen(true);
            }}
          >
            {intl.formatMessage({ id: 'menus.createRoot' })}
          </AuthButton>,
        ]}
      />
      <ModalForm<ProjectMenuInput>
        grid
        rowProps={{ gutter: 16 }}
        key={editing?.id ?? `${creatingParentId ?? 'root'}-${open}`}
        title={
          editing
            ? intl.formatMessage({ id: 'menus.editTitle' }, { name: editing.menuName })
            : intl.formatMessage({ id: 'menus.createTitle' })
        }
        open={open}
        initialValues={
          editing
            ? { ...editing }
            : {
                parentId: creatingParentId,
                menuType: 'MENU',
                sortNo: 0,
                visible: true,
              }
        }
        modalProps={{ destroyOnHidden: true, onCancel: () => setOpen(false) }}
        onFinish={async (values) => {
          try {
            const input = { ...values, parentId: values.parentId || undefined };
            if (editing) {
              await updateProjectMenu(project.id, editing.id, input);
            } else {
              await createProjectMenu(project.id, input);
            }
            void message.success(intl.formatMessage({ id: 'menus.saved' }));
            setOpen(false);
            await load();
            return true;
          } catch (error) {
            void message.error(error instanceof Error ? error.message : String(error));
            return false;
          }
        }}
      >
        {fields}
      </ModalForm>
    </>
  );
}
