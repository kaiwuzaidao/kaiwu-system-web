import { useEffect, useRef, useState } from 'react';
import { useIntl } from '@umijs/max';
import {
  Alert,
  Button,
  Card,
  Col,
  DatePicker,
  Form,
  Input,
  InputNumber,
  Select,
  Row,
  Space,
} from 'antd';
import dayjs from 'dayjs';
import { useDict } from '@/hooks/useDict';
import AuthButton from '@/components/AuthButton';
import { currentUserSnapshot } from '@/services/auth';
import type { AgentInputForm } from '@/services/agent';
import { queryCurrentProjects } from '@/services/projects';

/** Dictionary labels never expand the capability's approved candidate values. */
function EnumControl({
  dictCode,
  projectId,
  values,
  ...props
}: {
  dictCode: string;
  projectId?: string;
  values: string[];
  value?: string;
  onChange?: (value: string) => void;
}) {
  const { options, loading } = useDict(dictCode, projectId);
  return (
    <Select
      {...props}
      allowClear
      loading={loading}
      options={values.map((value) => ({
        value,
        label: options.find((option) => option.value === value)?.label ?? value,
      }))}
    />
  );
}

/** Only trusted form definitions are rendered. Model text never controls fields or endpoints. */
export default function InputCard({
  request,
  disabled,
  onSubmit,
}: {
  request: AgentInputForm;
  disabled: boolean;
  onSubmit: (input: AgentInputForm) => Promise<void>;
}) {
  const intl = useIntl();
  const t = (key: string) => intl.formatMessage({ id: `agent.input.${key}` });
  const [form] = Form.useForm<Record<string, string | number | boolean | string[]>>();
  const [busy, setBusy] = useState(false);
  const [cancelled, setCancelled] = useState(false);
  const [error, setError] = useState<string>();
  const locked = useRef(false);
  const { options: booleanOptions } = useDict('common.boolean_enabled');
  const definition = request.definition;
  const [projectId, setProjectId] = useState<string>();
  const [projectLookupDone, setProjectLookupDone] = useState(false);
  useEffect(() => {
    let active = true;
    setProjectId(undefined);
    setProjectLookupDone(false);
    if (definition?.projectCode && definition.projectCode !== 'system') {
      void queryCurrentProjects()
        .then((projects) => {
          if (active) {
            setProjectId(
              projects.find((project) => project.projectCode === definition.projectCode)?.id,
            );
            setProjectLookupDone(true);
          }
        })
        .catch(() => {
          if (active) setProjectLookupDone(true);
        });
    }
    return () => {
      active = false;
    };
  }, [definition?.projectCode]);
  // Historic cards have no descriptor and must be regenerated, never guessed from text.
  if (!definition)
    return <Alert type="info" message={intl.formatMessage({ id: 'agent.action.expiredHint' })} />;
  if (cancelled) return <Alert type="info" message={t('cancelled')} />;
  const permissions = currentUserSnapshot()?.permissions ?? [];
  // Project permission was checked by System against the target project. A platform
  // permission snapshot must never be mistaken for a project permission snapshot.
  // Submission and confirmation still recheck the real business permission server-side.
  const submitPermission =
    definition.projectCode && definition.projectCode !== 'system'
      ? 'system:agent:ask'
      : definition.permission;
  const allowed = permissions.includes(submitPermission);
  const fields = definition.fields;
  const formats = {
    text: undefined,
    slug: { pattern: /^[a-z][a-z0-9-]{1,63}$/, message: t('projectCodeInvalid') },
    javaPackage: {
      pattern: /^$|^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/,
      message: t('packageNameInvalid'),
    },
  };
  return (
    <Card
      title={definition.title ?? intl.formatMessage({ id: definition.titleKey })}
      style={{ marginBlock: 12, maxWidth: 900 }}
    >
      <Space direction="vertical" size={16} style={{ width: '100%' }}>
        {!definition.projectCode && <Alert type="info" showIcon message={t('hint')} />}
        {!allowed && <Alert type="error" showIcon message={t('denied')} />}
        {error && <Alert type="error" showIcon message={error} />}
        <Form
          form={form}
          layout="vertical"
          initialValues={{
            ...Object.fromEntries(
              fields
                .filter((field) => field.type === 'STRING_LIST' && field.min === 0)
                .map((field) => [field.name, []]),
            ),
            ...Object.fromEntries(
              Object.entries(request.values).map(([name, value]) => [
                name,
                fields.find((field) => field.name === name)?.type === 'BOOL'
                  ? String(value)
                  : value,
              ]),
            ),
          }}
          disabled={busy || disabled || !allowed}
          onFinish={async (values) => {
            if (locked.current || disabled || !allowed) return;
            locked.current = true;
            setBusy(true);
            setError(undefined);
            try {
              const cleaned = Object.fromEntries(
                Object.entries(values)
                  .filter(
                    ([, value]) =>
                      value != null && (typeof value !== 'string' || value.trim() !== ''),
                  )
                  .map(([key, value]) => [
                    key,
                    fields.find((field) => field.name === key)?.type === 'BOOL'
                      ? value === 'true'
                      : typeof value === 'string'
                        ? value.trim()
                        : value,
                  ]),
              );
              await onSubmit({ capabilityCode: request.capabilityCode, values: cleaned });
            } catch (failure) {
              setError(
                failure instanceof Error
                  ? failure.message
                  : intl.formatMessage({ id: 'common.operationFailed' }),
              );
            } finally {
              locked.current = false;
              setBusy(false);
            }
          }}
        >
          <Row gutter={16}>
            {fields.map((field) => (
              <Col key={field.name} xs={24} sm={field.multiline ? 24 : 12}>
                <Form.Item
                  name={field.name}
                  label={field.label ?? intl.formatMessage({ id: field.labelKey })}
                  getValueProps={
                    field.type === 'DATETIME'
                      ? (value) => ({
                          value:
                            typeof value === 'string' && dayjs(value).isValid()
                              ? dayjs(value)
                              : null,
                        })
                      : undefined
                  }
                  getValueFromEvent={
                    field.type === 'DATETIME'
                      ? (value) => (value ? value.format('YYYY-MM-DDTHH:mm:ss') : undefined)
                      : undefined
                  }
                  rules={[
                    {
                      required:
                        field.required && !(field.type === 'STRING_LIST' && field.min === 0),
                      ...(field.type === 'INT'
                        ? { type: 'integer' as const, min: field.min, max: field.max }
                        : field.type === 'STRING_LIST'
                          ? { type: 'array' as const, min: field.min, max: field.max }
                          : { type: 'string' as const, whitespace: true }),
                      message: t('required'),
                    },
                    ...(field.type === 'STRING_LIST'
                      ? [
                          {
                            validator: async (_: unknown, value: unknown) => {
                              if (value == null && !field.required) return;
                              if (
                                !Array.isArray(value) ||
                                value.some(
                                  (item) =>
                                    typeof item !== 'string' ||
                                    item.trim() !== item ||
                                    !item ||
                                    (field.maxLength != null && item.length > field.maxLength),
                                ) ||
                                new Set(value).size !== value.length
                              ) {
                                throw new Error(t('required'));
                              }
                            },
                          },
                        ]
                      : []),
                    ...(formats[field.format]?.pattern
                      ? [
                          {
                            pattern: formats[field.format]?.pattern,
                            transform: (value: string) => value?.trim(),
                            message: formats[field.format]?.message,
                          },
                        ]
                      : []),
                  ]}
                >
                  {field.type === 'STRING_LIST' ? (
                    <Select mode="tags" open={false} maxTagCount="responsive" />
                  ) : field.type === 'ENUM' ? (
                    definition.projectCode && definition.projectCode !== 'system' && !projectId ? (
                      <Select
                        loading={!projectLookupDone}
                        disabled
                        placeholder={projectLookupDone ? t('denied') : undefined}
                      />
                    ) : (
                      <EnumControl
                        dictCode={field.dictCode!}
                        projectId={projectId}
                        values={field.values ?? []}
                      />
                    )
                  ) : field.type === 'DATETIME' ? (
                    <DatePicker
                      showTime
                      format="YYYY-MM-DD HH:mm:ss"
                      style={{ width: '100%' }}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          event.preventDefault();
                          event.stopPropagation();
                        }
                      }}
                    />
                  ) : field.type === 'BOOL' ? (
                    <Select allowClear options={booleanOptions} />
                  ) : field.type === 'INT' ? (
                    <InputNumber
                      min={field.min}
                      max={field.max}
                      precision={0}
                      step={1}
                      style={{ width: '100%' }}
                    />
                  ) : field.multiline ? (
                    <Input.TextArea maxLength={field.maxLength} showCount rows={3} />
                  ) : (
                    <Input maxLength={field.maxLength} />
                  )}
                </Form.Item>
              </Col>
            ))}
          </Row>
          <Space className="agent-dock-card-actions">
            <AuthButton
              permissions={permissions}
              permission={submitPermission}
              type="primary"
              htmlType="submit"
              loading={busy}
            >
              {definition.projectCode ? intl.formatMessage({ id: 'agent.dock.send' }) : t('submit')}
            </AuthButton>
            <Button onClick={() => setCancelled(true)}>{t('cancel')}</Button>
          </Space>
        </Form>
      </Space>
    </Card>
  );
}
