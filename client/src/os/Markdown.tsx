/**
 * Markdown — a deliberately small markdown-to-React renderer for the HP-OS
 * Library. Handles what the seeded documents actually use: headings, lists,
 * bold/italic/inline code, fenced code blocks, blockquotes, tables (as
 * preformatted rows), and horizontal rules. No HTML injection: everything is
 * rendered as React elements, never dangerouslySetInnerHTML.
 */
import { Fragment, ReactNode } from "react";

function inline(text: string, keyBase: string): ReactNode[] {
  // Split on **bold**, *italic*, `code`, and [label](url) in one pass.
  const parts: ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|\*[^*\n]+\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    const tok = m[0];
    const key = `${keyBase}-${i++}`;
    if (tok.startsWith("**")) parts.push(<strong key={key}>{tok.slice(2, -2)}</strong>);
    else if (tok.startsWith("`")) {
      parts.push(
        <code key={key} className="px-1 py-0.5 rounded bg-black/5 text-[0.85em]">
          {tok.slice(1, -1)}
        </code>,
      );
    } else if (tok.startsWith("[")) {
      const lm = tok.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
      if (lm && /^https?:\/\//.test(lm[2])) {
        parts.push(
          <a key={key} href={lm[2]} target="_blank" rel="noreferrer" className="underline" style={{ color: "var(--hp-gold-deep)" }}>
            {lm[1]}
          </a>,
        );
      } else parts.push(tok);
    } else parts.push(<em key={key}>{tok.slice(1, -1)}</em>);
    last = m.index + tok.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

export function Markdown({ source }: { source: string }) {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line.startsWith("```")) {
      const buf: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith("```")) buf.push(lines[i++]);
      i++; // closing fence
      blocks.push(
        <pre key={key++} className="text-xs bg-black/5 rounded-lg p-3 overflow-x-auto whitespace-pre">
          {buf.join("\n")}
        </pre>,
      );
      continue;
    }

    const h = line.match(/^(#{1,4})\s+(.*)$/);
    if (h) {
      const level = h[1].length;
      const cls =
        level === 1
          ? "hp-serif text-xl font-semibold mt-5 mb-2"
          : level === 2
            ? "hp-serif text-lg font-semibold mt-5 mb-1.5"
            : "text-sm font-semibold mt-4 mb-1";
      blocks.push(
        <div key={key++} className={cls} style={{ color: "var(--hp-ink)" }}>
          {inline(h[2], `h${key}`)}
        </div>,
      );
      i++;
      continue;
    }

    if (/^(-{3,}|\*{3,})\s*$/.test(line)) {
      blocks.push(<hr key={key++} className="my-4" style={{ borderColor: "var(--hp-hairline)" }} />);
      i++;
      continue;
    }

    if (/^\s*([-*]|\d+\.)\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*([-*]|\d+\.)\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*([-*]|\d+\.)\s+/, ""));
        i++;
      }
      blocks.push(
        <ul key={key++} className="list-disc pl-5 space-y-1 my-2 text-sm leading-relaxed">
          {items.map((it, idx) => (
            <li key={idx}>{inline(it, `li${key}-${idx}`)}</li>
          ))}
        </ul>,
      );
      continue;
    }

    if (line.startsWith(">")) {
      const buf: string[] = [];
      while (i < lines.length && lines[i].startsWith(">")) buf.push(lines[i++].replace(/^>\s?/, ""));
      blocks.push(
        <blockquote
          key={key++}
          className="border-l-2 pl-3 my-2 text-sm italic text-muted-foreground"
          style={{ borderColor: "var(--hp-gold-soft)" }}
        >
          {buf.map((b, idx) => (
            <Fragment key={idx}>
              {inline(b, `q${key}-${idx}`)}
              {idx < buf.length - 1 ? <br /> : null}
            </Fragment>
          ))}
        </blockquote>,
      );
      continue;
    }

    if (line.startsWith("|")) {
      const buf: string[] = [];
      while (i < lines.length && lines[i].startsWith("|")) buf.push(lines[i++]);
      blocks.push(
        <pre key={key++} className="text-xs bg-black/5 rounded-lg p-3 overflow-x-auto whitespace-pre">
          {buf.join("\n")}
        </pre>,
      );
      continue;
    }

    if (line.trim() === "") {
      i++;
      continue;
    }

    // Paragraph: gather until a blank line or a structural line.
    const buf: string[] = [line];
    i++;
    while (
      i < lines.length &&
      lines[i].trim() !== "" &&
      !/^(#{1,4}\s|```|>|\||\s*([-*]|\d+\.)\s|-{3,}\s*$)/.test(lines[i])
    ) {
      buf.push(lines[i++]);
    }
    blocks.push(
      <p key={key++} className="text-sm leading-relaxed my-2">
        {inline(buf.join(" "), `p${key}`)}
      </p>,
    );
  }

  return <div style={{ color: "var(--hp-ink)" }}>{blocks}</div>;
}
