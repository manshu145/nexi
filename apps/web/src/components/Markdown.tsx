'use client';

import { type ReactNode } from 'react';

/**
 * Tiny markdown renderer.
 *
 * Supports the subset needed by chapter section bodies authored in the
 * admin panel:
 *
 *   ## heading       -> h3
 *   - item / * item  -> bullet list
 *   1. item          -> ordered list
 *   blank-line gap   -> new paragraph
 *   **strong**       -> <strong>
 *   *em* / _em_      -> <em>
 *   `inline code`    -> <code>
 *   [text](url)      -> <a>
 *
 * Everything else is escaped and rendered as plain text -- which means
 * no raw HTML can sneak in from chapter bodies authored by admins. We
 * deliberately avoid pulling react-markdown / remark for now to keep the
 * web bundle small; we'll swap in a real lib when we need tables, math,
 * or images.
 */
export function Markdown({ source }: { source: string }) {
  const blocks = parseBlocks(source);
  return (
    <>
      {blocks.map((b, i) => (
        <Block key={i} block={b} />
      ))}
    </>
  );
}

// ----------------------------------------------------------------------------

type Block =
  | { kind: 'heading'; level: 2 | 3; text: string }
  | { kind: 'paragraph'; text: string }
  | { kind: 'ul'; items: string[] }
  | { kind: 'ol'; items: string[] }
  | { kind: 'code'; text: string };

function parseBlocks(src: string): Block[] {
  const lines = src.replace(/\r\n/g, '\n').split('\n');
  const out: Block[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i] ?? '';

    // blank line
    if (!line.trim()) {
      i += 1;
      continue;
    }

    // fenced code block
    if (line.startsWith('```')) {
      const buf: string[] = [];
      i += 1;
      while (i < lines.length && !(lines[i] ?? '').startsWith('```')) {
        buf.push(lines[i] ?? '');
        i += 1;
      }
      if (i < lines.length) i += 1; // closing fence
      out.push({ kind: 'code', text: buf.join('\n') });
      continue;
    }

    // heading
    const headingMatch = /^(#{2,3})\s+(.*)$/.exec(line);
    if (headingMatch) {
      const level = (headingMatch[1] ?? '').length === 2 ? 2 : 3;
      out.push({ kind: 'heading', level: level as 2 | 3, text: headingMatch[2] ?? '' });
      i += 1;
      continue;
    }

    // unordered list
    if (/^\s*[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i] ?? '')) {
        items.push((lines[i] ?? '').replace(/^\s*[-*]\s+/, ''));
        i += 1;
      }
      out.push({ kind: 'ul', items });
      continue;
    }

    // ordered list
    if (/^\s*\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i] ?? '')) {
        items.push((lines[i] ?? '').replace(/^\s*\d+\.\s+/, ''));
        i += 1;
      }
      out.push({ kind: 'ol', items });
      continue;
    }

    // paragraph -- collect until blank line or block-starter
    const paraLines: string[] = [];
    while (i < lines.length) {
      const cur = lines[i] ?? '';
      if (
        !cur.trim() ||
        cur.startsWith('```') ||
        /^(#{2,3})\s+/.test(cur) ||
        /^\s*[-*]\s+/.test(cur) ||
        /^\s*\d+\.\s+/.test(cur)
      ) {
        break;
      }
      paraLines.push(cur);
      i += 1;
    }
    if (paraLines.length > 0) {
      out.push({ kind: 'paragraph', text: paraLines.join(' ') });
    }
  }

  return out;
}

function Block({ block }: { block: Block }) {
  switch (block.kind) {
    case 'heading':
      if (block.level === 2) {
        return (
          <h2 className="font-serif mt-8 mb-3 text-2xl font-semibold text-ink-900">
            <Inline text={block.text} />
          </h2>
        );
      }
      return (
        <h3 className="font-serif mt-6 mb-2 text-xl font-semibold text-ink-900">
          <Inline text={block.text} />
        </h3>
      );
    case 'paragraph':
      return (
        <p className="my-4 leading-relaxed text-ink-800">
          <Inline text={block.text} />
        </p>
      );
    case 'ul':
      return (
        <ul className="my-4 list-disc space-y-1 pl-6 text-ink-800">
          {block.items.map((it, i) => (
            <li key={i}>
              <Inline text={it} />
            </li>
          ))}
        </ul>
      );
    case 'ol':
      return (
        <ol className="my-4 list-decimal space-y-1 pl-6 text-ink-800">
          {block.items.map((it, i) => (
            <li key={i}>
              <Inline text={it} />
            </li>
          ))}
        </ol>
      );
    case 'code':
      return (
        <pre className="my-4 overflow-x-auto rounded-md border border-line bg-paper-200 p-3 font-mono text-xs text-ink-900">
          <code>{block.text}</code>
        </pre>
      );
  }
}

/**
 * Render inline emphasis / code / links by tokenising the line.
 *
 * We escape every literal character (React already does this via JSX
 * children), so the only HTML we ever emit comes from the explicit
 * <strong>, <em>, <code>, <a> elements below. No DOMPurify required
 * because we never call dangerouslySetInnerHTML.
 */
function Inline({ text }: { text: string }): ReactNode {
  const tokens = tokenise(text);
  return (
    <>
      {tokens.map((t, i) => {
        switch (t.kind) {
          case 'text':
            return <span key={i}>{t.value}</span>;
          case 'strong':
            return <strong key={i}>{t.value}</strong>;
          case 'em':
            return <em key={i}>{t.value}</em>;
          case 'code':
            return (
              <code
                key={i}
                className="rounded bg-paper-200 px-1.5 py-0.5 font-mono text-[0.85em] text-ink-900"
              >
                {t.value}
              </code>
            );
          case 'link':
            return (
              <a
                key={i}
                href={t.href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-ember-600 underline hover:text-ember-700"
              >
                {t.value}
              </a>
            );
        }
      })}
    </>
  );
}

type Token =
  | { kind: 'text'; value: string }
  | { kind: 'strong'; value: string }
  | { kind: 'em'; value: string }
  | { kind: 'code'; value: string }
  | { kind: 'link'; value: string; href: string };

function tokenise(input: string): Token[] {
  const out: Token[] = [];
  let rest = input;
  // Order matters: code first (so its contents aren't reinterpreted),
  // then links, then strong, then em.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const patterns: { re: RegExp; build: (m: RegExpExecArray) => Token }[] = [
    {
      re: /`([^`]+)`/,
      build: (m) => ({ kind: 'code', value: m[1] ?? '' }),
    },
    {
      re: /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/,
      build: (m) => ({ kind: 'link', value: m[1] ?? '', href: m[2] ?? '#' }),
    },
    {
      re: /\*\*([^*]+)\*\*/,
      build: (m) => ({ kind: 'strong', value: m[1] ?? '' }),
    },
    {
      re: /(?<![a-zA-Z0-9_])\*([^*\n]+)\*(?![a-zA-Z0-9_])/,
      build: (m) => ({ kind: 'em', value: m[1] ?? '' }),
    },
    {
      re: /(?<![a-zA-Z0-9_])_([^_\n]+)_(?![a-zA-Z0-9_])/,
      build: (m) => ({ kind: 'em', value: m[1] ?? '' }),
    },
  ];

  outer: while (rest.length > 0) {
    for (const { re, build } of patterns) {
      const m = re.exec(rest);
      if (m && m.index >= 0) {
        if (m.index > 0) out.push({ kind: 'text', value: rest.slice(0, m.index) });
        out.push(build(m));
        rest = rest.slice(m.index + m[0].length);
        continue outer;
      }
    }
    out.push({ kind: 'text', value: rest });
    break;
  }
  return out;
}
