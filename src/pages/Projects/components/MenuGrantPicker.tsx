import { CheckOutlined, SearchOutlined } from '@ant-design/icons';
import { useIntl } from '@umijs/max';
import { Button, Checkbox, Empty, Input, Tooltip, Typography } from 'antd';
import { useMemo, useState, type ReactNode } from 'react';
import DictTag from '@/components/DictTag';
import LineIcon from '@/components/LineIcon';
import type { ProjectMenu } from '@/services/projects';
import { referencedText } from '@/utils/referencedI18n';
import { flattenMenus } from './types';
import './MenuGrantPicker.less';

type Props = {
  menus: ProjectMenu[];
  value: string[];
  onChange: (ids: string[]) => void;
};

const BUTTON = 'BUTTON';
const DIRECTORY = 'DIRECTORY';

/** 节点自身与全部后代的 id。 */
function subtreeIds(menu: ProjectMenu): string[] {
  return [menu.id, ...flattenMenus(menu.children ?? []).map((child) => child.id)];
}

/**
 * 按「目录 → 菜单 → 操作」分配角色菜单，呈现为权限矩阵：目录是分区，菜单占一行，
 * 操作按钮是行内开关。
 *
 * <p>联动与后端一致（保存时会自动补齐祖先节点）：打开操作或子菜单时带上全部祖先，
 * 取消菜单时连同其后代一起取消——没有页面的操作权限没有意义。</p>
 */
export default function MenuGrantPicker({ menus, value, onChange }: Props) {
  const intl = useIntl();
  const [keyword, setKeyword] = useState('');
  const selected = useMemo(() => new Set(value), [value]);
  const all = useMemo(() => flattenMenus(menus), [menus]);
  const parentOf = useMemo(
    () => new Map(all.filter((menu) => menu.parentId).map((menu) => [menu.id, menu.parentId!])),
    [all],
  );

  const label = (menu: ProjectMenu) => referencedText(intl, menu.menuNameKey, menu.menuName);

  const ancestors = (id: string) => {
    const result: string[] = [];
    for (let cursor = parentOf.get(id); cursor; cursor = parentOf.get(cursor)) result.push(cursor);
    return result;
  };

  const apply = (add: string[], remove: string[]) => {
    const next = new Set(selected);
    remove.forEach((id) => next.delete(id));
    add.forEach((id) => next.add(id));
    onChange(all.map((menu) => menu.id).filter((id) => next.has(id)));
  };

  /** 节点及后代全选时取消整棵子树，否则选中整棵子树并补齐祖先。 */
  const toggleSubtree = (menu: ProjectMenu) => {
    const ids = subtreeIds(menu);
    if (ids.every((id) => selected.has(id))) apply([], ids);
    else apply([...ids, ...ancestors(menu.id)], []);
  };

  const toggleOne = (menu: ProjectMenu) => {
    if (selected.has(menu.id)) apply([], subtreeIds(menu));
    else apply([menu.id, ...ancestors(menu.id)], []);
  };

  // 搜索：命中节点连同祖先保留；命中的菜单保留其全部操作，便于整行勾选。
  const filtered = useMemo(() => {
    const text = keyword.trim().toLowerCase();
    if (!text) return menus;
    const hit = (menu: ProjectMenu) =>
      label(menu).toLowerCase().includes(text) ||
      (menu.permissionCode ?? '').toLowerCase().includes(text);
    const prune = (nodes: ProjectMenu[]): ProjectMenu[] =>
      nodes.flatMap((menu) => {
        if (hit(menu)) return [menu];
        const children = prune(menu.children ?? []);
        return children.length > 0 ? [{ ...menu, children }] : [];
      });
    return prune(menus);
  }, [keyword, menus, intl]);

  /** 后代的已选数与总数；不含节点自身，「2/4」读作四个操作开了两个。 */
  const progress = (menu: ProjectMenu) => {
    const ids = subtreeIds(menu).slice(1);
    return { done: ids.filter((id) => selected.has(id)).length, total: ids.length };
  };

  const subtreeCheckbox = (menu: ProjectMenu) => {
    const ids = subtreeIds(menu);
    const count = ids.filter((id) => selected.has(id)).length;
    return (
      <Checkbox
        aria-label={label(menu)}
        checked={count === ids.length}
        indeterminate={count > 0 && count < ids.length}
        onChange={() => toggleSubtree(menu)}
      />
    );
  };

  const disabledTag = (menu: ProjectMenu) =>
    menu.status !== 'ACTIVE' ? (
      <DictTag dictCode="project.member.status" value={menu.status} />
    ) : null;

  const chip = (menu: ProjectMenu) => {
    const on = selected.has(menu.id);
    return (
      <Tooltip key={menu.id} title={menu.permissionCode} mouseEnterDelay={0.5}>
        <button
          type="button"
          role="checkbox"
          aria-checked={on}
          className={`kaiwu-grant-chip${on ? ' is-on' : ''}`}
          onClick={() => toggleOne(menu)}
        >
          {on && <CheckOutlined />}
          {label(menu)}
        </button>
      </Tooltip>
    );
  };

  /** 菜单行：左侧菜单（整行开关），中间操作开关，右侧计数。 */
  const menuRow = (menu: ProjectMenu): ReactNode => {
    const buttons = (menu.children ?? []).filter((child) => child.menuType === BUTTON);
    const { done, total } = progress(menu);
    return (
      <div key={menu.id} className="kaiwu-grant-row">
        <div className="kaiwu-grant-menu">
          {buttons.length > 0 ? (
            subtreeCheckbox(menu)
          ) : (
            <Checkbox
              aria-label={label(menu)}
              checked={selected.has(menu.id)}
              onChange={() => toggleOne(menu)}
            />
          )}
          <Typography.Text ellipsis={{ tooltip: label(menu) }}>{label(menu)}</Typography.Text>
          {disabledTag(menu)}
        </div>
        <div className="kaiwu-grant-actions">{buttons.map(chip)}</div>
        <span className={`kaiwu-grant-count${total > 0 && done === total ? ' is-full' : ''}`}>
          {total > 0 ? `${done}/${total}` : ''}
        </span>
      </div>
    );
  };

  /** 分区内容：子菜单逐行展开，嵌套目录以小标题分隔；目录直属的操作由 section 单独成行。 */
  const sectionBody = (nodes: ProjectMenu[]): ReactNode[] =>
    nodes.flatMap((node) => {
      if (node.menuType === DIRECTORY) {
        return [
          <div key={`${node.id}-head`} className="kaiwu-grant-subhead">
            {subtreeCheckbox(node)}
            {label(node)}
          </div>,
          ...sectionBody(node.children ?? []),
        ];
      }
      if (node.menuType === BUTTON) return [];
      return [
        menuRow(node),
        ...sectionBody((node.children ?? []).filter((child) => child.menuType !== BUTTON)),
      ];
    });

  const section = (directory: ProjectMenu) => {
    const { done, total } = progress(directory);
    const looseButtons = (directory.children ?? []).filter((child) => child.menuType === BUTTON);
    return (
      <section key={directory.id} className="kaiwu-grant-section">
        <header className="kaiwu-grant-section-head">
          {subtreeCheckbox(directory)}
          <span className="kaiwu-grant-section-icon">
            <LineIcon name="layers" size={15} />
          </span>
          <span className="kaiwu-grant-section-title">{label(directory)}</span>
          {disabledTag(directory)}
          <span className="kaiwu-grant-progress">
            <span className="kaiwu-grant-progress-track">
              <span style={{ width: total ? `${(done / total) * 100}%` : 0 }} />
            </span>
            {done}/{total}
          </span>
        </header>
        {sectionBody(directory.children ?? [])}
        {looseButtons.length > 0 && (
          <div className="kaiwu-grant-row">
            <span />
            <div className="kaiwu-grant-actions">{looseButtons.map(chip)}</div>
            <span />
          </div>
        )}
      </section>
    );
  };

  // 顶层目录各成一个分区；不在目录下的顶层菜单合并到同一个无标题分区。
  const directories = filtered.filter((menu) => menu.menuType === DIRECTORY);
  const topMenus = filtered.filter((menu) => menu.menuType !== DIRECTORY);
  const allIds = all.map((menu) => menu.id);

  return (
    <div className="kaiwu-grant">
      <div className="kaiwu-grant-toolbar">
        <Input
          allowClear
          className="kaiwu-grant-search"
          prefix={<SearchOutlined />}
          placeholder={intl.formatMessage({ id: 'roles.menuSearch' })}
          value={keyword}
          onChange={(event) => setKeyword(event.target.value)}
        />
        <span className="kaiwu-grant-summary">
          {intl.formatMessage(
            { id: 'roles.menuSelected' },
            { selected: value.length, total: allIds.length },
          )}
        </span>
        <Button size="small" onClick={() => onChange(allIds)}>
          {intl.formatMessage({ id: 'roles.menuSelectAll' })}
        </Button>
        <Button size="small" type="text" onClick={() => onChange([])}>
          {intl.formatMessage({ id: 'common.clearSelection' })}
        </Button>
      </div>
      <div className="kaiwu-grant-list">
        {filtered.length === 0 ? (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={intl.formatMessage({ id: 'roles.menuNoMatch' })}
          />
        ) : (
          <>
            {directories.map(section)}
            {topMenus.length > 0 && (
              <section className="kaiwu-grant-section">{sectionBody(topMenus)}</section>
            )}
          </>
        )}
      </div>
    </div>
  );
}
