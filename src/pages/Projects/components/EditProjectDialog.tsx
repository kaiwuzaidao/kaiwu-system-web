import { ModalForm, ProFormText } from '@ant-design/pro-components';
import { useIntl } from '@umijs/max';
import { App } from 'antd';
import { updateProject, type PlatformProject } from '@/services/projects';

type Props = {
  project?: PlatformProject;
  onClose: () => void;
  onSaved: () => void;
};

export default function EditProjectDialog({ project, onClose, onSaved }: Props) {
  const { message } = App.useApp();
  const intl = useIntl();

  return (
    <ModalForm<{
      projectName: string;
      description?: string;
      packageName: string;
      repositoryUrl?: string;
      gitlabProjectId?: string;
      defaultBranch: string;
      backendUrl?: string;
      backendLabel?: string;
    }>
      grid
      rowProps={{ gutter: 16 }}
      width={640}
      key={project?.id ?? 'edit-project'}
      title={intl.formatMessage(
        { id: 'projects.editTitle' },
        {
          suffix: project
            ? intl.formatMessage({ id: 'projects.titleSuffix' }, { name: project.projectName })
            : '',
        },
      )}
      open={Boolean(project)}
      initialValues={project}
      modalProps={{ destroyOnHidden: true, onCancel: onClose }}
      onFinish={async (values) => {
        try {
          if (!project) return false;
          await updateProject(project.id, values);
          void message.success(intl.formatMessage({ id: 'projects.updated' }));
          onClose();
          onSaved();
          return true;
        } catch (error) {
          void message.error(error instanceof Error ? error.message : String(error));
          return false;
        }
      }}
    >
      <ProFormText
        colProps={{ span: 12 }}
        name="projectName"
        label={intl.formatMessage({ id: 'projects.name' })}
        rules={[{ required: true }]}
      />
      <ProFormText
        colProps={{ span: 12 }}
        name="description"
        label={intl.formatMessage({ id: 'projects.projectDescription' })}
      />
      <ProFormText
        colProps={{ span: 12 }}
        name="packageName"
        label={intl.formatMessage({ id: 'projects.package' })}
        rules={[
          { required: true },
          {
            pattern: /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/,
            message: intl.formatMessage({ id: 'projects.packageRule' }),
          },
        ]}
      />
      <ProFormText
        colProps={{ span: 12 }}
        name="repositoryUrl"
        label={intl.formatMessage({ id: 'projects.legacyRepoUrl' })}
        tooltip={intl.formatMessage({ id: 'projects.legacyRepoTooltip' })}
        placeholder={intl.formatMessage({ id: 'projects.legacyRepoPlaceholder' })}
      />
      <ProFormText
        colProps={{ span: 12 }}
        name="gitlabProjectId"
        label={intl.formatMessage({ id: 'projects.gitlabId' })}
        placeholder={intl.formatMessage({ id: 'projects.gitlabIdPlaceholder' })}
      />
      <ProFormText
        colProps={{ span: 12 }}
        name="defaultBranch"
        label={intl.formatMessage({ id: 'projects.defaultBranch' })}
        rules={[{ required: true }]}
      />
      <ProFormText
        colProps={{ span: 12 }}
        name="backendUrl"
        label={intl.formatMessage({ id: 'projects.backendUrl' })}
      />
      <ProFormText
        colProps={{ span: 12 }}
        name="backendLabel"
        label={intl.formatMessage({ id: 'projects.backendLabel' })}
      />
      <ProFormText
        colProps={{ span: 24 }}
        name="serviceUrl"
        label={intl.formatMessage({ id: 'projects.serviceUrl' })}
        tooltip={intl.formatMessage({ id: 'projects.serviceUrlHelp' })}
        rules={[
          {
            pattern: /^$|^(https?|lb):\/\//,
            message: intl.formatMessage({ id: 'projects.serviceUrlHelp' }),
          },
        ]}
      />
    </ModalForm>
  );
}
