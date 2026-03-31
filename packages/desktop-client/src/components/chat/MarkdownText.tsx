import React from 'react';
import type { CSSProperties } from 'react';

type MarkdownTextProps = {
  text: string;
  style?: CSSProperties;
};

type InlineNode =
  | { type: 'text'; content: string }
  | { type: 'bold'; content: string }
  | { type: 'italic'; content: string };

function parseInline(line: string): InlineNode[] {
  const nodes: InlineNode[] = [];
  const regex = /\*\*(.+?)\*\*|\*(.+?)\*|_(.+?)_/g;
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(line)) !== null) {
    if (match.index > lastIndex) {
      nodes.push({ type: 'text', content: line.slice(lastIndex, match.index) });
    }
    if (match[1] !== undefined) {
      nodes.push({ type: 'bold', content: match[1] });
    } else if (match[2] !== undefined) {
      nodes.push({ type: 'italic', content: match[2] });
    } else if (match[3] !== undefined) {
      nodes.push({ type: 'italic', content: match[3] });
    }
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < line.length) {
    nodes.push({ type: 'text', content: line.slice(lastIndex) });
  }

  return nodes;
}

function renderInlineNodes(nodes: InlineNode[], keyPrefix: string) {
  return nodes.map((node, i) => {
    const key = `${keyPrefix}-${i}`;
    if (node.type === 'bold') {
      return (
        <strong key={key} style={{ fontWeight: 600 }}>
          {node.content}
        </strong>
      );
    }
    if (node.type === 'italic') {
      return (
        <em key={key} style={{ fontStyle: 'italic' }}>
          {node.content}
        </em>
      );
    }
    return <span key={key}>{node.content}</span>;
  });
}

export function MarkdownText({ text, style }: MarkdownTextProps) {
  const lines = text.split('\n');
  const elements: React.ReactNode[] = [];
  let listItems: { content: string; ordered: boolean; num?: string }[] = [];
  let listKey = 0;

  const flushList = () => {
    if (listItems.length === 0) return;
    const isOrdered = listItems[0].ordered;
    const items = listItems.map((item, i) => (
      <li key={i} style={{ marginBottom: 2 }}>
        {renderInlineNodes(parseInline(item.content), `li-${listKey}-${i}`)}
      </li>
    ));
    const listStyle: CSSProperties = {
      margin: '4px 0',
      paddingLeft: 20,
    };
    if (isOrdered) {
      elements.push(<ol key={`ol-${listKey}`} style={listStyle}>{items}</ol>);
    } else {
      elements.push(<ul key={`ul-${listKey}`} style={listStyle}>{items}</ul>);
    }
    listItems = [];
    listKey++;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    const bulletMatch = trimmed.match(/^[-*•]\s+(.+)/);
    if (bulletMatch) {
      if (listItems.length > 0 && listItems[0].ordered) flushList();
      listItems.push({ content: bulletMatch[1], ordered: false });
      continue;
    }

    const numberedMatch = trimmed.match(/^(\d+)[.)]\s+(.+)/);
    if (numberedMatch) {
      if (listItems.length > 0 && !listItems[0].ordered) flushList();
      listItems.push({
        content: numberedMatch[2],
        ordered: true,
        num: numberedMatch[1],
      });
      continue;
    }

    flushList();

    if (trimmed === '') {
      if (i > 0 && i < lines.length - 1) {
        elements.push(<div key={`br-${i}`} style={{ height: 8 }} />);
      }
      continue;
    }

    elements.push(
      <div key={`p-${i}`} style={{ whiteSpace: 'pre-wrap' }}>
        {renderInlineNodes(parseInline(line), `p-${i}`)}
      </div>,
    );
  }

  flushList();

  return <div style={{ ...style, overflow: 'hidden', minWidth: 0, maxWidth: '100%' }}>{elements}</div>;
}
