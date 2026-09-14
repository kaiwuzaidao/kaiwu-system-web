export const e2e = {
  baseURL: process.env.E2E_BASE_URL ?? 'http://127.0.0.1:8000',
  adminUsername: process.env.E2E_ADMIN_USERNAME ?? 'admin',
  adminPassword: process.env.E2E_ADMIN_PASSWORD,
  allowMutations: process.env.E2E_ALLOW_MUTATIONS === 'true',
  allowGeneration: process.env.E2E_ALLOW_GENERATION === 'true',
};

export const hasAdminCredentials = Boolean(e2e.adminUsername && e2e.adminPassword);

export function requireAdminCredentials() {
  if (!hasAdminCredentials) {
    throw new Error('缺少 E2E_ADMIN_USERNAME 或 E2E_ADMIN_PASSWORD；拒绝跳过受保护功能测试。');
  }
}

export function requireMutationPermission() {
  requireAdminCredentials();
  if (!e2e.allowMutations) {
    throw new Error('缺少 E2E_ALLOW_MUTATIONS=true；拒绝跳过用户、项目和元数据变更测试。');
  }
}

export function requireGenerationPermission() {
  requireMutationPermission();
  if (!e2e.allowGeneration) {
    throw new Error('缺少 E2E_ALLOW_GENERATION=true；拒绝跳过一次性项目生成测试。');
  }
}

export function runSuffix() {
  return `${Date.now()}${Math.floor(Math.random() * 10_000)}`;
}
