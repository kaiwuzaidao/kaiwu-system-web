import { kaiwuPalette } from '@/theme/tokens';
import { DeleteOutlined, EditOutlined, HolderOutlined, PlusOutlined } from '@ant-design/icons';
import {
  ModalForm,
  PageContainer,
  ProFormDigit,
  ProFormSwitch,
  ProFormText,
  ProFormTextArea,
} from '@ant-design/pro-components';
import {
  App,
  Button,
  Col,
  Collapse,
  Empty,
  Form,
  Input,
  Popconfirm,
  Radio,
  Row,
  Space,
  Table,
  Tag,
  Tooltip,
  Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useEffect, useMemo, useState, useRef } from 'react';
import { useIntl } from '@umijs/max';
import AuthButton from '@/components/AuthButton';
import DictSelect from '@/components/DictSelect';
import DictTag from '@/components/DictTag';
import LocaleCodeHelp from '@/components/LocaleCodeHelp';
import MetadataScopePicker from '@/components/MetadataScopePicker';
import useRowDragSort from '@/hooks/useRowDragSort';
import LocalizedNameField, {
  coveredLocales,
  ResourceCreatorModal,
  ResourcePickerModal,
} from '@/components/LocalizedNameField';
import { type I18nResource, queryI18nResourceOptions } from '@/services/i18n';
import { queryCurrentUser } from '@/services/auth';
import { referencedText } from '@/utils/referencedI18n';
import {
  deleteDictItem,
  deleteDictType,
  queryDictItems,
  queryDictTypes,
  queryPlatformDict,
  saveDictItem,
  saveDictType,
  sortDictItems,
  sortDictTypes,
  type DictItem,
  type DictType,
} from '@/services/metadata';

function parseExtraJson(value?: string): Record<string, unknown> {
  if (!value) return {};
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

type ExtraEntry = { key?: string; value?: string };

/**
 * 扩展 JSON ↔ 键值对的双向转换。
 *
 * <p>值统一按文本编辑，提交时**尝试按 JSON 解析**：`true` / `123` / `{"a":1}` 会还原成
 * 布尔、数字、对象，解析不了的按字符串存。这样 `{"selectable":true}` 这类既有数据
 * 编辑后类型不会退化成字符串；代价是想存字面量 `"true"` 会被解析成布尔，
 * 但 extraJson 的实际用途（图标名、locale 标识等）不会撞上这种情况。</p>
 */
function toExtraEntries(extraJson?: string): ExtraEntry[] {
  return Object.entries(parseExtraJson(extraJson)).map(([key, value]) => ({
    key,
    value: typeof value === 'string' ? value : JSON.stringify(value),
  }));
}

function fromExtraEntries(entries?: ExtraEntry[]): string | undefined {
  const result: Record<string, unknown> = {};
  for (const entry of entries ?? []) {
    const key = entry?.key?.trim();
    if (!key) continue;
    const raw = entry.value ?? '';
    try {
      result[key] = JSON.parse(raw);
    } catch {
      result[key] = raw;
    }
  }
  // 没有任何键时存 undefined 而不是 "{}"，与改造前「留空即不填」的语义一致。
  return Object.keys(result).length ? JSON.stringify(result) : undefined;
}

/** 扩展配置的键值对编辑器，免去手写 JSON。 */
function ExtraEntriesField() {
  const intl = useIntl();
  return (
    <Form.List name="extraEntries">
      {(fields, { add, remove }) => (
        <>
          {fields.map((field) => (
            <Space key={field.key} align="baseline" style={{ display: 'flex', marginBottom: 8 }}>
              <Form.Item {...field} name={[field.name, 'key']} noStyle>
                <Input
                  style={{ width: 200 }}
                  placeholder={intl.formatMessage({ id: 'dicts.extraKey' })}
                />
              </Form.Item>
              <Form.Item {...field} name={[field.name, 'value']} noStyle>
                <Input
                  style={{ width: 280 }}
                  placeholder={intl.formatMessage({ id: 'dicts.extraValue' })}
                />
              </Form.Item>
              <Button
                type="text"
                danger
                icon={<DeleteOutlined />}
                onClick={() => remove(field.name)}
              />
            </Space>
          ))}
          <Button type="dashed" block icon={<PlusOutlined />} onClick={() => add()}>
            {intl.formatMessage({ id: 'dicts.extraAdd' })}
          </Button>
        </>
      )}
    </Form.List>
  );
}

/**
 * 字典项标签的双模式录入：独立填写（单一原文）或引用国际化资源。
 *
 * <p>ADR 0015 起多语言只有引用这一条路，独立填写不再提供逐语言输入。
 * 与 `LocalizedNameField` 的差别仅在于字段名和 label，资源选择/新建弹窗直接复用。</p>
 */
function DictLabelField() {
  const { message } = App.useApp();
  const intl = useIntl();
  const form = Form.useFormInstance();
  const labelI18nKey: string | undefined = Form.useWatch('labelI18nKey', form);
  const itemLabel: string | undefined = Form.useWatch('itemLabel', form);
  const mode = labelI18nKey ? 'referenced' : 'fixed';

  const [resources, setResources] = useState<I18nResource[]>([]);
  const [resourcesLoaded, setResourcesLoaded] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [creatorOpen, setCreatorOpen] = useState(false);

  const loadResources = async (silent = false) => {
    try {
      const rows = await queryI18nResourceOptions();
      setResources(rows);
      setResourcesLoaded(true);
      return rows;
    } catch (reason) {
      if (!silent) {
        void message.error(
          reason instanceof Error
            ? reason.message
            : intl.formatMessage({ id: 'localizedName.loadFailed' }),
        );
      }
      return [];
    }
  };

  useEffect(() => {
    if (labelI18nKey && !resourcesLoaded) void loadResources(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [labelI18nKey]);

  const currentResource = useMemo(
    () => resources.find((item) => item.messageKey === labelI18nKey),
    [resources, labelI18nKey],
  );

  const applyResource = (resource: I18nResource) => {
    form.setFieldsValue({
      labelI18nKey: resource.messageKey,
      itemLabel: resource.defaultText,
    });
  };

  const switchMode = async (next: 'fixed' | 'referenced') => {
    if (next === mode) return;
    if (next === 'referenced') {
      if (!resourcesLoaded) await loadResources();
      setPickerOpen(true);
    } else {
      form.setFieldValue('labelI18nKey', undefined);
    }
  };

  return (
    <div style={{ width: '100%', marginBottom: 24 }}>
      <Form.Item name="labelI18nKey" hidden>
        <Input />
      </Form.Item>
      {/* 与 LocalizedNameField 保持一致：模式选择放进标签行，不独占一行。 */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          marginBottom: 8,
          minHeight: 32,
        }}
      >
        <span>
          <Typography.Text type="danger" style={{ marginRight: 4 }}>
            *
          </Typography.Text>
          {intl.formatMessage({ id: 'dicts.displayLabel' })}
        </span>
        <Radio.Group value={mode} onChange={(event) => void switchMode(event.target.value)}>
          <Radio value="fixed">{intl.formatMessage({ id: 'localizedName.modeFixed' })}</Radio>
          <Radio value="referenced">
            {intl.formatMessage({ id: 'localizedName.modeReferenced' })}
          </Radio>
        </Radio.Group>
      </div>

      {mode === 'fixed' ? (
        // ADR 0015：独立填写只有单一原文，多语言一律走引用资源——
        // 两条路并存会造成两个真相源，改了一处不生效。
        <Form.Item name="itemLabel" rules={[{ required: true }]} style={{ marginBottom: 0 }}>
          <Input />
        </Form.Item>
      ) : (
        <>
          <Form.Item name="itemLabel" hidden rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <div
            style={{
              padding: 12,
              border: `1px solid ${kaiwuPalette.border}`,
              borderRadius: 6,
              background: '#fafafa',
            }}
          >
            <Space size={8} wrap style={{ display: 'flex', marginBottom: 8 }}>
              <Typography.Text type="secondary">
                {intl.formatMessage({ id: 'localizedName.referenced' })}
              </Typography.Text>
              <Typography.Text code copyable>
                {labelI18nKey}
              </Typography.Text>
              <Button type="link" size="small" onClick={() => setPickerOpen(true)}>
                {intl.formatMessage({ id: 'localizedName.change' })}
              </Button>
            </Space>
            {/* 与 LocalizedNameField 的预览卡片保持同样的两行紧凑布局。 */}
            <Space size={16} wrap style={{ display: 'flex' }}>
              <span>
                <Typography.Text type="secondary" style={{ marginRight: 8 }}>
                  {intl.formatMessage({ id: 'localizedName.defaultPreview' })}
                </Typography.Text>
                <Typography.Text strong>{itemLabel || '-'}</Typography.Text>
              </span>
              {coveredLocales(currentResource?.translationsJson).length > 0 && (
                <span>
                  <Typography.Text type="secondary" style={{ marginRight: 8 }}>
                    {intl.formatMessage({ id: 'localizedName.translationsPreview' })}
                  </Typography.Text>
                  {coveredLocales(currentResource?.translationsJson).map((locale) => (
                    <Tag key={locale} style={{ marginInlineEnd: 4 }}>
                      {locale}
                    </Tag>
                  ))}
                </span>
              )}
            </Space>
          </div>
        </>
      )}

      <ResourcePickerModal
        open={pickerOpen}
        resources={resources}
        onClose={() => {
          setPickerOpen(false);
          if (!labelI18nKey) form.setFieldValue('labelI18nKey', undefined);
        }}
        onCreate={() => {
          setPickerOpen(false);
          setCreatorOpen(true);
        }}
        onPick={(resource) => {
          applyResource(resource);
          setPickerOpen(false);
        }}
      />
      <ResourceCreatorModal
        open={creatorOpen}
        defaultText={itemLabel}
        onClose={() => setCreatorOpen(false)}
        onCreated={async (created) => {
          await loadResources(true);
          applyResource(created);
          setCreatorOpen(false);
        }}
      />
    </div>
  );
}

/**
 * 语言代码是否是规范 BCP 47 标签。
 *
 * 与后端 LocaleCode.isValid 保持同一判定：拒绝下划线写法、拒绝 Intl 无法规范化的值，
 * 并要求输入本身已是规范形式（`zh-cn` 会被判为不规范，应写 `zh-CN`）。
 * 前端先拦一道是为了当场给出可修正的提示，后端仍是最终边界。
 */
function isValidLocaleCode(value: string): boolean {
  const code = value.trim();
  if (!code || code.includes('_')) return false;
  try {
    const locale = new Intl.Locale(code);
    // 与后端 LocaleCode.isValid 对齐三点：语言子标签必须真实存在（`jp` 不是 ISO 语言，
    // 正确写法是 `ja`）、区域子标签必须真实存在（排除 `xx-YY`）、输入本身已是规范形式。
    const languageKnown = Intl.DisplayNames
      ? new Intl.DisplayNames(['en'], { type: 'language', fallback: 'none' }).of(
          locale.language,
        ) !== undefined
      : true;
    const regionKnown =
      !locale.region ||
      !Intl.DisplayNames ||
      new Intl.DisplayNames(['en'], { type: 'region', fallback: 'none' }).of(locale.region) !==
        undefined;
    return (
      languageKnown &&
      regionKnown &&
      locale.toString().toLowerCase() === code.toLowerCase() &&
      /^[A-Za-z]{2,3}(-[A-Za-z0-9]+)*$/.test(code)
    );
  } catch {
    return false;
  }
}

export default function DictionariesPage() {
  // 右栏是独立滚动容器，字典项表头相对它吸顶而不是相对页面。
  const typeScrollRef = useRef<HTMLDivElement>(null);
  const itemScrollRef = useRef<HTMLDivElement>(null);
  const { message } = App.useApp();
  const intl = useIntl();
  const [scopeId, setScopeId] = useState('0');
  const [permissions, setPermissions] = useState<string[]>([]);
  const [types, setTypes] = useState<DictType[]>([]);
  const [selected, setSelected] = useState<DictType>();
  const [items, setItems] = useState<DictItem[]>([]);
  const [localeItems, setLocaleItems] = useState<DictItem[]>([]);
  const [typeEditing, setTypeEditing] = useState<DictType>();
  const [itemEditing, setItemEditing] = useState<DictItem>();
  const [typeOpen, setTypeOpen] = useState(false);
  const [itemOpen, setItemOpen] = useState(false);
  // scope 快速切换时，旧请求晚于新请求返回不能覆盖当前页面状态。
  const typeRequestVersion = useRef(0);
  const itemRequestVersion = useRef(0);
  // 状态更新在下一次 render 才生效；这里保存已确认的切换意图，供异步请求立即校验。
  const activeScopeRef = useRef(scopeId);

  useEffect(() => {
    void queryCurrentUser().then((user) => {
      setPermissions(user.permissions);
    });
  }, []);

  useEffect(() => {
    void queryPlatformDict('platform.locale')
      .then((dictionary) => setLocaleItems(dictionary.items))
      .catch((reason) => {
        void message.error(
          reason instanceof Error
            ? reason.message
            : intl.formatMessage({ id: 'dicts.loadLocalesFailed' }),
        );
      });
  }, [intl, message]);

  const loadTypes = async (nextScope = scopeId) => {
    const requestVersion = ++typeRequestVersion.current;
    try {
      const rows = await queryDictTypes(nextScope);
      if (requestVersion !== typeRequestVersion.current || activeScopeRef.current !== nextScope)
        return;
      setTypes(rows);
      setSelected((current) => rows.find((row) => row.id === current?.id) ?? rows[0]);
    } catch (reason) {
      if (requestVersion !== typeRequestVersion.current) return;
      void message.error(
        reason instanceof Error ? reason.message : intl.formatMessage({ id: 'dicts.loadFailed' }),
      );
    }
  };
  const loadItems = async () => {
    const requestVersion = ++itemRequestVersion.current;
    // typeId 只在其所属 scope 内有效。React effect 会在 scope 变更后的旧 render 中
    // 运行一次；不能依赖错误文案来吞掉这条无效请求，必须在发请求前阻止它。
    if (!selected || selected.scopeId !== scopeId || activeScopeRef.current !== scopeId) {
      setItems([]);
      return;
    }
    try {
      const rows = await queryDictItems(scopeId, selected.id);
      if (requestVersion !== itemRequestVersion.current) return;
      setItems(rows);
    } catch (reason) {
      if (requestVersion !== itemRequestVersion.current) return;
      setItems([]);
      const text = reason instanceof Error ? reason.message : String(reason);
      void message.error(text || intl.formatMessage({ id: 'dicts.loadItemsFailed' }));
    }
  };

  useEffect(() => {
    void loadTypes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopeId]);
  useEffect(() => {
    void loadItems();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopeId, selected?.id]);

  const changeScope = (nextScope: string) => {
    if (nextScope === scopeId) return;
    // 先同步失效旧请求，再提交 state：React 的 effect 可能在下一轮渲染前收到旧响应。
    activeScopeRef.current = nextScope;
    typeRequestVersion.current += 1;
    itemRequestVersion.current += 1;
    // 在更新 scope 的同一批状态中清空旧选中，避免旧字典在新 scope 里短暂可见或可操作。
    setSelected(undefined);
    setItems([]);
    setScopeId(nextScope);
  };

  // 后端复用保存权限做排序鉴权；没有该权限时不渲染手柄，免得拖完才收到 403。
  const canSort = permissions.includes('system:dict:save');

  /**
   * 拖拽结果先落到界面再提交后端：一次拖拽紧接一次整表刷新会让行"跳"一下。
   * 失败必须回滚——保留拖后的顺序等于让界面显示一个库里并不存在的顺序。
   */
  const reorderTypes = async (orderedIds: string[]) => {
    const previous = types;
    const requestScope = scopeId;
    setTypes(
      orderedIds
        .map((id) => previous.find((row) => row.id === id))
        .filter((row): row is DictType => Boolean(row)),
    );
    try {
      await sortDictTypes(requestScope, orderedIds);
      void message.success(intl.formatMessage({ id: 'dicts.sortSaved' }));
    } catch (reason) {
      // 请求期间切了作用范围就不再回滚：那份旧数据已经不属于当前界面。
      if (activeScopeRef.current === requestScope) setTypes(previous);
      void message.error(reason instanceof Error ? reason.message : String(reason));
    }
  };

  const reorderItems = async (orderedIds: string[]) => {
    const previous = items;
    const requestScope = scopeId;
    const typeId = selected!.id;
    setItems(
      orderedIds
        .map((id) => previous.find((row) => row.id === id))
        .filter((row): row is DictItem => Boolean(row)),
    );
    try {
      await sortDictItems(requestScope, typeId, orderedIds);
      void message.success(intl.formatMessage({ id: 'dicts.sortSaved' }));
    } catch (reason) {
      if (activeScopeRef.current === requestScope) setItems(previous);
      void message.error(reason instanceof Error ? reason.message : String(reason));
    }
  };

  const typeDragSort = useRowDragSort(
    types.map((row) => row.id),
    (ids) => void reorderTypes(ids),
    canSort,
  );
  const itemDragSort = useRowDragSort(
    items.map((row) => row.id),
    (ids) => void reorderItems(ids),
    canSort,
  );

  /** 拖拽手柄列；两张表共用同一形状，只在有排序权限时才加入 columns。 */
  const dragColumn = <T extends { id: string }>(
    sort: typeof typeDragSort,
  ): ColumnsType<T>[number] => ({
    title: '',
    width: 40,
    render: (_, row) => (
      <Tooltip title={intl.formatMessage({ id: 'dicts.dragSort' })}>
        <HolderOutlined
          {...sort.handleProps(row.id)}
          style={{ color: kaiwuPalette.textTertiary, cursor: 'grab' }}
        />
      </Tooltip>
    ),
  });

  const typeColumns: ColumnsType<DictType> = [
    ...(canSort ? [dragColumn<DictType>(typeDragSort)] : []),
    {
      title: intl.formatMessage({ id: 'dicts.dictionary' }),
      render: (_, row) => (
        <Space direction="vertical" size={0}>
          <Typography.Text strong>
            {referencedText(intl, row.dictNameKey, row.dictName)}
          </Typography.Text>
          <Typography.Text
            type="secondary"
            copyable={{ text: row.dictCode }}
            style={{
              fontSize: 12,
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
            }}
          >
            {row.dictCode}
          </Typography.Text>
        </Space>
      ),
    },
    {
      title: intl.formatMessage({ id: 'dicts.status' }),
      width: 90,
      render: (_, row) => <DictTag dictCode="common.status" value={row.status} />,
    },
    {
      title: intl.formatMessage({ id: 'dicts.actions' }),
      width: 110,
      render: (_, row) => (
        <Space size={2}>
          <AuthButton
            type="text"
            size="small"
            icon={<EditOutlined />}
            permission="system:dict:save"
            permissions={permissions}
            onClick={(event) => {
              event.stopPropagation();
              setTypeEditing(row);
              setTypeOpen(true);
            }}
          />
          <Popconfirm
            title={intl.formatMessage({ id: 'dicts.deleteTypeConfirm' })}
            onConfirm={async () => {
              try {
                await deleteDictType(scopeId, row.id);
                void message.success(intl.formatMessage({ id: 'dicts.deleted' }));
                await loadTypes();
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
              permission="system:dict:delete"
              permissions={permissions}
              onClick={(event) => event.stopPropagation()}
            />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const itemColumns: ColumnsType<DictItem> = [
    ...(canSort ? [dragColumn<DictItem>(itemDragSort)] : []),
    {
      title: intl.formatMessage({ id: 'dicts.label' }),
      dataIndex: 'itemLabel',
      render: (_, row) => referencedText(intl, row.labelI18nKey, row.itemLabel),
    },
    {
      title: intl.formatMessage({ id: 'dicts.value' }),
      dataIndex: 'itemValue',
      render: (value) => (
        <Typography.Text
          copyable={{ text: String(value ?? '') }}
          style={{
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
            fontSize: 13,
          }}
        >
          {value}
        </Typography.Text>
      ),
    },
    { title: intl.formatMessage({ id: 'dicts.sort' }), dataIndex: 'sortNo', width: 70 },
    {
      title: intl.formatMessage({ id: 'dicts.default' }),
      width: 70,
      render: (_, row) =>
        row.defaultItem ? (
          <Tag color="processing">{intl.formatMessage({ id: 'dicts.default' })}</Tag>
        ) : (
          '-'
        ),
    },
    {
      title: intl.formatMessage({ id: 'dicts.color' }),
      width: 100,
      render: (_, row) => (row.color ? <Tag color={row.color}>{row.color}</Tag> : '-'),
    },
    {
      title: intl.formatMessage({ id: 'dicts.status' }),
      width: 90,
      render: (_, row) => <DictTag dictCode="common.status" value={row.status} />,
    },
    {
      title: intl.formatMessage({ id: 'dicts.actions' }),
      width: 130,
      render: (_, row) => (
        <Space>
          <AuthButton
            type="link"
            size="small"
            permission="system:dict:save"
            permissions={permissions}
            onClick={() => {
              setItemEditing(row);
              setItemOpen(true);
            }}
          >
            {intl.formatMessage({ id: 'dicts.edit' })}
          </AuthButton>
          <Popconfirm
            title={intl.formatMessage({ id: 'dicts.deleteItemConfirm' })}
            onConfirm={async () => {
              try {
                await deleteDictItem(scopeId, selected!.id, row.id);
                void message.success(intl.formatMessage({ id: 'dicts.itemDeleted' }));
                await loadItems();
              } catch (error) {
                void message.error(error instanceof Error ? error.message : String(error));
              }
            }}
          >
            <AuthButton
              type="link"
              size="small"
              danger
              permission="system:dict:delete"
              permissions={permissions}
            >
              {intl.formatMessage({ id: 'dicts.delete' })}
            </AuthButton>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <PageContainer
      title={intl.formatMessage({ id: 'dicts.title' })}
      subTitle={intl.formatMessage({ id: 'dicts.subtitle' })}
    >
      {/* 工具条吸顶：字典条数多，滚到下方仍要能切换作用范围和新增，
          否则每次都得滚回顶部。zIndex 高于表格吸顶表头（antd 默认 2）。 */}
      <div
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 11,
          marginBottom: 16,
          paddingBlock: 8,
          background: kaiwuPalette.page,
          display: 'flex',
          justifyContent: 'space-between',
          gap: 16,
        }}
      >
        <MetadataScopePicker value={scopeId} onChange={changeScope} />
        <AuthButton
          type="primary"
          icon={<PlusOutlined />}
          permission="system:dict:save"
          permissions={permissions}
          onClick={() => {
            setTypeEditing(undefined);
            setTypeOpen(true);
          }}
        >
          {intl.formatMessage({ id: 'dicts.create' })}
        </AuthButton>
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(320px, 38%) minmax(520px, 1fr)',
          gap: 16,
          alignItems: 'start',
        }}
      >
        <div
          ref={typeScrollRef}
          style={{
            position: 'sticky',
            top: 56,
            maxHeight: 'calc(100vh - 96px)',
            overflowY: 'auto',
            overflowX: 'hidden',
          }}
        >
          <Table<DictType>
            sticky={{ offsetHeader: 0, getContainer: () => typeScrollRef.current ?? window }}
            rowKey="id"
            columns={typeColumns}
            dataSource={types}
            pagination={false}
            rowClassName={(row) => (row.id === selected?.id ? 'ant-table-row-selected' : '')}
            onRow={(row) => {
              const drag = typeDragSort.rowProps(row.id);
              return {
                ...drag,
                onClick: () => setSelected(row),
                style: { cursor: 'pointer', ...drag.style },
              };
            }}
          />
        </div>
        {selected ? (
          /* 左栏字典条数远多于右栏字典项，整页滚动会把右栏滚出视口只剩空白。
             让右栏整体粘在视口内并在自身高度内滚动，右侧内容始终可见可操作。 */
          <div
            ref={itemScrollRef}
            style={{
              position: 'sticky',
              top: 56,
              maxHeight: 'calc(100vh - 96px)',
              overflowY: 'auto',
              overflowX: 'hidden',
            }}
          >
            <div
              style={{
                position: 'sticky',
                top: 0,
                zIndex: 10,
                minHeight: 48,
                paddingBlock: 8,
                background: kaiwuPalette.page,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
              }}
            >
              <div>
                <Typography.Title level={4} style={{ margin: 0 }}>
                  {referencedText(intl, selected.dictNameKey, selected.dictName)}
                </Typography.Title>
                <Typography.Text type="secondary">
                  {scopeId === '0'
                    ? selected.description
                    : selected.inheritGlobal
                      ? intl.formatMessage({ id: 'dicts.inherit' })
                      : intl.formatMessage({ id: 'dicts.independent' })}
                </Typography.Text>
              </div>
              <AuthButton
                icon={<PlusOutlined />}
                permission="system:dict:save"
                permissions={permissions}
                onClick={() => {
                  setItemEditing(undefined);
                  setItemOpen(true);
                }}
              >
                {intl.formatMessage({ id: 'dicts.createItem' })}
              </AuthButton>
            </div>
            <Table<DictItem>
              sticky={{ offsetHeader: 64, getContainer: () => itemScrollRef.current ?? window }}
              rowKey="id"
              columns={itemColumns}
              dataSource={items}
              pagination={false}
              onRow={(row) => itemDragSort.rowProps(row.id)}
            />
          </div>
        ) : (
          <Empty description={intl.formatMessage({ id: 'dicts.selectFirst' })} />
        )}
      </div>

      <ModalForm<Partial<DictType>>
        key={typeEditing?.id ?? `new-type-${typeOpen}`}
        title={intl.formatMessage({ id: typeEditing ? 'dicts.editTitle' : 'dicts.createTitle' })}
        open={typeOpen}
        grid
        rowProps={{ gutter: 16 }}
        width={640}
        initialValues={typeEditing ?? { inheritGlobal: true, status: 'ENABLED' }}
        modalProps={{ destroyOnHidden: true, onCancel: () => setTypeOpen(false) }}
        onFinish={async (values) => {
          try {
            const saved = await saveDictType(scopeId, {
              ...values,
              // 全局作用域不渲染「继承全局」开关，ProForm 不会提交未注册字段，
              // 而后端 inheritGlobal 是 @NotNull；全局字典由后端强制为 false，这里补齐即可。
              inheritGlobal: values.inheritGlobal ?? false,
              id: typeEditing?.id,
            });
            void message.success(intl.formatMessage({ id: 'dicts.saved' }));
            setTypeOpen(false);
            await loadTypes();
            setSelected(saved);
            return true;
          } catch (error) {
            // ProForm 会吞掉 onFinish 的异常，必须在此显式提示，否则表单静默失败。
            void message.error(error instanceof Error ? error.message : String(error));
            return false;
          }
        }}
      >
        {/* 字典名从来没有内联多语言列，固定模式就是单一原文，正好是 LocalizedNameField
            假设的形状，直接复用（字典项标签因为支持逐语言录入才另写 DictLabelField）。 */}
        <LocalizedNameField
          fallbackName="dictName"
          fallbackLabel={intl.formatMessage({ id: 'dicts.name' })}
          fallbackRequired
          keyName="dictNameKey"
        />
        <ProFormText
          colProps={{ span: 12 }}
          name="dictCode"
          label={intl.formatMessage({ id: 'dicts.code' })}
          rules={[
            { required: true },
            {
              pattern: /^[A-Za-z][A-Za-z0-9_.:-]{1,127}$/,
              message: intl.formatMessage({ id: 'dicts.codeRule' }),
            },
          ]}
        />
        {scopeId !== '0' && (
          <ProFormSwitch
            colProps={{ span: 12 }}
            name="inheritGlobal"
            label={intl.formatMessage({ id: 'dicts.inheritGlobal' })}
          />
        )}
        <DictSelect
          colProps={{ span: 12 }}
          name="status"
          label={intl.formatMessage({ id: 'dicts.status' })}
          dictCode="common.status"
          rules={[{ required: true }]}
        />
        <ProFormTextArea
          colProps={{ span: 24 }}
          name="description"
          label={intl.formatMessage({ id: 'dicts.description' })}
        />
      </ModalForm>

      <ModalForm<Partial<DictItem>>
        key={itemEditing?.id ?? `new-item-${itemOpen}`}
        title={intl.formatMessage({
          id: itemEditing ? 'dicts.editItemTitle' : 'dicts.createItemTitle',
        })}
        open={itemOpen}
        grid
        rowProps={{ gutter: 16 }}
        width={640}
        initialValues={
          itemEditing
            ? {
                ...itemEditing,
                localeSelectable: parseExtraJson(itemEditing.extraJson).selectable === true,
                extraEntries: toExtraEntries(itemEditing.extraJson),
              }
            : {
                sortNo: 0,
                defaultItem: false,
                status: 'ENABLED',
                localeSelectable: selected?.dictCode === 'platform.locale',
              }
        }
        modalProps={{ destroyOnHidden: true, onCancel: () => setItemOpen(false) }}
        onFinish={async (values) => {
          try {
            const { localeSelectable, extraEntries, ...rest } = values as Partial<DictItem> & {
              localeSelectable?: boolean;
              extraEntries?: ExtraEntry[];
            };
            // 语言字典的 extraJson 由开关和字典值推导，不走键值对编辑器；
            // 其余字典由键值对拼回 JSON，存储格式与改造前完全一致。
            const extraJson =
              selected?.dictCode === 'platform.locale'
                ? JSON.stringify({
                    ...parseExtraJson(rest.extraJson),
                    selectable: localeSelectable === true,
                    antdLocale: rest.itemValue,
                    dateLocale: rest.itemValue,
                  })
                : fromExtraEntries(extraEntries);
            await saveDictItem(scopeId, selected!.id, {
              ...rest,
              extraJson,
              id: itemEditing?.id,
            });
            void message.success(intl.formatMessage({ id: 'dicts.itemSaved' }));
            setItemOpen(false);
            await loadItems();
            return true;
          } catch (error) {
            // ProForm 会吞掉 onFinish 的异常，必须在此显式提示，否则表单静默失败。
            void message.error(error instanceof Error ? error.message : String(error));
            return false;
          }
        }}
      >
        <DictLabelField />
        <ProFormText
          colProps={{ span: 12 }}
          name="itemValue"
          label={intl.formatMessage({ id: 'dicts.value' })}
          tooltip={
            selected?.dictCode === 'platform.locale'
              ? intl.formatMessage({ id: 'dicts.localeCodeTip' })
              : undefined
          }
          extra={
            selected?.dictCode === 'platform.locale' ? (
              <LocaleCodeHelp fieldName="itemValue" />
            ) : undefined
          }
          rules={[
            { required: true },
            // 语言字典的取值会用于 antd locale、日期格式化与 Accept-Language，
            // 写错会让整套国际化静默错乱，因此在提交前当场拦住并给出可修正的提示。
            ...(selected?.dictCode === 'platform.locale'
              ? [
                  {
                    validator: (_: unknown, value?: string) =>
                      !value || isValidLocaleCode(value)
                        ? Promise.resolve()
                        : Promise.reject(
                            new Error(intl.formatMessage({ id: 'dicts.localeCodeInvalid' })),
                          ),
                  },
                ]
              : []),
          ]}
        />
        <ProFormDigit
          colProps={{ span: 12 }}
          name="sortNo"
          label={intl.formatMessage({ id: 'dicts.sort' })}
          min={0}
          max={9999}
        />
        {/* 两两成对，避免出现「左边有字段、右边空一半」的空洞：
            此前 status(span12) 后面跟 extraJson(span24)，24 格塞不进剩余的 12 格被挤到
            下一行，status 右侧就空了。 */}
        {/* 颜色此前是自由文本，写错只表现为 Tag 掉回灰色，没有任何提示；
            改成受管字典后取值受约束，未知的存量值仍按约定原样显示。 */}
        <DictSelect
          colProps={{ span: 12 }}
          name="color"
          label={intl.formatMessage({ id: 'dicts.displayColor' })}
          dictCode="common.tag_color"
          allowClear
        />
        <DictSelect
          colProps={{ span: 12 }}
          name="status"
          label={intl.formatMessage({ id: 'dicts.status' })}
          dictCode="common.status"
          rules={[{ required: true }]}
        />
        <ProFormSwitch
          colProps={{ span: 12 }}
          name="defaultItem"
          label={intl.formatMessage({ id: 'dicts.defaultItem' })}
        />
        {selected?.dictCode === 'platform.locale' ? (
          <ProFormSwitch
            colProps={{ span: 12 }}
            name="localeSelectable"
            label={intl.formatMessage({
              id: 'dicts.localeSelectable',
              defaultMessage: '覆盖完整后允许用户选择',
            })}
            tooltip={intl.formatMessage({
              id: 'dicts.localeSelectableTip',
              defaultMessage:
                '即使开启，也只有在资源、菜单和字典译文全部补齐后才会出现在语言选择器',
            })}
          />
        ) : (
          // 扩展配置改成键值对增删，用户不必手写 JSON（漏引号、少括号都会被后端拒绝）；
          // 提交时再拼成 JSON 存库，存储格式不变。
          // 仍是少数场景才用的次要配置，折叠起来避免常驻占掉三分之一弹窗高度。
          <div style={{ width: '100%' }}>
            <Collapse
              ghost
              items={[
                {
                  key: 'extraJson',
                  label: intl.formatMessage({ id: 'dicts.extraJson' }),
                  children: <ExtraEntriesField />,
                },
              ]}
            />
          </div>
        )}
      </ModalForm>
    </PageContainer>
  );
}
