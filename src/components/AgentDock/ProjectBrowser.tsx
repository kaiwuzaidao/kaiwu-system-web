import { useEffect, useState } from 'react';
import { useIntl } from '@umijs/max';
import { Alert, Button, Card, Descriptions, Empty, Input, Pagination, Space, Spin } from 'antd';
import ProjectEntryCard from '@/components/ProjectEntryCard';
import DictTag from '@/components/DictTag';
import { currentUserSnapshot, subscribeSessionChange } from '@/services/auth';
import { queryProjects, type PlatformProject, type ProjectPage } from '@/services/projects';

/** Reuses the authorized project list API; browsing never changes the page or opens a new tab. */
export default function ProjectBrowser({ keyword: initialKeyword = '' }: { keyword?: string }) {
  const intl = useIntl();
  const t = (key: string) => intl.formatMessage({ id: `agent.projects.${key}` });
  const [keyword, setKeyword] = useState(initialKeyword);
  const [search, setSearch] = useState(initialKeyword);
  const [current, setCurrent] = useState(1);
  const [revision, setRevision] = useState(0);
  const [data, setData] = useState<ProjectPage>();
  const [selected, setSelected] = useState<PlatformProject>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [allowed, setAllowed] = useState(() =>
    (currentUserSnapshot()?.permissions ?? []).includes('system:project:list'),
  );
  useEffect(
    () =>
      subscribeSessionChange(() =>
        setAllowed((currentUserSnapshot()?.permissions ?? []).includes('system:project:list')),
      ),
    [],
  );
  useEffect(() => {
    let active = true;
    setData(undefined);
    setSelected(undefined);
    setError(undefined);
    if (!allowed) {
      setLoading(false);
      return;
    }
    setLoading(true);
    void queryProjects({ current, pageSize: 6, keyword: search })
      .then((next) => {
        if (active) setData(next);
      })
      .catch((failure) => {
        if (active) setError(failure instanceof Error ? failure.message : t('failed'));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [allowed, current, search, revision]);
  return (
    <Card title={t('title')} className="agent-dock-card">
      <Space direction="vertical" size={16} style={{ width: '100%' }}>
        {!allowed ? (
          <Alert type="error" showIcon message={intl.formatMessage({ id: 'agent.input.denied' })} />
        ) : (
          <>
            <Space.Compact style={{ width: '100%' }}>
              <Input.Search
                aria-label={t('search')}
                placeholder={t('search')}
                value={keyword}
                onChange={(event) => setKeyword(event.target.value)}
                allowClear
                onSearch={(value) => {
                  setSearch(value.trim());
                  setCurrent(1);
                  setRevision((value) => value + 1);
                }}
              />
              <Button disabled={loading} onClick={() => setRevision((value) => value + 1)}>
                {intl.formatMessage({ id: 'common.refresh' })}
              </Button>
            </Space.Compact>
            {loading && <Spin />}
            {error && <Alert type="error" showIcon message={error} />}
            {!loading && data && (
              <>
                {!data.records.length ? (
                  <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} />
                ) : (
                  <div className="agent-project-list">
                    {data.records.map((project) => (
                      <div key={project.id}>
                        <ProjectEntryCard
                          project={project}
                          showNoEntry={false}
                          onEnter={() => setSelected(project)}
                        />
                      </div>
                    ))}
                  </div>
                )}
                <Pagination
                  current={current}
                  pageSize={6}
                  total={data.total}
                  showSizeChanger={false}
                  onChange={setCurrent}
                />
                {selected && (
                  <Card size="small" title={selected.projectName}>
                    <Descriptions
                      column={1}
                      items={[
                        {
                          key: 'code',
                          label: intl.formatMessage({ id: 'agent.action.projectCode' }),
                          children: selected.projectCode,
                        },
                        {
                          key: 'name',
                          label: intl.formatMessage({ id: 'agent.action.projectName' }),
                          children: selected.projectName,
                        },
                        {
                          key: 'status',
                          label: intl.formatMessage({ id: 'projects.status' }),
                          children: <DictTag dictCode="project.status" value={selected.status} />,
                        },
                        {
                          key: 'description',
                          label: intl.formatMessage({ id: 'agent.action.description' }),
                          children: selected.description || '-',
                        },
                        {
                          key: 'package',
                          label: intl.formatMessage({ id: 'agent.action.packageName' }),
                          children: selected.packageName || '-',
                        },
                      ]}
                    />
                  </Card>
                )}
              </>
            )}
          </>
        )}
      </Space>
    </Card>
  );
}
