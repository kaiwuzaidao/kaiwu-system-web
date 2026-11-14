import { useIntl } from '@umijs/max';
import { App, Modal, Tabs } from 'antd';
import { useEffect, useState } from 'react';
import { queryDepartments, type Department } from '@/services/org';
import {
  grantProjectRoleMenus,
  queryRoleDataScopes,
  saveRoleDataScopes,
  type PlatformProject,
  type ProjectMenu,
  type ProjectRole,
  type RoleDataScopeItem,
} from '@/services/projects';
import { hasIncompleteCustomDept, isDirty, toSaveItems } from './dataScope';
import MenuGrantPicker from './MenuGrantPicker';
import RoleDataScopeEditor from './RoleDataScopeEditor';

export type GrantTab = 'menus' | 'dataScope';

type Props = {
  project: PlatformProject;
  role: ProjectRole;
  menus: ProjectMenu[];
  initialTab: GrantTab;
  onClose: () => void;
  /** 保存成功后由列表刷新角色数据。 */
  onSaved: () => void;
};

function sameIds(left: string[], right: string[]) {
  return JSON.stringify([...left].sort()) === JSON.stringify([...right].sort());
}

/**
 * 角色授权弹窗：「菜单授权」与「数据范围」两个页签共用一个保存按钮，只提交有改动的部分，
 * 避免切换页签后丢掉另一边的修改。内置角色不能分配菜单，数据范围页签只读。
 */
export default function RoleGrantModal({
  project,
  role,
  menus,
  initialTab,
  onClose,
  onSaved,
}: Props) {
  const { message } = App.useApp();
  const intl = useIntl();
  const [tab, setTab] = useState<GrantTab>(initialTab);
  const [menuIds, setMenuIds] = useState<string[]>(role.menuIds ?? []);
  const [saved, setSaved] = useState<RoleDataScopeItem[]>([]);
  const [items, setItems] = useState<RoleDataScopeItem[]>([]);
  const [readOnly, setReadOnly] = useState(role.builtIn);
  const [loading, setLoading] = useState(true);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const result = await queryRoleDataScopes(project.id, role.id);
        if (!active) return;
        setSaved(result.items);
        setItems(result.items);
        setReadOnly(result.readOnly);
        if (!result.readOnly) {
          // 部门树只在可编辑时才需要；读取失败不影响其它范围类型的配置。
          queryDepartments()
            .then((rows) => active && setDepartments(rows))
            .catch((error) => {
              void message.error(error instanceof Error ? error.message : String(error));
            });
        }
      } catch (error) {
        void message.error(error instanceof Error ? error.message : String(error));
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [project.id, role.id]);

  const menuDirty = !role.builtIn && !sameIds(menuIds, role.menuIds ?? []);
  const scopeDirty = !readOnly && isDirty(items, saved);

  const save = async () => {
    if (scopeDirty && hasIncompleteCustomDept(items)) {
      setTab('dataScope');
      void message.error(intl.formatMessage({ id: 'dataScope.departmentsRequired' }));
      return;
    }
    setSaving(true);
    try {
      if (menuDirty) {
        await grantProjectRoleMenus(project.id, role.id, menuIds);
        void message.success(intl.formatMessage({ id: 'roles.grantUpdated' }));
      }
      if (scopeDirty) {
        await saveRoleDataScopes(project.id, role.id, toSaveItems(items));
        void message.success(intl.formatMessage({ id: 'dataScope.saved' }));
      }
      onSaved();
    } catch (error) {
      void message.error(error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title={intl.formatMessage(
        { id: 'roles.grantTitle' },
        {
          suffix: intl.formatMessage({ id: 'projects.titleSuffix' }, { name: role.roleName }),
        },
      )}
      open
      width={880}
      destroyOnHidden
      confirmLoading={saving}
      onCancel={onClose}
      onOk={() => (menuDirty || scopeDirty ? save() : onClose())}
      okButtonProps={{ disabled: loading }}
    >
      <Tabs
        activeKey={tab}
        onChange={(key) => setTab(key as GrantTab)}
        items={[
          {
            key: 'menus',
            label: intl.formatMessage({ id: 'roles.tab.menus' }),
            disabled: role.builtIn,
            children: <MenuGrantPicker menus={menus} value={menuIds} onChange={setMenuIds} />,
          },
          {
            key: 'dataScope',
            label: intl.formatMessage({ id: 'roles.tab.dataScope' }),
            children: (
              <RoleDataScopeEditor
                items={items}
                onChange={setItems}
                readOnly={readOnly}
                loading={loading}
                departments={departments}
              />
            ),
          },
        ]}
      />
    </Modal>
  );
}
