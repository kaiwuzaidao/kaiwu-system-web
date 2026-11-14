import { ArrowRightOutlined } from '@ant-design/icons';
import { useIntl } from '@umijs/max';
import { Button, Typography } from 'antd';
import type { NavigationMenu } from '@/services/auth';

export type PageEntry = { name: string; path: string; icon?: string };

/** 把本人有权限的导航菜单展平为可直达的页面；只取平台下发的站内路由。 */
export function flattenPages(menus: NavigationMenu[]): PageEntry[] {
  const pages: PageEntry[] = [];
  const walk = (nodes: NavigationMenu[]) =>
    nodes.forEach((node) => {
      if (node.type === 'MENU' && node.path?.startsWith('/')) {
        pages.push({ name: node.name, path: node.path, icon: node.icon });
      }
      walk(node.children ?? []);
    });
  walk(menus);
  return pages;
}

const SUFFIX = /\s*(管理|配置|中心|列表|设置|management|settings|configuration|center|list)$/i;
const ASCII = /^[\x20-\x7e]+$/;

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * 按问题里出现的页面关键词匹配，最多 3 个。
 *
 * <p>确定性匹配，不经过模型：「创建字典」命中「字典管理」。英文关键词按整词匹配，
 * 避免「AI」误命中「detail」这类子串。</p>
 */
export function matchPages(question: string, pages: PageEntry[]): PageEntry[] {
  const text = question.toLowerCase();
  return pages
    .filter((page) => {
      const keyword = page.name.replace(SUFFIX, '').trim().toLowerCase();
      if (keyword.length < 2) return false;
      return ASCII.test(keyword)
        ? new RegExp(`\\b${escapeRegExp(keyword)}\\b`, 'i').test(text)
        : text.includes(keyword);
    })
    .slice(0, 3);
}

/** 助手做不到或只给出说明时，提供本人有权限的相关页面直达。 */
export default function RelatedPages({
  pages,
  onOpen,
}: {
  pages: PageEntry[];
  onOpen: (path: string) => void;
}) {
  const intl = useIntl();
  if (!pages.length) return null;
  return (
    <div className="agent-dock-related">
      <Typography.Text type="secondary">
        {intl.formatMessage({ id: 'agent.page.related' })}
      </Typography.Text>
      {pages.map((page) => (
        <Button key={page.path} size="small" onClick={() => onOpen(page.path)}>
          {page.name}
          <ArrowRightOutlined />
        </Button>
      ))}
    </div>
  );
}
