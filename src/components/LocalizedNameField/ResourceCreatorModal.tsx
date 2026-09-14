import { App, Col, Form, Input, Modal, Row } from 'antd';
import { useEffect, useState } from 'react';
import { useIntl } from '@umijs/max';
import { saveI18nResource, type I18nResource } from '@/services/i18n';
import { queryPlatformDict } from '@/services/metadata';

type LocaleOption = { value: string; label: string };

type ResourceCreatorModalProps = {
  open: boolean;
  defaultText?: string;
  onClose: () => void;
  onCreated: (created: I18nResource) => void;
};

/** 就地创建可复用资源，避免离开当前表单后丢失编辑态。 */
export function ResourceCreatorModal({
  open,
  defaultText,
  onClose,
  onCreated,
}: ResourceCreatorModalProps) {
  const { message } = App.useApp();
  const intl = useIntl();
  const [form] = Form.useForm();
  const [submitting, setSubmitting] = useState(false);
  const [locales, setLocales] = useState<LocaleOption[]>([]);
  const [defaultLocale, setDefaultLocale] = useState<string>();

  useEffect(() => {
    if (!open) return;
    form.setFieldsValue({ defaultText, moduleCode: 'custom' });
    void queryPlatformDict('platform.locale')
      .then((dictionary) => {
        const items = dictionary.items.filter((item) => item.status === 'ENABLED');
        setDefaultLocale(items.find((item) => item.defaultItem)?.itemValue);
        setLocales(
          items.map((item) => ({
            value: item.itemValue,
            label: item.itemLabel,
          })),
        );
      })
      // 语言目录加载失败时仍允许只填写默认文案。
      .catch(() => setLocales([]));
  }, [defaultText, form, open]);

  const translationLocales = locales.filter((item) => item.value !== defaultLocale);

  const handleOk = async () => {
    try {
      const values = await form.validateFields();
      setSubmitting(true);
      const translations = Object.fromEntries(
        Object.entries((values.translations ?? {}) as Record<string, string>)
          .map(([locale, text]) => [locale, text?.trim()] as const)
          .filter(([, text]) => Boolean(text)),
      );
      const created = await saveI18nResource({
        messageKey: values.messageKey?.trim(),
        defaultText: values.defaultText,
        translationsJson: Object.keys(translations).length
          ? JSON.stringify(translations)
          : undefined,
        moduleCode: values.moduleCode?.trim() || 'custom',
        publicVisible: false,
        // 运行期资源不参与平台交付覆盖门禁（ADR 0013 第 5 节）。
        requiredResource: false,
        status: 'ENABLED',
      });
      void message.success(intl.formatMessage({ id: 'localizedName.createDone' }));
      onCreated(created);
      form.resetFields();
    } catch (error) {
      if (error && typeof error === 'object' && 'errorFields' in error) return;
      void message.error(
        error instanceof Error
          ? error.message
          : intl.formatMessage({ id: 'localizedName.createFailed' }),
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      title={intl.formatMessage({ id: 'localizedName.createResource' })}
      width={640}
      confirmLoading={submitting}
      onOk={() => void handleOk()}
      onCancel={() => {
        form.resetFields();
        onClose();
      }}
      destroyOnHidden
    >
      <Form form={form} layout="vertical">
        <Form.Item
          name="messageKey"
          label={intl.formatMessage({ id: 'localizedName.pickKey' })}
          rules={[{ required: true }]}
        >
          <Input placeholder={intl.formatMessage({ id: 'localizedName.createKeyPlaceholder' })} />
        </Form.Item>
        <Form.Item
          name="defaultText"
          label={
            locales.find((item) => item.value === defaultLocale)?.label ??
            intl.formatMessage({ id: 'localizedName.pickDefault' })
          }
          rules={[{ required: true }]}
        >
          <Input.TextArea rows={2} />
        </Form.Item>
        <Row gutter={16}>
          {translationLocales.map((locale) => (
            <Col span={12} key={locale.value}>
              <Form.Item name={['translations', locale.value]} label={locale.label}>
                <Input />
              </Form.Item>
            </Col>
          ))}
        </Row>
        <Form.Item name="moduleCode" label={intl.formatMessage({ id: 'localizedName.pickModule' })}>
          <Input />
        </Form.Item>
      </Form>
    </Modal>
  );
}
