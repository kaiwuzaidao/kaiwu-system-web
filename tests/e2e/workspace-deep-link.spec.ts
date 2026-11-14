import { expect, test } from '@playwright/test';
import { applyWorkspaceDeepLink, workspaceDeepLink } from '../../src/utils/workspaceDeepLink';

const projectId = '9223372036854775807';
const configs = [
  {
    key: 'workspace.deep-links',
    valueType: 'JSON',
    sourceScopeId: projectId,
    value: JSON.stringify({
      version: 1,
      routes: [
        { prefix: '/workflow', queryParameters: ['old'] },
        { prefix: '/workflow/tasks', queryParameters: ['taskId', 'tab'] },
      ],
    }),
  },
];
const query = (route: string) => `?route=${encodeURIComponent(route)}`;

test('deep links use the longest registered segment prefix and exact query names', () => {
  for (const route of [
    '/workflow/tasks',
    '/workflow/tasks/abc',
    '/workflow/tasks/abc?taskId=99&tab=history',
  ]) {
    expect(workspaceDeepLink(query(route), projectId, configs)).toBe(route);
  }
  expect(workspaceDeepLink(query('/workflow/tasks-extra'), projectId, configs)).toBe(
    '/workflow/tasks-extra',
  );
  expect(workspaceDeepLink(query('/workflow/tasks?old=1'), projectId, configs)).toBeUndefined();
  const onlyTasks = [
    {
      ...configs[0],
      value: JSON.stringify({
        version: 1,
        routes: [{ prefix: '/workflow/tasks', queryParameters: [] }],
      }),
    },
  ];
  expect(workspaceDeepLink(query('/workflow/tasks-extra'), projectId, onlyTasks)).toBeUndefined();
  expect(workspaceDeepLink(query('/workflow/tasks?tab='), projectId, configs)).toBe(
    '/workflow/tasks?tab=',
  );
});

test('malformed, ambiguous, external and encoded routes fail closed', () => {
  for (const route of [
    'https://external.invalid/path',
    '//external.invalid/path',
    '/workflow//tasks',
    '/workflow/../tasks',
    '/workflow/tasks#fragment',
    '/workflow/tasks\\extra',
    '/workflow/tasks\n',
    '/workflow/任务',
    '/workflow/tasks/%2e%2e',
    '/workflow/tasks?tab=%61',
    '/workflow/tasks?tab=a+b',
    '/workflow/tasks?tab=a&tab=b',
    '/workflow/tasks?unknown=a',
    '/workflow/tasks?tab',
    '/workflow/tasks?tab=a&',
    '/workflow/tasks?',
    '/workflow/tasks??tab=a',
    '/workflow/tasks?tab=a=b',
    '/workflow/tasks?projectId=1',
    '/workflow/tasks?token=credential',
    '/workflow/tasks/' + 'x'.repeat(512),
  ]) {
    expect(workspaceDeepLink(query(route), projectId, configs), route).toBeUndefined();
  }
  for (const search of [
    '?route=%E0%A4%A',
    '?route=%FF',
    '?route=%',
    '?route=%C0%AF',
    '?route=/workflow/tasks&route=/workflow',
    '?route=/workflow/tasks&%72oute=/workflow',
    '?route',
    '?route=',
    '',
  ]) {
    expect(workspaceDeepLink(search, projectId, configs), search).toBeUndefined();
  }
});

test('registry scope and schema are mandatory and target stays within the registered project entry', () => {
  const route = '/workflow/tasks/42?tab=history';
  const target = new URL('https://platform.invalid/apps/example/?projectId=old');
  const resolved = applyWorkspaceDeepLink(
    target,
    workspaceDeepLink(query(route), projectId, configs),
    target.origin,
  );
  expect(resolved.pathname).toBe('/apps/example/workflow/tasks/42');
  expect(resolved.searchParams.get('tab')).toBe('history');
  expect(target.pathname).toBe('/apps/example/');
  const external = new URL('https://registered-external.invalid/entry');
  expect(applyWorkspaceDeepLink(external, route, target.origin).href).toBe(external.href);
  expect(applyWorkspaceDeepLink(target, undefined, target.origin).href).toBe(target.href);
  expect(workspaceDeepLink(query(route), projectId, [])).toBeUndefined();
  expect(workspaceDeepLink(query(route), projectId, [...configs, ...configs])).toBeUndefined();
  expect(
    workspaceDeepLink(query(route), projectId, [{ ...configs[0], sourceScopeId: '0' }]),
  ).toBeUndefined();
  expect(
    workspaceDeepLink(query(route), projectId, [{ ...configs[0], sourceScopeId: '1' }]),
  ).toBeUndefined();
  for (const value of [
    'invalid',
    'null',
    '[]',
    '{}',
    '{"version":0,"routes":[]}',
    '{"version":1,"routes":[{}]}',
    JSON.stringify({ version: 1, routes: [{ prefix: '/workflow/', queryParameters: [] }] }),
    JSON.stringify({ version: 1, routes: [{ prefix: '//workflow', queryParameters: [] }] }),
    JSON.stringify({ version: 1, routes: [{ prefix: '/workflow', queryParameters: ['token'] }] }),
    JSON.stringify({
      version: 1,
      routes: [{ prefix: '/workflow', queryParameters: ['tab', 'tab'] }],
    }),
    JSON.stringify({
      version: 1,
      routes: [
        { prefix: '/workflow', queryParameters: [] },
        { prefix: '/workflow', queryParameters: [] },
      ],
    }),
  ]) {
    expect(
      workspaceDeepLink(query(route), projectId, [{ ...configs[0], value }]),
      value,
    ).toBeUndefined();
  }
});
