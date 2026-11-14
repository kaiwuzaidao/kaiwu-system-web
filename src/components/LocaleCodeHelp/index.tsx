import { Button, Form, Modal, Space, Table, Typography } from 'antd';
import { useMemo, useState } from 'react';
import { useIntl } from '@umijs/max';

type LocaleCodeHelpProps = {
  /** 「使用」按钮回填的表单字段名；不传则只展示规范、不提供回填。 */
  fieldName?: string;
};

// 常用标签只列平台大概率会接入的语种，语言名称交给 Intl.DisplayNames 按当前界面语言生成，
// 不必为每个语种再维护一条文案。
const COMMON_LOCALES = [
  'zh-CN',
  'zh-TW',
  'zh-HK',
  'en-US',
  'en-GB',
  'ja-JP',
  'ko-KR',
  'fr-FR',
  'de-DE',
  'es-ES',
  'pt-BR',
  'ru-RU',
  'ar-SA',
  'th-TH',
  'vi-VN',
  'id-ID',
];

// 与 isValidLocaleCode 拒绝的几类输入一一对应，让用户对照报错就能找到改法。
const COMMON_MISTAKES = [
  { wrong: 'zh_CN', right: 'zh-CN', reasonKey: 'dicts.localeHelp.reason.underscore' },
  { wrong: 'en-us', right: 'en-US', reasonKey: 'dicts.localeHelp.reason.regionCase' },
  { wrong: 'zh-hans-cn', right: 'zh-Hans-CN', reasonKey: 'dicts.localeHelp.reason.scriptCase' },
  { wrong: 'jp-JP', right: 'ja-JP', reasonKey: 'dicts.localeHelp.reason.language' },
];

const IANA_REGISTRY_URL =
  'https://www.iana.org/assignments/language-subtag-registry/language-subtag-registry';

/**
 * 语言代码输入框旁的「查看 BCP 47 规范」入口。
 *
 * 校验只能告诉用户「不规范」，说不清哪里不规范；弹窗把结构、常用标签和常见错误放在一起，
 * 并允许直接点选常用标签回填，省掉用户去外网查规范再手敲的往返。
 */
export default function LocaleCodeHelp({ fieldName }: LocaleCodeHelpProps) {
  const intl = useIntl();
  const form = Form.useFormInstance();
  const [open, setOpen] = useState(false);

  const displayNames = useMemo(() => {
    try {
      return new Intl.DisplayNames([intl.locale], { type: 'language' });
    } catch {
      return undefined;
    }
  }, [intl.locale]);

  const applyCode = (code: string) => {
    if (!fieldName) return;
    form.setFieldValue(fieldName, code);
    void form.validateFields([fieldName]);
    setOpen(false);
  };

  return (
    <>
      <Button type="link" size="small" style={{ padding: 0 }} onClick={() => setOpen(true)}>
        {intl.formatMessage({ id: 'dicts.localeHelp.open' })}
      </Button>
      <Modal
        open={open}
        title={intl.formatMessage({ id: 'dicts.localeHelp.title' })}
        footer={null}
        width={640}
        onCancel={() => setOpen(false)}
        destroyOnHidden
      >
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          <Typography.Paragraph type="secondary" style={{ margin: 0 }}>
            {intl.formatMessage({ id: 'dicts.localeHelp.intro' })}
          </Typography.Paragraph>

          <div>
            <Typography.Title level={5}>
              {intl.formatMessage({ id: 'dicts.localeHelp.structure' })}
            </Typography.Title>
            <Typography.Paragraph style={{ marginBottom: 8 }}>
              <Typography.Text code>
                {intl.formatMessage({ id: 'dicts.localeHelp.pattern' })}
              </Typography.Text>
            </Typography.Paragraph>
            <ul style={{ margin: 0, paddingInlineStart: 20 }}>
              <li>{intl.formatMessage({ id: 'dicts.localeHelp.part.language' })}</li>
              <li>{intl.formatMessage({ id: 'dicts.localeHelp.part.script' })}</li>
              <li>{intl.formatMessage({ id: 'dicts.localeHelp.part.region' })}</li>
            </ul>
          </div>

          <div>
            <Typography.Title level={5}>
              {intl.formatMessage({ id: 'dicts.localeHelp.common' })}
            </Typography.Title>
            <Table
              size="small"
              rowKey="code"
              pagination={false}
              scroll={{ y: 240 }}
              dataSource={COMMON_LOCALES.map((code) => ({
                code,
                name: displayNames?.of(code) ?? code,
              }))}
              columns={[
                {
                  title: intl.formatMessage({ id: 'dicts.localeHelp.colCode' }),
                  dataIndex: 'code',
                  width: 140,
                  render: (code: string) => (
                    <Typography.Text code copyable>
                      {code}
                    </Typography.Text>
                  ),
                },
                {
                  title: intl.formatMessage({ id: 'dicts.localeHelp.colName' }),
                  dataIndex: 'name',
                },
                ...(fieldName
                  ? [
                      {
                        title: intl.formatMessage({ id: 'dicts.localeHelp.colAction' }),
                        key: 'use',
                        width: 80,
                        render: (_: unknown, row: { code: string }) => (
                          <Button
                            type="link"
                            size="small"
                            style={{ padding: 0 }}
                            onClick={() => applyCode(row.code)}
                          >
                            {intl.formatMessage({ id: 'dicts.localeHelp.use' })}
                          </Button>
                        ),
                      },
                    ]
                  : []),
              ]}
            />
          </div>

          <div>
            <Typography.Title level={5}>
              {intl.formatMessage({ id: 'dicts.localeHelp.mistakes' })}
            </Typography.Title>
            <Table
              size="small"
              rowKey="wrong"
              pagination={false}
              dataSource={COMMON_MISTAKES}
              columns={[
                {
                  title: intl.formatMessage({ id: 'dicts.localeHelp.colWrong' }),
                  dataIndex: 'wrong',
                  width: 120,
                  render: (code: string) => (
                    <Typography.Text delete type="danger">
                      {code}
                    </Typography.Text>
                  ),
                },
                {
                  title: intl.formatMessage({ id: 'dicts.localeHelp.colRight' }),
                  dataIndex: 'right',
                  width: 120,
                  render: (code: string) => <Typography.Text code>{code}</Typography.Text>,
                },
                {
                  title: intl.formatMessage({ id: 'dicts.localeHelp.colReason' }),
                  dataIndex: 'reasonKey',
                  render: (reasonKey: string) => intl.formatMessage({ id: reasonKey }),
                },
              ]}
            />
          </div>

          <Typography.Link href={IANA_REGISTRY_URL} target="_blank" rel="noopener noreferrer">
            {intl.formatMessage({ id: 'dicts.localeHelp.registry' })}
          </Typography.Link>
        </Space>
      </Modal>
    </>
  );
}
