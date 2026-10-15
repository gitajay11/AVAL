// Pure helpers for link previews (no I/O), shared with tests.

const URL_RE = /\b((?:https?:\/\/|www\.)[^\s<>"']+[^\s<>"'.,;:!?)\]}])/i;

/** First http(s) link in a message, normalized; null if none. */
export function firstUrl(text: string): string | null {
  const m = text.match(URL_RE);
  if (!m) return null;
  return m[1].startsWith("www.") ? `https://${m[1]}` : m[1];
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === "#") {
      const code = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

const clean = (s: string | undefined, max: number) => {
  if (!s) return null;
  const v = decodeEntities(s).replace(/\s+/g, " ").trim();
  return v ? v.slice(0, max) : null;
};

/** Open Graph / Twitter / <title> metadata from the <head> of an HTML page. */
export function parseMeta(html: string) {
  const head = html.slice(0, 200_000);
  const meta: Record<string, string> = {};
  for (const tag of head.match(/<meta\b[^>]*>/gi) ?? []) {
    const attrs: Record<string, string> = {};
    for (const a of tag.matchAll(/([a-zA-Z:-]+)\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'>]+))/g)) {
      attrs[a[1].toLowerCase()] = a[3] ?? a[4] ?? a[5] ?? "";
    }
    const key = (attrs.property ?? attrs.name)?.toLowerCase();
    if (key && attrs.content !== undefined && !(key in meta)) meta[key] = attrs.content;
  }
  const title = head.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1];
  return {
    title: clean(meta["og:title"] ?? meta["twitter:title"] ?? title, 200),
    description: clean(meta["og:description"] ?? meta["twitter:description"] ?? meta["description"], 300),
    siteName: clean(meta["og:site_name"], 100),
    image: meta["og:image"] ?? meta["og:image:url"] ?? meta["twitter:image"] ?? null,
  };
}
