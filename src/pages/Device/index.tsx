import { CodeOutlined } from '@ant-design/icons';
import { PageContainer } from '@ant-design/pro-components';
import { useIntl, useSearchParams } from '@umijs/max';
import { Alert, App, Button, Card, Descriptions, Input, Result, Space } from 'antd';
import { useCallback, useEffect, useState } from 'react';
import {
  approveDeviceAuthorization,
  denyDeviceAuthorization,
  queryDeviceAuthorization,
  type DeviceAuthorizationPending,
} from '@/services/device';
import { formatDateTime } from '@/utils/format';

/** 与后端短码格式一致：去掉元音与易混字符的 4+4 位。用户手输时容忍小写和空白。 */
function normalizeCode(raw: string) {
  return raw.trim().toUpperCase();
}

type Outcome = 'approved' | 'denied';

/**
 * CLI 设备授权确认页（ADR 0035）。
 *
 * 命令行打印的链接带 ?code=，页面先展示客户端名称、发起地址与时间，由用户核对后
 * 再允许或拒绝。不自动提交：确认动作必须来自用户本人，防止被诱导授权他人发起的请求。
 */
export default function DevicePage() {
  const intl = useIntl();
  const { message } = App.useApp();
  const [searchParams] = useSearchParams();
  const [code, setCode] = useState('');
  const [pending, setPending] = useState<DeviceAuthorizationPending>();
  const [notFound, setNotFound] = useState(false);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [outcome, setOutcome] = useState<Outcome>();

  const lookup = useCallback(async (value: string) => {
    const normalized = normalizeCode(value);
    if (!normalized) return;
    setLoading(true);
    setNotFound(false);
    setPending(undefined);
    try {
      setPending(await queryDeviceAuthorization(normalized));
    } catch {
      setNotFound(true);
    } finally {
      setLoading(false);
    }
  }, []);

  // 链接里的短码一变就视为新的授权请求：清掉上一次的结果再查询。路由在同一页面内切换时
  // 组件不会重新挂载，不重置的话会继续显示上一次的「已允许」，误导用户以为新请求已处理。
  const linkedCode = normalizeCode(searchParams.get('code') ?? '');
  useEffect(() => {
    setCode(linkedCode);
    setOutcome(undefined);
    setPending(undefined);
    setNotFound(false);
    if (linkedCode) void lookup(linkedCode);
  }, [linkedCode, lookup]);

  const decide = async (approve: boolean) => {
    if (!pending) return;
    setSubmitting(true);
    try {
      if (approve) {
        await approveDeviceAuthorization(pending.userCode);
      } else {
        await denyDeviceAuthorization(pending.userCode);
      }
      setOutcome(approve ? 'approved' : 'denied');
    } catch (reason) {
      void message.error(
        reason instanceof Error ? reason.message : intl.formatMessage({ id: 'device.notFound' }),
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (outcome) {
    return (
      <PageContainer title={intl.formatMessage({ id: 'device.title' })}>
        <Card>
          <Result
            status={outcome === 'approved' ? 'success' : 'info'}
            title={intl.formatMessage({
              id: outcome === 'approved' ? 'device.approved' : 'device.denied',
            })}
          />
        </Card>
      </PageContainer>
    );
  }

  return (
    <PageContainer title={intl.formatMessage({ id: 'device.title' })}>
      <Card style={{ maxWidth: 640 }}>
        <Space direction="vertical" size="large" style={{ width: '100%' }}>
          <Alert type="warning" showIcon message={intl.formatMessage({ id: 'device.intro' })} />
          <Space.Compact style={{ width: '100%' }}>
            <Input
              prefix={<CodeOutlined />}
              aria-label={intl.formatMessage({ id: 'device.codeLabel' })}
              placeholder={intl.formatMessage({ id: 'device.codePlaceholder' })}
              value={code}
              maxLength={16}
              onChange={(event) => setCode(event.target.value)}
              onPressEnter={() => void lookup(code)}
            />
            <Button loading={loading} onClick={() => void lookup(code)}>
              {intl.formatMessage({ id: 'device.lookup' })}
            </Button>
          </Space.Compact>
          {notFound && (
            <Alert type="error" showIcon message={intl.formatMessage({ id: 'device.notFound' })} />
          )}
          {pending && (
            <>
              <Descriptions column={1} bordered size="small">
                <Descriptions.Item label={intl.formatMessage({ id: 'device.codeLabel' })}>
                  {pending.userCode}
                </Descriptions.Item>
                <Descriptions.Item label={intl.formatMessage({ id: 'device.client' })}>
                  {pending.clientName}
                </Descriptions.Item>
                <Descriptions.Item label={intl.formatMessage({ id: 'device.requestIp' })}>
                  {pending.requestIp ?? '-'}
                </Descriptions.Item>
                <Descriptions.Item label={intl.formatMessage({ id: 'device.requestedAt' })}>
                  {formatDateTime(pending.createdAt)}
                </Descriptions.Item>
              </Descriptions>
              <Space>
                <Button type="primary" loading={submitting} onClick={() => void decide(true)}>
                  {intl.formatMessage({ id: 'device.approve' })}
                </Button>
                <Button danger disabled={submitting} onClick={() => void decide(false)}>
                  {intl.formatMessage({ id: 'device.deny' })}
                </Button>
              </Space>
            </>
          )}
        </Space>
      </Card>
    </PageContainer>
  );
}
