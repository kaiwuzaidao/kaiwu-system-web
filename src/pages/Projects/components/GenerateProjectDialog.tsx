import { ModalForm } from '@ant-design/pro-components';
import { useIntl } from '@umijs/max';
import { Alert, App } from 'antd';
import { createProjectGeneration } from '@/services/projectFactory';
import type { PlatformProject } from '@/services/projects';

type Props = {
  project?: PlatformProject;
  onClose: () => void;
  onQueued: () => Promise<void> | void;
};

export default function GenerateProjectDialog({ project, onClose, onQueued }: Props) {
  const { message } = App.useApp();
  const intl = useIntl();
  return (
    <ModalForm
      key={project?.id ?? 'generate-first-version'}
      title={intl.formatMessage(
        { id: 'projects.generateTitle' },
        { name: project?.projectName ?? '' },
      )}
      open={Boolean(project)}
      width={720}
      modalProps={{ destroyOnHidden: true, onCancel: onClose }}
      submitter={{
        searchConfig: { submitText: intl.formatMessage({ id: 'projects.submitGeneration' }) },
      }}
      onFinish={async () => {
        try {
          if (!project) return false;
          await createProjectGeneration({
            projectId: project.id,
            generationMode: 'BASIC_SCAFFOLD',
          });
          void message.success(intl.formatMessage({ id: 'projects.generationQueued' }));
          onClose();
          await onQueued();
          return true;
        } catch (error) {
          void message.error(error instanceof Error ? error.message : String(error));
          return false;
        }
      }}
    >
      <Alert
        showIcon
        type="info"
        message={intl.formatMessage({ id: 'projects.basicTitle' })}
        description={intl.formatMessage({ id: 'projects.basicDescription' })}
      />
    </ModalForm>
  );
}
