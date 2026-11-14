import { Select, Space, Typography } from 'antd';
import { useEffect, useState } from 'react';
import { useIntl } from '@umijs/max';
import { queryCurrentProjects, queryProjects, type PlatformProject } from '@/services/projects';

const projectNameCollator = new Intl.Collator('zh-CN', { numeric: true });

type MetadataScopePickerProps = {
  value: string | undefined;
  onChange: (value: string) => void;
  projects?: PlatformProject[];
  includeGlobal?: boolean;
  placeholder?: string;
  fallbackToCurrentProjects?: boolean;
  isProjectDisabled?: (project: PlatformProject) => boolean;
};

export default function MetadataScopePicker({
  value,
  onChange,
  projects: suppliedProjects,
  includeGlobal = true,
  placeholder,
  fallbackToCurrentProjects = false,
  isProjectDisabled,
}: MetadataScopePickerProps) {
  const intl = useIntl();
  const [projects, setProjects] = useState<PlatformProject[]>([]);

  useEffect(() => {
    if (suppliedProjects) return;
    void queryProjects({ current: 1, pageSize: 100 })
      .then((page) => setProjects(page.records))
      .catch(() => {
        if (!fallbackToCurrentProjects) {
          setProjects([]);
          return;
        }
        void queryCurrentProjects()
          .then((items) =>
            setProjects(items.filter((item) => !item.builtIn && item.status === 'ACTIVE')),
          )
          .catch(() => setProjects([]));
      });
  }, [suppliedProjects, fallbackToCurrentProjects]);

  const sortedProjects = [...(suppliedProjects ?? projects)].sort(
    (a, b) =>
      Number(b.builtIn) - Number(a.builtIn) ||
      projectNameCollator.compare(a.projectName, b.projectName) ||
      projectNameCollator.compare(a.projectCode, b.projectCode) ||
      a.id.localeCompare(b.id),
  );

  return (
    <Space>
      <Typography.Text strong>{intl.formatMessage({ id: 'scope.label' })}</Typography.Text>
      <Select
        value={value}
        placeholder={placeholder}
        style={{ width: 'min(280px, 70vw)' }}
        showSearch
        optionFilterProp="label"
        onChange={onChange}
        options={[
          ...(includeGlobal
            ? [{ value: '0', label: intl.formatMessage({ id: 'scope.global' }) }]
            : []),
          ...sortedProjects.map((project) => ({
            value: project.id,
            disabled: isProjectDisabled?.(project),
            label: intl.formatMessage(
              { id: 'scope.project' },
              { name: project.projectName, code: project.projectCode },
            ),
          })),
        ]}
      />
    </Space>
  );
}
