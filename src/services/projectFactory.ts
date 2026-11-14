import { apiRequest, downloadApiFile } from '@/services/auth';

export type ProjectGeneration = {
  taskNo: string;
  projectId: string;
  projectCode: string;
  projectName: string;
  generationMode: string;
  status: string;
  aiModel?: string;
  designSummary?: string;
  templateVersion: string;
  backendFiles: string[];
  frontendFiles: string[];
  lastError?: string;
  startedAt?: string;
  completedAt?: string;
  createdAt: string;
  updatedAt: string;
};

/** 新建任务只接受确定性脚手架（ADR 0038）；AI_PROJECT 已下线，仅作为历史任务的取值保留。 */
export type ProjectGenerationInput = {
  projectId: string;
  generationMode: 'BASIC_SCAFFOLD';
};

export type ProjectGenerationRetryInput = {
  businessDescription?: string;
  ddl?: string;
};

export type ProjectGenerationEditableInput = ProjectGenerationRetryInput & {
  taskNo: string;
  projectId: string;
  projectName: string;
  generationMode: 'AI_PROJECT' | 'BASIC_SCAFFOLD' | 'DDL_SCAFFOLD';
};

export function queryProjectGenerations(projectId?: string) {
  const query = projectId ? `?projectId=${encodeURIComponent(projectId)}` : '';
  return apiRequest<ProjectGeneration[]>(`/api/project-generations${query}`);
}

export function createProjectGeneration(input: ProjectGenerationInput) {
  return apiRequest<ProjectGeneration>('/api/project-generations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
}

export function queryProjectGenerationInput(taskNo: string) {
  return apiRequest<ProjectGenerationEditableInput>(
    `/api/project-generations/${encodeURIComponent(taskNo)}/input`,
  );
}

export function retryProjectGeneration(taskNo: string, input: ProjectGenerationRetryInput) {
  return apiRequest<ProjectGeneration>(
    `/api/project-generations/${encodeURIComponent(taskNo)}/retry`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    },
  );
}

export function downloadProjectArtifact(task: ProjectGeneration, type: 'BACKEND' | 'FRONTEND') {
  const suffix = type === 'BACKEND' ? 'service' : 'web';
  return downloadApiFile(
    `/api/project-generations/${encodeURIComponent(task.taskNo)}/download/${type}`,
    `kaiwu-${task.projectCode}-${suffix}.zip`,
  );
}
