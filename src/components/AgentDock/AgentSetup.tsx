import { useState } from 'react';
import { useIntl } from '@umijs/max';
import { Alert, Button, Card, Form, Input, Radio, Typography } from 'antd';
import AgentMark from './AgentMark';
import { saveAiProvider, testAiProvider, type AiProviderConfig } from '@/services/ai';
import { currentUserSnapshot } from '@/services/auth';

/**
 * 常见 OpenAI 兼容服务的默认地址与模型，只用于预填，用户仍可修改。
 * 后端以 baseUrl + "/chat/completions" 调用，因此地址不带结尾斜杠。
 */
const PRESETS = {
  deepseek: { baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat' },
  qwen: { baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'qwen-plus' },
  openai: { baseUrl: 'https://api.openai.com/v1', model: 'gpt-4.1-mini' },
  custom: { baseUrl: '', model: '' },
} as const;
type PresetKey = keyof typeof PRESETS;
const PRESET_KEYS = Object.keys(PRESETS) as PresetKey[];

type SetupValues = { preset: PresetKey; baseUrl: string; model: string; apiKey?: string };

/** 有密钥（或无鉴权模型已测通）才算可用，与工作台待办的判断保持一致。 */
export function aiNeedsSetup(config: AiProviderConfig) {
  return !config.apiKeyConfigured && config.lastTestStatus !== 'SUCCESS';
}

/**
 * 首次使用：在对话里接入大模型。
 *
 * <p>这是确定性表单，不经过模型——此时还没有可用模型。API Key 只存在于受控表单，
 * 直接提交给已有的 /api/ai/provider 加密保存，不进入聊天记录或任何提示词
 * （ADR 0030：机密输入只在受控表单填写，模型不接触明文）。</p>
 */
export default function AgentSetup({ onReady }: { onReady: (model: string) => void }) {
  const intl = useIntl();
  const t = (id: string, values?: Record<string, string>) => intl.formatMessage({ id }, values);
  const permissions = currentUserSnapshot()?.permissions ?? [];
  const canSave = permissions.includes('system:ai:save');
  const canTest = permissions.includes('system:ai:test');
  const [form] = Form.useForm<SetupValues>();
  const preset = Form.useWatch('preset', form);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const submit = async (values: SetupValues) => {
    setBusy(true);
    setError(undefined);
    const model = values.model.trim();
    try {
      await saveAiProvider({
        providerName:
          values.preset === 'custom'
            ? 'OpenAI Compatible'
            : t(`agent.setup.preset.${values.preset}`),
        baseUrl: values.baseUrl.trim().replace(/\/+$/, ''),
        apiKey: values.apiKey?.trim() || undefined,
        model,
        temperature: 0.2,
        timeoutSeconds: 60,
      });
      // 已加密落库，表单里不再保留明文。
      form.setFieldValue('apiKey', undefined);
      if (!canTest) {
        onReady(model);
        return;
      }
      const result = await testAiProvider();
      if (result.success) onReady(result.model || model);
      else setError(t('agent.setup.testFailed', { reason: result.message }));
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : t('agent.chat.failed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="agent-dock-turn">
      <div className="agent-dock-reply">
        <AgentMark size={28} />
        <div className="agent-dock-reply-body">
          <Typography.Paragraph className="agent-dock-answer">
            {t('agent.setup.greeting')}
          </Typography.Paragraph>
          {canSave ? (
            <Card size="small" title={t('agent.setup.title')} className="agent-dock-setup">
              <Typography.Paragraph type="secondary" className="agent-dock-setup-hint">
                {t('agent.setup.hint')}
              </Typography.Paragraph>
              {error && (
                <Alert type="error" showIcon message={error} style={{ marginBottom: 16 }} />
              )}
              <Form<SetupValues>
                form={form}
                layout="vertical"
                disabled={busy}
                initialValues={{ preset: 'deepseek', ...PRESETS.deepseek }}
                onValuesChange={(changed: Partial<SetupValues>) => {
                  if (changed.preset) form.setFieldsValue(PRESETS[changed.preset]);
                }}
                onFinish={(values) => void submit(values)}
              >
                <Form.Item name="preset" label={t('agent.setup.preset')}>
                  <Radio.Group
                    optionType="button"
                    options={PRESET_KEYS.map((key) => ({
                      value: key,
                      label: t(`agent.setup.preset.${key}`),
                    }))}
                  />
                </Form.Item>
                <Form.Item
                  name="baseUrl"
                  label={t('ai.baseUrl')}
                  rules={[{ required: true }, { type: 'url', message: t('ai.urlRule') }]}
                >
                  <Input placeholder={t('ai.baseUrlPlaceholder')} />
                </Form.Item>
                <Form.Item name="model" label={t('ai.model')} rules={[{ required: true }]}>
                  <Input placeholder={t('ai.modelPlaceholder')} />
                </Form.Item>
                <Form.Item
                  name="apiKey"
                  label={t('ai.apiKeyPlain')}
                  // 公共云服务必须有密钥；自定义可能是无鉴权的内网模型。
                  rules={[{ required: preset !== 'custom', whitespace: true }]}
                >
                  <Input.Password autoComplete="new-password" />
                </Form.Item>
                <Button type="primary" htmlType="submit" loading={busy}>
                  {t('agent.setup.submit')}
                </Button>
              </Form>
            </Card>
          ) : (
            <Alert type="warning" showIcon message={t('agent.setup.noPermission')} />
          )}
        </div>
      </div>
    </div>
  );
}
