import { ProFormSelect, type ProFormSelectProps } from '@ant-design/pro-components';
import { useDict } from '@/hooks/useDict';

type DictSelectProps = Omit<
  ProFormSelectProps<{ value: string; label: string }>,
  'options' | 'valueEnum' | 'request'
> & {
  dictCode: string;
  /** 是否隐藏未知值/额外值；默认 false（允许用户选到 fallback 里的老值）。 */
  strict?: boolean;
};

/**
 * 受管字典下拉：ProFormSelect + useDict；加载中显示 fallback 静态选项，
 * 数据到位后自动切成后端字典。
 */
export default function DictSelect({ dictCode, fieldProps, ...rest }: DictSelectProps) {
  const { options, loading } = useDict(dictCode);
  return (
    <ProFormSelect
      {...rest}
      fieldProps={{
        loading,
        ...fieldProps,
      }}
      options={options.map((option) => ({
        value: option.value,
        label: option.label,
      }))}
    />
  );
}
