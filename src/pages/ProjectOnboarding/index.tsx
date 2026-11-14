import {
  CheckCircleOutlined,
  CloseOutlined,
  DeploymentUnitOutlined,
  FileTextOutlined,
  ProjectOutlined,
  SafetyCertificateOutlined,
  TeamOutlined,
} from '@ant-design/icons';
import { history, useIntl } from '@umijs/max';
import { PageContainer, ProCard } from '@ant-design/pro-components';
import {
  Alert,
  App,
  Button,
  Col,
  Form,
  Input,
  Popconfirm,
  Result,
  Row,
  Select,
  Space,
  Steps,
  Typography,
} from 'antd';
import { useEffect, useMemo, useState } from 'react';
import { currentUserSnapshot } from '@/services/auth';
import {
  createProjectGeneration,
  queryProjectGenerations,
  type ProjectGeneration,
} from '@/services/projectFactory';
import {
  createProject,
  createProjectRole,
  queryProjectRoles,
  queryProjects,
  saveProjectMember,
  type PlatformProject,
} from '@/services/projects';
import { queryUsers, type PlatformUser } from '@/services/users';

type WizardValues = {
  projectCode: string;
  projectName: string;
  packageName: string;
  description?: string;
  memberIds?: string[];
};

/**
 * 从 AI 助手「继续生成第一版」跳转而来时的预填值。
 *
 * <p>项目已在聊天里登记，这里只负责生成。四个字段必须与已登记项目完全一致，
 * 提交时才会被识别为「本人未完成的项目」并从中断处续做，因此预填后锁定不可改。</p>
 */
function readAgentPrefill(): Partial<WizardValues> | undefined {
  const params = new URLSearchParams(window.location.search);
  const projectCode = params.get('projectCode');
  const projectName = params.get('projectName');
  if (params.get('from') !== 'agent' || !projectCode || !projectName) return undefined;
  return {
    projectCode,
    projectName,
    packageName: params.get('packageName') ?? undefined,
    description: params.get('description') ?? undefined,
  };
}

function sameOptionalText(left?: string, right?: string) {
  return (left ?? '').trim() === (right ?? '').trim();
}

function matchesUnfinishedProject(
  candidate: PlatformProject,
  values: WizardValues,
  currentUserId?: string,
) {
  return Boolean(
    currentUserId &&
    candidate.createdBy === currentUserId &&
    candidate.status === 'ACTIVE' &&
    candidate.projectCode === values.projectCode.trim() &&
    candidate.projectName === values.projectName.trim() &&
    candidate.packageName === values.packageName.trim() &&
    sameOptionalText(candidate.description, values.description),
  );
}

export default function ProjectOnboardingPage() {
  const { message } = App.useApp();
  const intl = useIntl();
  const [form] = Form.useForm<WizardValues>();
  const [agentPrefill] = useState(readAgentPrefill);
  const [step, setStep] = useState(0);
  const [users, setUsers] = useState<PlatformUser[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [project, setProject] = useState<PlatformProject>();
  const [generation, setGeneration] = useState<ProjectGeneration>();
  const currentUser = currentUserSnapshot();
  const permissions = currentUser?.permissions ?? [];
  const canGenerate = permissions.includes('system:project-factory:generate');

  useEffect(() => {
    if (permissions.includes('system:user:list')) {
      void queryUsers({ current: 1, pageSize: 100 }).then((page) => {
        setUsers(page.records.filter((user) => user.id !== currentUser?.id));
      });
    }
  }, []);

  const steps = useMemo(
    () => [
      { title: intl.formatMessage({ id: 'onboarding.step.project' }), icon: <ProjectOutlined /> },
      { title: intl.formatMessage({ id: 'onboarding.step.members' }), icon: <TeamOutlined /> },
      {
        title: intl.formatMessage({ id: 'onboarding.step.generation' }),
        icon: <DeploymentUnitOutlined />,
      },
      {
        title: intl.formatMessage({ id: 'onboarding.step.confirm' }),
        icon: <CheckCircleOutlined />,
      },
    ],
    [intl],
  );

  const next = async () => {
    const fields: Array<Array<keyof WizardValues>> = [
      ['projectCode', 'projectName', 'packageName', 'description'],
      ['memberIds'],
      [],
    ];
    await form.validateFields(fields[step] ?? []);
    setStep((value) => Math.min(value + 1, 3));
  };

  const submit = async () => {
    const values = await form.validateFields();
    setSubmitting(true);
    let targetProject = project;
    try {
      if (!targetProject) {
        try {
          targetProject = await createProject({
            projectCode: values.projectCode.trim(),
            projectName: values.projectName.trim(),
            packageName: values.packageName.trim(),
            description: values.description?.trim() || undefined,
          });
        } catch (reason) {
          const detail = reason instanceof Error ? reason.message : '';
          if (!detail.includes('项目编码已存在')) throw reason;

          const existingPage = await queryProjects({
            current: 1,
            pageSize: 100,
            keyword: values.projectCode.trim(),
          });
          targetProject = existingPage.records.find((candidate) =>
            matchesUnfinishedProject(candidate, values, currentUser?.id),
          );
          if (!targetProject) throw reason;
          void message.info(intl.formatMessage({ id: 'onboarding.resume.info' }));
        }
        setProject(targetProject);
      }

      const memberIds = (values.memberIds ?? []).filter((userId) => userId !== currentUser?.id);
      if (memberIds.length) {
        const roles = await queryProjectRoles(targetProject.id);
        const role =
          roles.find((candidate) => candidate.roleCode === 'project-member') ??
          (await createProjectRole(targetProject.id, {
            roleCode: 'project-member',
            roleName: '项目成员',
            // i18n-ignore-next-line -- 持久化的内置角色事实，不随查看者语言改变。
            description: '由项目开通向导创建的基础成员角色',
          }));
        for (const userId of memberIds) {
          await saveProjectMember(targetProject.id, userId, {
            roleIds: [role.id],
            status: 'ACTIVE',
          });
        }
      }

      const existingTasks = await queryProjectGenerations(targetProject.id);
      const task =
        existingTasks[0] ??
        (await createProjectGeneration({
          projectId: targetProject.id,
          generationMode: 'BASIC_SCAFFOLD',
        }));
      setGeneration(task);
      void message.success(
        existingTasks.length
          ? intl.formatMessage({ id: 'onboarding.success.restored' })
          : intl.formatMessage({ id: 'onboarding.success.created' }),
      );
    } catch (reason) {
      const detail =
        reason instanceof Error
          ? reason.message
          : intl.formatMessage({ id: 'onboarding.failure.default' });
      if (targetProject) {
        void message.error(intl.formatMessage({ id: 'onboarding.failure.preserved' }, { detail }));
      } else {
        void message.error(detail);
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (generation) {
    return (
      <PageContainer>
        <Result
          status="success"
          title={intl.formatMessage({ id: 'onboarding.result.title' })}
          subTitle={intl.formatMessage(
            { id: 'onboarding.result.subtitle' },
            { project: project?.projectName ?? '', taskNo: generation.taskNo },
          )}
          extra={[
            <Button key="factory" type="primary" onClick={() => history.push('/project-factory')}>
              {intl.formatMessage({ id: 'onboarding.result.factory' })}
            </Button>,
            <Button key="project" onClick={() => history.push('/projects')}>
              {intl.formatMessage({ id: 'onboarding.result.projects' })}
            </Button>,
          ]}
        />
      </PageContainer>
    );
  }

  return (
    <PageContainer
      title={intl.formatMessage({ id: 'onboarding.title' })}
      subTitle={intl.formatMessage({ id: 'onboarding.subtitle' })}
      style={{ maxWidth: 1100, margin: '0 auto' }}
      // 本页从项目管理进入，且不在导航菜单中，必须自带退出口，否则只能靠浏览器后退。
      extra={[
        <Popconfirm
          key="exit"
          title={intl.formatMessage({ id: 'onboarding.exit.title' })}
          description={
            project
              ? intl.formatMessage({ id: 'onboarding.exit.created' })
              : intl.formatMessage({ id: 'onboarding.exit.unsubmitted' })
          }
          okText={intl.formatMessage({ id: 'onboarding.exit.confirm' })}
          cancelText={intl.formatMessage({ id: 'onboarding.exit.cancel' })}
          onConfirm={() => history.push('/projects')}
        >
          <Button icon={<CloseOutlined />}>
            {intl.formatMessage({ id: 'onboarding.exit.button' })}
          </Button>
        </Popconfirm>,
      ]}
    >
      {!canGenerate && (
        <Alert
          type="warning"
          showIcon
          message={intl.formatMessage({ id: 'onboarding.permission.warning' })}
          style={{ marginBottom: 16 }}
        />
      )}
      <ProCard bordered>
        <Steps current={step} items={steps} style={{ maxWidth: 860, margin: '0 auto 32px' }} />
        <Form<WizardValues>
          form={form}
          layout="vertical"
          style={{ maxWidth: 860, margin: '0 auto' }}
          initialValues={{
            packageName: 'com.kaiwu.app',
            memberIds: [],
            ...agentPrefill,
          }}
        >
          <div style={{ display: step === 0 ? 'block' : 'none' }}>
            <Alert
              type="info"
              showIcon
              message={intl.formatMessage({ id: 'onboarding.boundary.title' })}
              description={intl.formatMessage({ id: 'onboarding.boundary.description' })}
              style={{ marginBottom: 16 }}
            />
            <Row gutter={16}>
              <Col xs={24} md={12}>
                <Form.Item
                  name="projectCode"
                  label={intl.formatMessage({ id: 'onboarding.projectCode' })}
                  rules={[
                    { required: true },
                    {
                      pattern: /^[a-z][a-z0-9-]{1,63}$/,
                      message: intl.formatMessage({ id: 'onboarding.projectCode.rule' }),
                    },
                  ]}
                >
                  <Input
                    disabled={!!agentPrefill}
                    placeholder={intl.formatMessage({ id: 'onboarding.projectCode.placeholder' })}
                  />
                </Form.Item>
              </Col>
              <Col xs={24} md={12}>
                <Form.Item
                  name="projectName"
                  label={intl.formatMessage({ id: 'onboarding.projectName' })}
                  rules={[{ required: true, max: 100 }]}
                >
                  <Input
                    disabled={!!agentPrefill}
                    placeholder={intl.formatMessage({ id: 'onboarding.projectName.placeholder' })}
                  />
                </Form.Item>
              </Col>
            </Row>
            <Form.Item
              name="packageName"
              label={intl.formatMessage({ id: 'onboarding.packageName' })}
              rules={[{ required: true, pattern: /^[a-z][a-z0-9_.]+$/ }]}
              extra={intl.formatMessage({ id: 'onboarding.packageName.extra' })}
            >
              <Input
                disabled={!!agentPrefill}
                placeholder={intl.formatMessage({ id: 'onboarding.packageName.placeholder' })}
              />
            </Form.Item>
            <Form.Item
              name="description"
              label={intl.formatMessage({ id: 'onboarding.description' })}
            >
              <Input.TextArea
                disabled={!!agentPrefill}
                rows={3}
                maxLength={500}
                showCount
                placeholder={intl.formatMessage({ id: 'onboarding.description.placeholder' })}
              />
            </Form.Item>
          </div>
          <div style={{ display: step === 1 ? 'block' : 'none' }}>
            <Typography.Paragraph type="secondary">
              {intl.formatMessage({ id: 'onboarding.members.description' })}
            </Typography.Paragraph>
            <Form.Item
              name="memberIds"
              label={intl.formatMessage({ id: 'onboarding.members.label' })}
            >
              <Select
                mode="multiple"
                showSearch
                optionFilterProp="label"
                options={users.map((user) => ({
                  value: user.id,
                  label: intl.formatMessage(
                    { id: 'onboarding.member.option' },
                    { displayName: user.displayName, username: user.username },
                  ),
                }))}
              />
            </Form.Item>
          </div>
          <div style={{ display: step === 2 ? 'block' : 'none' }}>
            <Alert
              type="info"
              showIcon
              icon={<SafetyCertificateOutlined />}
              message={intl.formatMessage({ id: 'onboarding.ai.title' })}
              description={intl.formatMessage({ id: 'onboarding.ai.description' })}
              style={{ marginBottom: 16 }}
            />
          </div>
          <div style={{ display: step === 3 ? 'block' : 'none' }}>
            <Alert
              type="info"
              showIcon
              icon={<FileTextOutlined />}
              message={intl.formatMessage({ id: 'onboarding.confirm.title' })}
              description={intl.formatMessage({ id: 'onboarding.confirm.description' })}
            />
          </div>
        </Form>
        <Space
          style={{
            maxWidth: 860,
            margin: '24px auto 0',
            display: 'flex',
            justifyContent: 'flex-end',
          }}
        >
          {step > 0 && (
            <Button onClick={() => setStep((value) => value - 1)}>
              {intl.formatMessage({ id: 'onboarding.previous' })}
            </Button>
          )}
          {step < 3 ? (
            <Button type="primary" onClick={() => void next()}>
              {intl.formatMessage({ id: 'onboarding.next' })}
            </Button>
          ) : (
            <Button
              type="primary"
              loading={submitting}
              disabled={!canGenerate}
              onClick={() => void submit()}
            >
              {intl.formatMessage({ id: 'onboarding.submit' })}
            </Button>
          )}
        </Space>
      </ProCard>
    </PageContainer>
  );
}
