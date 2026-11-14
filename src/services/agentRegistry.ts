import { apiRequest } from '@/services/auth';

export type AgentRegistration = {
  id: string;
  projectId: string;
  capabilityCode: string;
  description?: string;
  version: string;
  manifestHash: string;
  status: 'PENDING' | 'APPROVED' | 'REVOKED';
  readOnly: boolean;
  online: boolean;
  lastSeenAt?: string;
};
export type AgentManifestDetail = { registration: AgentRegistration; manifestJson: string };
export type AgentCredential = { projectId: string; credentialId: string; token: string };
const base = (projectId: string) => `/api/projects/${encodeURIComponent(projectId)}/agent`;
export const listAgentCapabilities = (projectId: string) =>
  apiRequest<AgentRegistration[]>(`${base(projectId)}/capabilities`);
export const getAgentCapability = (projectId: string, code: string) =>
  apiRequest<AgentManifestDetail>(`${base(projectId)}/capabilities/${encodeURIComponent(code)}`);
export const rotateAgentCredential = (projectId: string) =>
  apiRequest<AgentCredential>(`${base(projectId)}/credential`, { method: 'POST' });
export const revokeAgentCredential = (projectId: string) =>
  apiRequest<void>(`${base(projectId)}/credential`, { method: 'DELETE' });
export const reviewAgentCapability = (
  projectId: string,
  registration: AgentRegistration,
  status: AgentRegistration['status'],
) =>
  apiRequest<AgentRegistration>(`${base(projectId)}/capabilities/review`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      revision: {
        capabilityCode: registration.capabilityCode,
        version: registration.version,
        manifestHash: registration.manifestHash,
      },
      status,
    }),
  });

export const reviewAgentCapabilitiesBatch = (
  projectId: string,
  registrations: AgentRegistration[],
) =>
  apiRequest<AgentRegistration[]>(`${base(projectId)}/capabilities/review-batch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      revisions: registrations.map(({ capabilityCode, version, manifestHash }) => ({
        capabilityCode,
        version,
        manifestHash,
      })),
    }),
  });
