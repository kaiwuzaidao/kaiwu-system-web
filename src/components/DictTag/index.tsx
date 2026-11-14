import { Tag } from 'antd';
import { useDict } from '@/hooks/useDict';

type DictTagProps = {
  dictCode: string;
  projectId?: string;
  value?: string | number | boolean | null;
  fallback?: string;
};

/**
 * 受管字典 → 语义色 Tag；未知值原样显示（不静默丢失）。
 */
export default function DictTag({ dictCode, projectId, value, fallback = '-' }: DictTagProps) {
  const { options } = useDict(dictCode, projectId);
  if (value === undefined || value === null || value === '') {
    return <>{fallback}</>;
  }
  const stringValue = String(value);
  const matched = options.find((option) => option.value === stringValue);
  return (
    <Tag color={matched?.color} style={{ margin: 0 }}>
      {matched?.label ?? stringValue}
    </Tag>
  );
}
