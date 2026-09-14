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
  backendPushStatus: string;
  frontendPushStatus: string;
  backendRepositoryUrl?: string;
  frontendRepositoryUrl?: string;
  backendHttpCloneUrl?: string;
  backendSshCloneUrl?: string;
  frontendHttpCloneUrl?: string;
  frontendSshCloneUrl?: string;
  lastError?: string;
  startedAt?: string;
  completedAt?: string;
  createdAt: string;
  updatedAt: string;
};

export function canStartLocalAiCoding(task: ProjectGeneration) {
  return (
    task.backendPushStatus === 'PUSHED' &&
    task.frontendPushStatus === 'PUSHED' &&
    task.backendFiles.includes('scripts/dev.sh') &&
    task.frontendFiles.includes('scripts/dev.sh')
  );
}

export type ProjectGenerationInput = {
  projectId: string;
  generationMode: 'AI_PROJECT' | 'BASIC_SCAFFOLD';
  businessDescription?: string;
  ddl?: string;
};

export type ProjectGenerationRetryInput = {
  businessDescription?: string;
  ddl?: string;
};

export type ProjectGenerationEditableInput = ProjectGenerationRetryInput & {
  taskNo: string;
  projectId: string;
  projectName: string;
  generationMode: 'AI_PROJECT' | 'BASIC_SCAFFOLD';
};

export type MysqlSchemaImportInput = {
  projectId: string;
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
};

export type MysqlSchemaImportResult = {
  database: string;
  tableCount: number;
  columnCount: number;
  ddl: string;
};

export type ProjectGenerationPushInput = {
  groupId?: string;
  backendRepositoryUrl?: string;
  frontendRepositoryUrl?: string;
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

export function importMysqlSchema(input: MysqlSchemaImportInput) {
  return apiRequest<MysqlSchemaImportResult>('/api/project-generations/schema/mysql', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
}

export function pushProjectGeneration(taskNo: string, input: ProjectGenerationPushInput) {
  return apiRequest<ProjectGeneration>(
    `/api/project-generations/${encodeURIComponent(taskNo)}/push`,
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
