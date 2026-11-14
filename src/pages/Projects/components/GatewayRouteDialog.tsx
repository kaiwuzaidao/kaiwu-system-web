import { useIntl } from '@umijs/max';
import { Alert, App, Button, Empty, Modal, Space, Spin, Typography } from 'antd';
import { useEffect, useState } from 'react';
import { queryGatewayRoutes, type GatewayRoutes, type PlatformProject } from '@/services/projects';

type Props = { project?: PlatformProject; onClose: () => void };
/** 按服务展示各自可审核的 Gateway 片段，不自动发布。 */
export default function GatewayRouteDialog({ project, onClose }: Props) {
  const intl = useIntl();
  const { message } = App.useApp();
  const [loading, setLoading] = useState(false);
  const [fragments, setFragments] = useState<GatewayRoutes['fragments']>([]);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!project) {
      setFragments([]);
      setError('');
      return;
    }
    let active = true;
    setLoading(true);
    queryGatewayRoutes(project.id)
      .then((value) => {
        if (active) {
          setFragments(value.fragments);
          setError('');
        }
      })
      .catch((reason) => {
        if (active) {
          setFragments([]);
          setError(reason instanceof Error ? reason.message : String(reason));
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [project]);
  const copy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      void message.success(intl.formatMessage({ id: 'projects.gatewayRoute.copied' }));
    } catch {
      void message.error(intl.formatMessage({ id: 'projects.gatewayRoute.copyFailed' }));
    }
  };
  return (
    <Modal
      open={!!project}
      title={intl.formatMessage({ id: 'projects.gatewayRoute' })}
      onCancel={onClose}
      footer={null}
      width={720}
    >
      <Spin spinning={loading}>
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 12 }}
          message={intl.formatMessage({ id: 'projects.gatewayRoute.hint' })}
        />
        {error ? (
          <Alert type="error" showIcon message={error} />
        ) : fragments.length === 0 && !loading ? (
          <Empty />
        ) : (
          fragments.map((item) => (
            <div key={item.serviceCode} style={{ marginBottom: 16 }}>
              <Space>
                <Typography.Text strong>{item.serviceCode}</Typography.Text>
                <Button onClick={() => void copy(item.fragment)}>
                  {intl.formatMessage({ id: 'projects.gatewayRoute.copy' })}
                </Button>
              </Space>
              <pre style={{ margin: '8px 0', maxHeight: 360, overflow: 'auto' }}>
                {item.fragment}
              </pre>
            </div>
          ))
        )}
      </Spin>
    </Modal>
  );
}
