import React from 'react';
import type { CSSProperties } from 'react';

type MarkdownTextProps = {
  text: string;
  style?: CSSProperties;
};

type InlineNode =
  | { type: 'text'; content: string }
  | { type: 'bold'; content: string }
  | { type: 'italic'; content: string }
  | { type: 'bolditalic'; content: string }
  | { type: 'code'; content: string };

function parseInline(line: string): InlineNode[] {
  const nodes: InlineNode[] = [];
  const regex = /\*\*\*(.+?)\*\*\*|___(.+?)___|\*\*(.+?)\*\*|__(.+?)__|(?<!\w)\*(.+?)\*(?!\w)|(?<!\w)_(.+?)_(?!\w)|`([^`]+)`/g;
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(line)) !== null) {
    if (match.index > lastIndex) {
      nodes.push({ type: 'text', content: line.slice(lastIndex, match.index) });
    }
    if (match[1] !== undefined || match[2] !== undefined) {
      nodes.push({ type: 'bolditalic', content: match[1] ?? match[2] });
    } else if (match[3] !== undefined || match[4] !== undefined) {
      nodes.push({ type: 'bold', content: match[3] ?? match[4] });
    } else if (match[5] !== undefined || match[6] !== undefined) {
      nodes.push({ type: 'italic', content: match[5] ?? match[6] });
    } else if (match[7] !== undefined) {
      nodes.push({ type: 'code', content: match[7] });
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
    if (node.type === 'bolditalic') {
      return (
        <strong key={key} style={{ fontWeight: 600, fontStyle: 'italic' }}>
          {node.content}
        </strong>
      );
    }
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
    if (node.type === 'code') {
      return (
        <code
          key={key}
          style={{
            fontFamily: 'monospace',
            fontSize: '0.9em',
            padding: '1px 5px',
            borderRadius: 4,
            backgroundColor: 'rgba(128,128,128,0.15)',
          }}
        >
          {node.content}
        </code>
      );
    }
    return <span key={key}>{node.content}</span>;
  });
}

function renderInline(text: string, keyPrefix: string) {
  return renderInlineNodes(parseInline(text), keyPrefix);
}

const headingStyles: Record<number, CSSProperties> = {
  1: { fontSize: '1.3em', fontWeight: 700, margin: '12px 0 6px' },
  2: { fontSize: '1.15em', fontWeight: 700, margin: '10px 0 4px' },
  3: { fontSize: '1.05em', fontWeight: 600, margin: '8px 0 4px' },
  4: { fontSize: '1em', fontWeight: 600, margin: '6px 0 2px' },
};

export function MarkdownText({ text, style }: MarkdownTextProps) {
  const lines = text.split('\n');
  const elements: React.ReactNode[] = [];
  let listItems: { content: string; ordered: boolean; num?: string }[] = [];
  let listKey = 0;
  let inCodeBlock = false;
  let codeBlockLines: string[] = [];
  let codeBlockStart = 0;

  const flushList = () => {
    if (listItems.length === 0) return;
    const isOrdered = listItems[0].ordered;
    const items = listItems.map((item, i) => (
      <li key={i} style={{ marginBottom: 3, lineHeight: '1.5' }}>
        {renderInline(item.content, `li-${listKey}-${i}`)}
      </li>
    ));
    const listStyle: CSSProperties = {
      margin: '6px 0',
      paddingLeft: 22,
    };
    if (isOrdered) {
      elements.push(<ol key={`ol-${listKey}`} style={listStyle}>{items}</ol>);
    } else {
      elements.push(<ul key={`ul-${listKey}`} style={listStyle}>{items}</ul>);
    }
    listItems = [];
    listKey++;
  };

  const flushCodeBlock = () => {
    elements.push(
      <pre
        key={`code-${codeBlockStart}`}
        style={{
          fontFamily: 'monospace',
          fontSize: '0.88em',
          lineHeight: '1.5',
          backgroundColor: 'rgba(128,128,128,0.12)',
          borderRadius: 6,
          padding: '8px 10px',
          margin: '6px 0',
          overflowX: 'auto',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
        }}
      >
        {codeBlockLines.join('\n')}
      </pre>,
    );
    codeBlockLines = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (trimmed.startsWith('```')) {
      if (inCodeBlock) {
        flushCodeBlock();
        inCodeBlock = false;
      } else {
        flushList();
        inCodeBlock = true;
        codeBlockStart = i;
      }
      continue;
    }

    if (inCodeBlock) {
      codeBlockLines.push(line);
      continue;
    }

    const headingMatch = trimmed.match(/^(#{1,4})\s+(.+)/);
    if (headingMatch) {
      flushList();
      const level = headingMatch[1].length;
      const hStyle = headingStyles[level] || headingStyles[4];
      elements.push(
        <div key={`h-${i}`} style={hStyle}>
          {renderInline(headingMatch[2], `h-${i}`)}
        </div>,
      );
      continue;
    }

    if (/^[-*_]{3,}\s*$/.test(trimmed)) {
      flushList();
      elements.push(
        <hr
          key={`hr-${i}`}
          style={{
            border: 'none',
            borderTop: '1px solid rgba(128,128,128,0.25)',
            margin: '8px 0',
          }}
        />,
      );
      continue;
    }

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
      <div key={`p-${i}`} style={{ whiteSpace: 'pre-wrap', lineHeight: '1.55' }}>
        {renderInline(line, `p-${i}`)}
      </div>,
    );
  }

  if (inCodeBlock) {
    flushCodeBlock();
  }

  flushList();

  return <div style={{ ...style, overflow: 'hidden', minWidth: 0, maxWidth: '100%' }}>{elements}</div>;
}
