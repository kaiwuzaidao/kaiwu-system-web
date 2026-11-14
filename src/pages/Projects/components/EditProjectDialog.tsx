import { ModalForm, ProFormText, ProFormTextArea } from '@ant-design/pro-components';
import { useIntl } from '@umijs/max';
import { App, Typography } from 'antd';
import './EditProjectDialog.less';
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
      serviceUrl?: string;
    }>
      width={880}
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
      modalProps={{
        destroyOnHidden: true,
        onCancel: onClose,
        centered: true,
        className: 'kaiwu-project-edit-dialog',
      }}
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
      <Typography.Title level={5} className="kaiwu-project-edit-heading">
        {intl.formatMessage({ id: 'onboarding.step.project' })}
      </Typography.Title>
      <div className="kaiwu-project-edit-grid">
        <ProFormText
          name="projectName"
          label={intl.formatMessage({ id: 'projects.name' })}
          rules={[{ required: true }]}
        />
        <ProFormText
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
      </div>
      <ProFormTextArea
        name="description"
        fieldProps={{ autoSize: { minRows: 2, maxRows: 4 } }}
        label={intl.formatMessage({ id: 'projects.projectDescription' })}
      />
      <Typography.Title level={5} className="kaiwu-project-edit-heading">
        {intl.formatMessage({ id: 'home.pipeline.deliver' })}
      </Typography.Title>
      <div className="kaiwu-project-edit-grid">
        <ProFormText
          name="gitlabProjectId"
          label={intl.formatMessage({ id: 'projects.gitlabId' })}
          placeholder={intl.formatMessage({ id: 'projects.gitlabIdPlaceholder' })}
        />
        <ProFormText
          name="defaultBranch"
          label={intl.formatMessage({ id: 'projects.defaultBranch' })}
          rules={[{ required: true }]}
        />
      </div>
      <ProFormText
        name="repositoryUrl"
        label={intl.formatMessage({ id: 'projects.legacyRepoUrl' })}
        tooltip={intl.formatMessage({ id: 'projects.legacyRepoTooltip' })}
        placeholder={intl.formatMessage({ id: 'projects.legacyRepoPlaceholder' })}
      />
      <Typography.Title level={5} className="kaiwu-project-edit-heading">
        {intl.formatMessage({ id: 'projects.backend' })}
      </Typography.Title>
      <div className="kaiwu-project-edit-grid">
        <ProFormText name="backendUrl" label={intl.formatMessage({ id: 'projects.backendUrl' })} />
        <ProFormText
          name="backendLabel"
          label={intl.formatMessage({ id: 'projects.backendLabel' })}
        />
      </div>
      <ProFormText
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
