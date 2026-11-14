import { Fragment, type ReactNode } from 'react';
import { Typography } from 'antd';

/**
 * 助手回答的受限 Markdown 渲染。
 *
 * <p>只支持回答里常见的几种写法：代码块（带复制）、行内代码、加粗、标题、有序/无序列表。
 * 不引入通用 Markdown 库，也不渲染链接：模型生成的 URL 不作为可点击链接（覆盖规划的跳转约束），
 * `[文字](地址)` 原样显示为「文字（地址）」。全部经 React 文本节点输出，不存在 HTML 注入。</p>
 */
type Block =
  | { kind: 'code'; text: string }
  | { kind: 'heading'; text: string }
  | { kind: 'list'; ordered: boolean; start: number; items: string[] }
  | { kind: 'paragraph'; text: string };

const FENCE = /^\s*```/;
const BULLET = /^\s*[-*]\s+/;
const ORDERED = /^\s*\d+[.)]\s+/;
const HEADING = /^\s*#{1,6}\s+/;

function parse(source: string): Block[] {
  const blocks: Block[] = [];
  const lines = source.replace(/\r\n?/g, '\n').split('\n');
  let paragraph: string[] = [];
  const flushParagraph = () => {
    if (paragraph.some((line) => line.trim())) {
      blocks.push({ kind: 'paragraph', text: paragraph.join('\n').trim() });
    }
    paragraph = [];
  };
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (FENCE.test(line)) {
      flushParagraph();
      const code: string[] = [];
      index += 1;
      while (index < lines.length && !FENCE.test(lines[index])) {
        code.push(lines[index]);
        index += 1;
      }
      blocks.push({ kind: 'code', text: code.join('\n') });
      continue;
    }
    if (HEADING.test(line)) {
      flushParagraph();
      blocks.push({ kind: 'heading', text: line.replace(HEADING, '') });
      continue;
    }
    const ordered = ORDERED.test(line);
    if (ordered || BULLET.test(line)) {
      flushParagraph();
      const marker = ordered ? ORDERED : BULLET;
      const items: string[] = [];
      while (index < lines.length && marker.test(lines[index])) {
        items.push(lines[index].replace(marker, ''));
        index += 1;
      }
      index -= 1;
      // 代码块会把一个有序列表切成两段；沿用原编号，第二段才能接着「3.」而不是从 1 重来。
      const start = ordered ? Number(/\d+/.exec(line)?.[0] ?? 1) : 1;
      blocks.push({ kind: 'list', ordered, start, items });
      continue;
    }
    if (!line.trim()) {
      flushParagraph();
      continue;
    }
    paragraph.push(line);
  }
  flushParagraph();
  return blocks;
}

/** 行内：`代码`、**加粗**、[文字](地址)。 */
function inline(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const pattern = /`([^`]+)`|\*\*(.+?)\*\*|\[([^\]]+)\]\(([^)\s]+)\)/g;
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text))) {
    if (match.index > last) nodes.push(text.slice(last, match.index));
    if (match[1] !== undefined) {
      nodes.push(
        <Typography.Text code key={match.index}>
          {match[1]}
        </Typography.Text>,
      );
    } else if (match[2] !== undefined) {
      nodes.push(<strong key={match.index}>{match[2]}</strong>);
    } else {
      nodes.push(`${match[3]}（${match[4]}）`);
    }
    last = pattern.lastIndex;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

export default function AnswerText({ text }: { text: string }) {
  return (
    <div className="agent-dock-answer">
      {parse(text).map((block, index) => {
        if (block.kind === 'code') {
          return (
            <div key={index} className="agent-dock-code">
              <pre>{block.text}</pre>
              <Typography.Text className="agent-dock-code-copy" copyable={{ text: block.text }} />
            </div>
          );
        }
        if (block.kind === 'heading') {
          return (
            <p key={index} className="agent-dock-answer-heading">
              {inline(block.text)}
            </p>
          );
        }
        if (block.kind === 'list') {
          const items = block.items.map((item, position) => <li key={position}>{inline(item)}</li>);
          return block.ordered ? (
            <ol key={index} start={block.start}>
              {items}
            </ol>
          ) : (
            <ul key={index}>{items}</ul>
          );
        }
        return (
          <p key={index}>
            {block.text.split('\n').map((line, position) => (
              <Fragment key={position}>
                {position > 0 && <br />}
                {inline(line)}
              </Fragment>
            ))}
          </p>
        );
      })}
    </div>
  );
}
