import { expect, test } from '@playwright/test';
import { createAdminApiContext } from './support/auth';
import { requireGenerationPermission, runSuffix } from './support/env';

type Envelope<T> = { code: number; data: T };

test.describe('隔离环境：确定性项目生成验收', () => {
  test.beforeAll(requireGenerationPermission);

  test('基础脚手架生成两个独立制品且重复生成被拒绝', async ({ request }) => {
    test.setTimeout(120_000);
    const suffix = runSuffix();
    const api = await createAdminApiContext(request);
    let projectId: string | undefined;
    try {
      const projectResponse = await api.post('/api/projects', {
        data: {
          projectCode: `e2eg${suffix}`.slice(0, 32),
          projectName: `E2E 生成项目 ${suffix}`,
          packageName: `com.kaiwu.generated${suffix}`,
        },
      });
      const projectEnvelope = (await projectResponse.json()) as Envelope<{ id: string }>;
      expect(projectResponse.ok()).toBeTruthy();
      expect(projectEnvelope.code).toBe(0);
      projectId = projectEnvelope.data.id;

      const generateResponse = await api.post('/api/project-generations', {
        data: { projectId: projectEnvelope.data.id, generationMode: 'BASIC_SCAFFOLD' },
      });
      const generated = (await generateResponse.json()) as Envelope<{ taskNo: string }>;
      expect(generateResponse.ok()).toBeTruthy();
      expect(generated.code).toBe(0);

      let status = 'PENDING';
      for (let attempt = 0; attempt < 24 && ['PENDING', 'RUNNING'].includes(status); attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 2_000));
        const taskResponse = await api.get(`/api/project-generations/${generated.data.taskNo}`);
        const task = (await taskResponse.json()) as Envelope<{ status: string }>;
        status = task.data.status;
      }
      expect(status).toBe('SUCCESS');

      for (const repositoryType of ['BACKEND', 'FRONTEND']) {
        const artifact = await api.get(
          `/api/project-generations/${generated.data.taskNo}/download/${repositoryType}`,
        );
        expect(artifact.ok()).toBeTruthy();
        expect((await artifact.body()).byteLength).toBeGreaterThan(0);
      }

      const duplicate = await api.post('/api/project-generations', {
        data: { projectId: projectEnvelope.data.id, generationMode: 'BASIC_SCAFFOLD' },
      });
      expect(duplicate.ok()).toBeFalsy();
    } finally {
      if (projectId) {
        await api.put(`/api/projects/${projectId}/status`, { data: { status: 'ARCHIVED' } });
      }
    }
  });
});
