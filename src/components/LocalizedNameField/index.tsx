import { Form, Input, Radio, Typography } from 'antd';
import { useState } from 'react';
import { useIntl } from '@umijs/max';
import type { I18nResource } from '@/services/i18n';
import { ReferencePreview } from './ReferencePreview';
import { ResourceCreatorModal } from './ResourceCreatorModal';
import { ResourcePickerModal } from './ResourcePickerModal';
import { useI18nResources } from './useI18nResources';

export { ResourceCreatorModal } from './ResourceCreatorModal';
export { coveredLocales, ResourcePickerModal } from './ResourcePickerModal';

export type LocalizedNameFieldProps = {
  /** 兜底文案字段名（菜单名 / 配置值） */
  fallbackName: string;
  fallbackLabel: string;
  fallbackRequired?: boolean;
  fallbackPlaceholder?: string;
  /** 兜底文案改用文本域，配置值需要 */
  fallbackTextarea?: boolean;
  /** 引用的国际化资源 key 字段名 */
  keyName: string;
  /** 引用模式下的提示，说明适用范围 */
  hint?: string;
  disabled?: boolean;
};

type Mode = 'fixed' | 'referenced';

/**
 * 「本地化名称」双模式录入 façade（ADR 0013 / 0015）。
 *
 * <p>入口只维护表单协议和交互编排。资源目录、当前语言预览、选择与新建分别由聚焦协作者负责；
 * 对调用方仍表现为一个可空 key + 一个兜底原文字段，不引入第二套多语言真相源。</p>
 */
export default function LocalizedNameField({
  fallbackName,
  fallbackLabel,
  fallbackRequired,
  fallbackPlaceholder,
  fallbackTextarea,
  keyName,
  hint,
  disabled,
}: LocalizedNameFieldProps) {
  const intl = useIntl();
  const form = Form.useFormInstance();
  const currentKey: string | undefined = Form.useWatch(keyName, form);
  const currentFallback: string | undefined = Form.useWatch(fallbackName, form);
  const mode: Mode = currentKey ? 'referenced' : 'fixed';
  const [pickerOpen, setPickerOpen] = useState(false);
  const [creatorOpen, setCreatorOpen] = useState(false);
  const { resources, resourcesLoaded, loadResources, translations } = useI18nResources(currentKey);

  const applyResource = (resource: I18nResource) => {
    form.setFieldsValue({
      [keyName]: resource.messageKey,
      // 兜底原文必须随引用同步，保证资源缺译文时仍显示同一含义。
      [fallbackName]: resource.defaultText,
    });
  };

  const switchMode = async (next: Mode) => {
    if (next === mode) return;
    if (next === 'referenced') {
      if (!resourcesLoaded) await loadResources();
      setPickerOpen(true);
      return;
    }
    // 切回独立填写只清空 key，保留原文供继续编辑。
    form.setFieldValue(keyName, undefined);
  };

  const fallbackFieldRules = fallbackRequired
    ? [{ required: true, message: intl.formatMessage({ id: 'localizedName.fallbackRequired' }) }]
    : undefined;

  return (
    <>
      <Form.Item name={keyName} hidden>
        <Input />
      </Form.Item>
      <div style={{ width: '100%', marginBottom: 24 }}>
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
            {fallbackRequired && (
              <Typography.Text type="danger" style={{ marginRight: 4 }}>
                *
              </Typography.Text>
            )}
            {fallbackLabel}
          </span>
          <Radio.Group
            value={mode}
            onChange={(event) => void switchMode(event.target.value as Mode)}
            disabled={disabled}
          >
            <Radio value="fixed">{intl.formatMessage({ id: 'localizedName.modeFixed' })}</Radio>
            <Radio value="referenced">
              {intl.formatMessage({ id: 'localizedName.modeReferenced' })}
            </Radio>
          </Radio.Group>
        </div>

        {mode === 'fixed' ? (
          <Form.Item name={fallbackName} rules={fallbackFieldRules} style={{ marginBottom: 0 }}>
            {fallbackTextarea ? (
              <Input.TextArea rows={4} placeholder={fallbackPlaceholder} disabled={disabled} />
            ) : (
              <Input placeholder={fallbackPlaceholder} disabled={disabled} />
            )}
          </Form.Item>
        ) : (
          <>
            <Form.Item name={fallbackName} noStyle rules={fallbackFieldRules}>
              <Input type="hidden" />
            </Form.Item>
            <ReferencePreview
              currentKey={currentKey}
              currentFallback={currentFallback}
              translations={translations}
              disabled={disabled}
              onChange={() => setPickerOpen(true)}
              onCreate={() => setCreatorOpen(true)}
            />
          </>
        )}
        {hint && (
          <Typography.Text type="secondary" style={{ display: 'block', marginTop: 4 }}>
            {hint}
          </Typography.Text>
        )}
      </div>

      <ResourcePickerModal
        open={pickerOpen}
        resources={resources}
        onClose={() => {
          setPickerOpen(false);
          if (!currentKey) form.setFieldValue(keyName, undefined);
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
        defaultText={currentFallback}
        onClose={() => setCreatorOpen(false)}
        onCreated={async (created) => {
          await loadResources(true);
          applyResource(created);
          setCreatorOpen(false);
        }}
      />
    </>
  );
}
