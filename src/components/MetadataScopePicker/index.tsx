import { Select, Space, Typography } from 'antd';
import { useEffect, useState } from 'react';
import { useIntl } from '@umijs/max';
import { queryProjects, type PlatformProject } from '@/services/projects';

type MetadataScopePickerProps = {
  value: string;
  onChange: (value: string) => void;
};

export default function MetadataScopePicker({ value, onChange }: MetadataScopePickerProps) {
  const intl = useIntl();
  const [projects, setProjects] = useState<PlatformProject[]>([]);

  useEffect(() => {
    void queryProjects({ current: 1, pageSize: 100 })
      .then((page) => setProjects(page.records))
      .catch(() => setProjects([]));
  }, []);

  return (
    <Space>
      <Typography.Text strong>{intl.formatMessage({ id: 'scope.label' })}</Typography.Text>
      <Select
        value={value}
        style={{ minWidth: 280 }}
        showSearch
        optionFilterProp="label"
        onChange={onChange}
        options={[
          { value: '0', label: intl.formatMessage({ id: 'scope.global' }) },
          ...projects.map((project) => ({
            value: project.id,
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
