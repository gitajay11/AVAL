import { Fragment } from "react";

// http(s) URLs and bare www. links. Anything else stays plain text.
const URL_RE = /\b((?:https?:\/\/|www\.)[^\s<>"']+[^\s<>"'.,;:!?)\]}])/gi;

/** Plain text with safe, clickable links. Text is never interpreted as HTML. */
export function MessageText({ text, className }: { text: string; className?: string }) {
  const parts: React.ReactNode[] = [];
  let last = 0;
  for (const match of text.matchAll(URL_RE)) {
    const raw = match[0];
    const start = match.index ?? 0;
    if (start > last) parts.push(text.slice(last, start));
    const href = raw.startsWith("www.") ? `https://${raw}` : raw;
    parts.push(
      <a
        key={start}
        href={href}
        target="_blank"
        rel="noopener noreferrer nofollow"
        className="break-all underline decoration-current/40 underline-offset-2 hover:decoration-current"
        onClick={(e) => e.stopPropagation()}
      >
        {raw}
      </a>,
    );
    last = start + raw.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return (
    <span className={className} style={{ overflowWrap: "anywhere", whiteSpace: "pre-wrap" }}>
      {parts.map((p, i) => (
        <Fragment key={i}>{p}</Fragment>
      ))}
    </span>
  );
}
