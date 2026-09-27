"use client";

import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";

type Katex = typeof import("katex");
let katexPromise: Promise<Katex> | null = null;
function loadKatex() {
  katexPromise ??= Promise.all([import("katex"), import("katex/dist/katex.min.css")]).then(([k]) => (k.default ?? k) as Katex);
  return katexPromise;
}

interface Segment {
  math: boolean;
  display: boolean;
  text: string;
}

/** Split text on $$…$$ (display) and $…$ (inline) delimiters. \$ escapes a dollar. */
export function splitMath(input: string): Segment[] {
  const out: Segment[] = [];
  const re = /\$\$([\s\S]+?)\$\$|(?<!\\)\$((?:\\\$|[^$\n])+?)\$/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(input))) {
    if (m.index > last) out.push({ math: false, display: false, text: input.slice(last, m.index) });
    out.push({ math: true, display: m[1] !== undefined, text: (m[1] ?? m[2]).trim() });
    last = m.index + m[0].length;
  }
  if (last < input.length) out.push({ math: false, display: false, text: input.slice(last) });
  return out.map((s) => (s.math ? s : { ...s, text: s.text.replace(/\\\$/g, "$") }));
}

/**
 * Renders user text with optional LaTeX math. Plain text is rendered by React
 * (escaped); math is rendered by KaTeX with `trust: false`, so user content
 * cannot inject HTML. KaTeX is loaded lazily only when math is present.
 */
export function MathText({ text, className }: { text: string; className?: string }) {
  const segments = useMemo(() => splitMath(text), [text]);
  const hasMath = segments.some((s) => s.math);
  const [katex, setKatex] = useState<Katex | null>(null);
  useEffect(() => {
    if (!hasMath || katex) return;
    let alive = true;
    loadKatex()
      .then((k) => alive && setKatex(k))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [hasMath, katex]);

  return (
    <div className={cn("whitespace-pre-wrap break-words", className)}>
      {segments.map((s, i) => {
        if (!s.math) return <span key={i}>{s.text}</span>;
        if (!katex) return <code key={i} className="rounded bg-surface-2 px-1 text-[0.9em]">{s.display ? `$$${s.text}$$` : `$${s.text}$`}</code>;
        const html = katex.renderToString(s.text, { throwOnError: false, displayMode: s.display, trust: false, strict: "ignore" });
        return <span key={i} className={s.display ? "my-1 block overflow-x-auto" : undefined} dangerouslySetInnerHTML={{ __html: html }} />;
      })}
    </div>
  );
}
