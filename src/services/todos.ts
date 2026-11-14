import { apiRequest } from '@/services/auth';

/** 统一待办（ADR 0034）：业务项目投递、由来源方维护状态的待办。 */
export type Todo = {
  id: string;
  projectId: string;
  projectCode: string;
  title: string;
  content?: string;
  /** 点击跳转的平台内路径；业务服务未指定时由 System 补成该项目的后台入口。 */
  linkUrl?: string;
  status: 'OPEN' | 'DONE' | 'CANCELLED';
  dueAt?: string;
  /** 是否已逾期，由服务端按当前时间计算，客户端不自行判断。 */
  overdue: boolean;
  openedAt: string;
  closedAt?: string;
};

export type TodoSummary = {
  /** 未处理（OPEN）待办总数。 */
  openCount: number;
  /** 其中已逾期的数量。 */
  overdueCount: number;
  /** 最近打开的若干条未处理待办，可能少于 openCount。 */
  recent: Todo[];
};

/**
 * 当前用户的待办概览，供工作台「待办与提醒」使用；只读自己的，不需要权限码。
 *
 * <p>返回值在这里规范化：工作台是所有用户的入口，待办只是其中一块，不能因为后端尚未升级或返回了
 * 非预期的结构就让整页渲染失败，所以结构不符时退化为「没有待办」。</p>
 */
export async function queryTodoSummary(): Promise<TodoSummary> {
  const raw = await apiRequest<Partial<TodoSummary> | undefined>('/api/current/todos/summary');
  const recent = Array.isArray(raw?.recent) ? raw.recent : [];
  return {
    openCount: typeof raw?.openCount === 'number' ? raw.openCount : recent.length,
    overdueCount: typeof raw?.overdueCount === 'number' ? raw.overdueCount : 0,
    recent,
  };
}
