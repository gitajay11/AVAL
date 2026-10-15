// Pure: turn what the user typed into a Postgres tsquery for the 'simple'
// configuration. Only letters and digits survive, so the result can never
// contain tsquery operators supplied by the user.

const MAX_TERMS = 8;
const MAX_TERM_LENGTH = 64;

export function searchTerms(q: string): string[] {
  return (q.normalize("NFKC").toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [])
    .map((t) => t.slice(0, MAX_TERM_LENGTH))
    .slice(0, MAX_TERMS);
}

/** "hello wor" → "hello & wor:*" (every word required; the last may be a prefix). */
export function toTsQuery(q: string): string | null {
  const terms = searchTerms(q);
  if (terms.length === 0) return null;
  return terms.map((t, i) => (i === terms.length - 1 ? `${t}:*` : t)).join(" & ");
}
