/**
 * CSRF defence for cookie-authenticated mutations. Combined with SameSite=Lax
 * cookies, a request is accepted only if the browser says it came from our own
 * origin. Browsers always send `Origin` on cross-origin and non-GET fetches.
 */
export function checkOrigin(headers: Headers, selfOrigin: string): boolean {
  const allowed = new Set([selfOrigin]);
  if (process.env.APP_URL) allowed.add(new URL(process.env.APP_URL).origin);

  const origin = headers.get("origin");
  if (origin) return allowed.has(origin);

  // No Origin header (rare: some same-origin requests in older browsers).
  const site = headers.get("sec-fetch-site");
  return site === "same-origin";
}
