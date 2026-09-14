import { apiRequest } from '@/services/auth';

export type SchedulerJob = {
  id: string;
  projectId: string;
  projectName: string;
  jobName: string;
  taskType: string;
  cronExpression: string;
  zoneId: string;
  payload: string;
  enabled: boolean;
  configVersion: number;
  lastRunTime?: string;
  nextRunTime?: string;
  createdAt: string;
  updatedAt: string;
};

export type SchedulerHandler = {
  projectId: string;
  taskType: string;
  taskName: string;
  lastSeenAt: string;
};

export type SchedulerExecution = {
  id: string;
  jobId: string;
  jobName: string;
  projectId: string;
  projectName: string;
  scheduledAt: string;
  instanceId: string;
  status: string;
  message?: string;
  startedAt?: string;
  completedAt?: string;
};

export type SchedulerCredential = {
  credentialId: string;
  projectId: string;
  token: string;
};

export type SchedulerJobInput = {
  projectId: string;
  jobName: string;
  taskType: string;
  cronExpression: string;
  zoneId: string;
  payload: string;
  enabled: boolean;
};

type PageResult<T> = {
  current: number;
  size: number;
  total: number;
  records: T[];
};

export function querySchedulerJobs(input: {
  projectId?: string;
  current?: number;
  pageSize?: number;
}) {
  const search = new URLSearchParams({
    current: String(input.current ?? 1),
    size: String(input.pageSize ?? 10),
  });
  if (input.projectId) search.set('projectId', input.projectId);
  return apiRequest<PageResult<SchedulerJob>>(`/api/scheduler/jobs?${search.toString()}`);
}

export function querySchedulerHandlers(projectId: string) {
  return apiRequest<SchedulerHandler[]>(
    `/api/scheduler/handlers?projectId=${encodeURIComponent(projectId)}`,
  );
}

export function querySchedulerExecutions(input: {
  projectId?: string;
  current?: number;
  pageSize?: number;
}) {
  const search = new URLSearchParams({
    current: String(input.current ?? 1),
    size: String(input.pageSize ?? 10),
  });
  if (input.projectId) search.set('projectId', input.projectId);
  return apiRequest<PageResult<SchedulerExecution>>(
    `/api/scheduler/executions?${search.toString()}`,
  );
}

export function saveSchedulerJob(input: SchedulerJobInput, id?: string) {
  return apiRequest<SchedulerJob>(
    id ? `/api/scheduler/jobs/${id}` : '/api/scheduler/jobs',
    jsonRequest(id ? 'PUT' : 'POST', input),
  );
}

export function deleteSchedulerJob(id: string) {
  return apiRequest<void>(`/api/scheduler/jobs/${id}`, { method: 'DELETE' });
}

export function rotateSchedulerCredential(projectId: string) {
  return apiRequest<SchedulerCredential>(`/api/scheduler/projects/${projectId}/credential/rotate`, {
    method: 'POST',
  });
}

function jsonRequest(method: string, input: unknown): RequestInit {
  return {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  };
}
