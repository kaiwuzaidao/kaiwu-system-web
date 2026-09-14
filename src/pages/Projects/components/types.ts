import type { PlatformProject, ProjectMenu } from '@/services/projects';

export type ProjectPermissionProps = {
  project: PlatformProject;
  permissions: string[];
};

export function flattenMenus(tree: ProjectMenu[]): ProjectMenu[] {
  return tree.flatMap((menu) => [menu, ...flattenMenus(menu.children ?? [])]);
}
