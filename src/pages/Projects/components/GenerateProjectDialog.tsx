import { DatabaseOutlined } from '@ant-design/icons';
import {
  ModalForm,
  ProFormDependency,
  ProFormDigit,
  ProFormText,
  ProFormTextArea,
  type ProFormInstance,
} from '@ant-design/pro-components';
import { useIntl } from '@umijs/max';
import { Alert, App, Button } from 'antd';
import { useRef, useState } from 'react';
import DictSelect from '@/components/DictSelect';
import {
  createProjectGeneration,
  importMysqlSchema,
  type MysqlSchemaImportInput,
  type ProjectGenerationInput,
} from '@/services/projectFactory';
import type { PlatformProject } from '@/services/projects';

type Props = {
  project?: PlatformProject;
  onClose: () => void;
  onQueued: () => Promise<void> | void;
};

export default function GenerateProjectDialog({ project, onClose, onQueued }: Props) {
  const { message } = App.useApp();
  const intl = useIntl();
  const [schemaOpen, setSchemaOpen] = useState(false);
  const generateFormRef = useRef<ProFormInstance<ProjectGenerationInput>>();

  return (
    <>
      <ModalForm<ProjectGenerationInput>
        grid
        rowProps={{ gutter: 16 }}
        key={project?.id ?? 'generate-first-version'}
        formRef={generateFormRef}
        title={intl.formatMessage(
          { id: 'projects.generateTitle' },
          { name: project?.projectName ?? '' },
        )}
        open={Boolean(project)}
        width={720}
        initialValues={{ generationMode: 'AI_PROJECT' }}
        modalProps={{ destroyOnHidden: true, onCancel: onClose }}
        submitter={{
          searchConfig: { submitText: intl.formatMessage({ id: 'projects.submitGeneration' }) },
        }}
        onFinish={async (values) => {
          try {
            if (!project) return false;
            await createProjectGeneration({ ...values, projectId: project.id });
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
        <DictSelect
          colProps={{ span: 12 }}
          name="generationMode"
          label={intl.formatMessage({ id: 'projects.generationMode' })}
          width="md"
          dictCode="project.generation.mode"
          rules={[{ required: true }]}
        />
        <ProFormDependency name={['generationMode']}>
          {({ generationMode }) =>
            generationMode === 'AI_PROJECT' ? (
              <>
                <ProFormTextArea
                  colProps={{ span: 24 }}
                  name="businessDescription"
                  label={intl.formatMessage({ id: 'projects.businessDescription' })}
                  fieldProps={{ rows: 6, maxLength: 10000, showCount: true }}
                  placeholder={intl.formatMessage({ id: 'projects.businessPlaceholder' })}
                  rules={[
                    {
                      required: true,
                      message: intl.formatMessage({ id: 'projects.businessRequired' }),
                    },
                  ]}
                />
                <ProFormTextArea
                  colProps={{ span: 24 }}
                  name="ddl"
                  label={intl.formatMessage({ id: 'projects.ddl' })}
                  fieldProps={{
                    rows: 10,
                    style: { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' },
                  }}
                  extra={intl.formatMessage({ id: 'projects.ddlExtra' })}
                />
                <Button
                  icon={<DatabaseOutlined />}
                  style={{ marginTop: 8 }}
                  onClick={() => setSchemaOpen(true)}
                >
                  {intl.formatMessage({ id: 'projects.importSchema' })}
                </Button>
              </>
            ) : (
              <Alert
                showIcon
                type="warning"
                message={intl.formatMessage({ id: 'projects.basicTitle' })}
                description={intl.formatMessage({ id: 'projects.basicDescription' })}
              />
            )
          }
        </ProFormDependency>
      </ModalForm>

      <ModalForm<MysqlSchemaImportInput>
        grid
        rowProps={{ gutter: 16 }}
        width={640}
        title={intl.formatMessage({ id: 'projects.importTitle' })}
        open={schemaOpen}
        onOpenChange={setSchemaOpen}
        initialValues={{ projectId: project?.id, port: 3306 }}
        modalProps={{ destroyOnHidden: true }}
        submitter={{
          searchConfig: { submitText: intl.formatMessage({ id: 'projects.readSchema' }) },
        }}
        onFinish={async (values) => {
          try {
            if (!project) return false;
            const result = await importMysqlSchema({ ...values, projectId: project.id });
            generateFormRef.current?.setFieldValue('ddl', result.ddl);
            void message.success(
              intl.formatMessage(
                { id: 'projects.importedSchema' },
                { tables: result.tableCount, columns: result.columnCount },
              ),
            );
            setSchemaOpen(false);
            return true;
          } catch (error) {
            void message.error(error instanceof Error ? error.message : String(error));
            return false;
          }
        }}
      >
        <Alert
          showIcon
          type="warning"
          style={{ marginBottom: 16 }}
          message={intl.formatMessage({ id: 'projects.passwordOnce' })}
          description={intl.formatMessage({ id: 'projects.schemaSafety' })}
        />
        <ProFormText
          colProps={{ span: 12 }}
          name="host"
          label={intl.formatMessage({ id: 'projects.host' })}
          rules={[{ required: true }]}
          placeholder={intl.formatMessage({ id: 'projects.hostPlaceholder' })}
        />
        <ProFormDigit
          colProps={{ span: 12 }}
          name="port"
          label={intl.formatMessage({ id: 'projects.port' })}
          min={1}
          max={65535}
          fieldProps={{ precision: 0 }}
          rules={[{ required: true }]}
        />
        <ProFormText
          colProps={{ span: 12 }}
          name="database"
          label={intl.formatMessage({ id: 'projects.database' })}
          rules={[{ required: true }]}
        />
        <ProFormText
          colProps={{ span: 12 }}
          name="username"
          label={intl.formatMessage({ id: 'projects.readonlyUser' })}
          rules={[{ required: true }]}
        />
        <ProFormText.Password
          colProps={{ span: 12 }}
          name="password"
          label={intl.formatMessage({ id: 'projects.password' })}
          rules={[{ required: true }]}
        />
      </ModalForm>
    </>
  );
}
