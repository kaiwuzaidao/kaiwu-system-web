import { apiRequest } from '@/services/auth';

export type Department = {
  id: string;
  parentId?: string;
  name: string;
  code: string;
  sortNo: number;
  status: 'ENABLED' | 'DISABLED';
  createdAt: string;
  updatedAt: string;
  children: Department[];
};

export type DepartmentInput = {
  id?: string;
  parentId?: string;
  name: string;
  code: string;
  sortNo?: number;
  status?: 'ENABLED' | 'DISABLED';
};

export function queryDepartments() {
  return apiRequest<Department[]>('/api/org/departments');
}

export function saveDepartment(input: DepartmentInput) {
  return apiRequest<Department>('/api/org/departments', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
}

export function deleteDepartment(id: string) {
  return apiRequest<void>(`/api/org/departments/${id}`, { method: 'DELETE' });
}

export function queryUserDepartments(userId: string) {
  return apiRequest<string[]>(`/api/org/users/${userId}/departments`);
}

export function queryUserDepartmentMappings(userIds: string[]) {
  if (userIds.length === 0) return Promise.resolve<Record<string, string[]>>({});
  const search = new URLSearchParams();
  userIds.forEach((userId) => search.append('userIds', userId));
  return apiRequest<Record<string, string[]>>(`/api/org/user-departments?${search.toString()}`);
}

export function assignUserDepartments(userId: string, departmentIds: string[]) {
  return apiRequest<string[]>(`/api/org/users/${userId}/departments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ departmentIds }),
  });
}

export function addDepartmentMembers(departmentId: string, userIds: string[]) {
  return apiRequest<number>(`/api/org/departments/${departmentId}/members`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userIds }),
  });
}
