import { json, route } from "@/lib/api";
import { clearSessionCookie, getSession, revokeSession } from "@/lib/auth/session";

export const POST = route(async () => {
  const session = await getSession();
  if (session) await revokeSession(session.sessionId);
  // Clear-Site-Data wipes the HTTP cache and service-worker caches for this origin.
  const res = json({ ok: true }, { headers: { "Clear-Site-Data": '"cache"' } });
  clearSessionCookie(res);
  return res;
});
