import { useIntl } from '@umijs/max';
import { Alert, App, Modal, Spin, Typography } from 'antd';
import { useEffect, useState } from 'react';
import { queryGatewayRoute, type PlatformProject } from '@/services/projects';

type Props = {
  project?: PlatformProject;
  onClose: () => void;
};

/**
 * 展示该项目的 Gateway 显式路由片段，供运维复制进受管配置。
 *
 * <p>不让运维手写这段：metadata 三项是权限事实，漏掉 accessMode 或 projectCode
 * 会让路由被 Gateway 拒绝，而错误信息指向的是路由配置、不是缺了哪一项。</p>
 */
export default function GatewayRouteDialog({ project, onClose }: Props) {
  const intl = useIntl();
  const { message } = App.useApp();
  const [loading, setLoading] = useState(false);
  const [fragment, setFragment] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!project) {
      setFragment('');
      setError('');
      return;
    }
    setLoading(true);
    queryGatewayRoute(project.id)
      .then((value) => {
        setFragment(value);
        setError('');
      })
      .catch((reason) => {
        setFragment('');
        setError(reason instanceof Error ? reason.message : String(reason));
      })
      .finally(() => setLoading(false));
  }, [project]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(fragment);
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
      onOk={() => void copy()}
      okText={intl.formatMessage({ id: 'projects.gatewayRoute.copy' })}
      okButtonProps={{ disabled: !fragment }}
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
        ) : (
          <Typography.Paragraph>
            <pre style={{ margin: 0, maxHeight: 360, overflow: 'auto' }}>{fragment}</pre>
          </Typography.Paragraph>
        )}
      </Spin>
    </Modal>
  );
}
