import { theme } from 'antd';
import { useEffect, useState } from 'react';
import type { CSSProperties, DragEvent, HTMLAttributes } from 'react';

/**
 * 给 antd `Table` 加「整行上下拖拽换位」的能力。
 *
 * <p>用原生 HTML5 拖拽而不是引入 dnd-kit：两张表都只是同一层级内的换位，原生 API 已经
 * 够用；dnd-kit 只是 pro-table 的间接依赖，直接 import 会绕过 package.json 的依赖声明，
 * 上游哪天换实现就会在构建时突然消失。</p>
 *
 * <p>拖拽事件挂在手柄上而不是整行：字典编码、字典值这些单元格是可选中可复制的，
 * 整行 draggable 会让按住拖选文本变成拖动行。</p>
 */
export type RowDragSort = {
  /** 拖拽手柄（图标）要展开的属性 */
  handleProps: (id: string) => HTMLAttributes<HTMLElement>;
  /** 表格行要展开的属性；与页面自己的 `onRow` 合并使用 */
  rowProps: (id: string) => HTMLAttributes<HTMLElement>;
};

/**
 * @param ids       当前显示顺序的完整行 ID 列表
 * @param onReorder 拖放完成时回调，入参是换位后的完整 ID 列表
 * @param enabled   false 时返回空属性，手柄与行都不可拖（无权限时）
 */
export default function useRowDragSort(
  ids: string[],
  onReorder: (orderedIds: string[]) => void,
  enabled = true,
): RowDragSort {
  const { token } = theme.useToken();
  // 手柄按下才让该行 draggable；松开或拖完立刻收回，避免整行长期可拖。
  const [handleId, setHandleId] = useState<string>();
  const [activeId, setActiveId] = useState<string>();
  const [overId, setOverId] = useState<string>();

  // 在手柄上按下却没拖动就松手（等于点了一下），dragend 不会触发，
  // 没有这个兜底该行会一直保持 draggable。
  useEffect(() => {
    if (!handleId) return undefined;
    const release = () => setHandleId(undefined);
    window.addEventListener('mouseup', release);
    return () => window.removeEventListener('mouseup', release);
  }, [handleId]);

  const reset = () => {
    setHandleId(undefined);
    setActiveId(undefined);
    setOverId(undefined);
  };

  const move = (fromId: string, toId: string) => {
    const fromIndex = ids.indexOf(fromId);
    const toIndex = ids.indexOf(toId);
    if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return;
    const next = ids.filter((id) => id !== fromId);
    const anchor = next.indexOf(toId);
    // 向下拖插到目标之后、向上拖插到目标之前，与手指最终停留的位置一致。
    next.splice(toIndex > fromIndex ? anchor + 1 : anchor, 0, fromId);
    onReorder(next);
  };

  if (!enabled) {
    return { handleProps: () => ({}), rowProps: () => ({}) };
  }

  return {
    handleProps: (id) => ({
      onMouseDown: () => setHandleId(id),
      style: { cursor: 'grab' },
    }),
    rowProps: (id) => {
      const style: CSSProperties = {};
      if (activeId === id) style.opacity = 0.4;
      if (overId === id && activeId && activeId !== id) {
        // 插入位置用一条线提示：拖到哪一行的上边还是下边，光靠高亮整行看不出来。
        const downward = ids.indexOf(activeId) < ids.indexOf(id);
        style.boxShadow = `inset 0 ${downward ? '-2px' : '2px'} 0 ${token.colorPrimary}`;
      }
      return {
        draggable: handleId === id,
        style,
        onDragStart: (event: DragEvent<HTMLElement>) => {
          // Firefox 要求 dragstart 里写入 dataTransfer，否则整个拖拽手势不会启动。
          event.dataTransfer.effectAllowed = 'move';
          event.dataTransfer.setData('text/plain', id);
          setActiveId(id);
        },
        onDragOver: (event: DragEvent<HTMLElement>) => {
          if (!activeId) return;
          // 不 preventDefault 浏览器会判定此处不可放置，drop 永远不触发。
          event.preventDefault();
          event.dataTransfer.dropEffect = 'move';
          if (overId !== id) setOverId(id);
        },
        onDrop: (event: DragEvent<HTMLElement>) => {
          event.preventDefault();
          if (activeId) move(activeId, id);
          reset();
        },
        onDragEnd: reset,
      };
    },
  };
}
