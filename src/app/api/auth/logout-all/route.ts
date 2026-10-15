import { json, route } from "@/lib/api";
import { clearSessionCookie, requireSession, revokeAllSessions } from "@/lib/auth/session";

/** Sign out every device, including this one. */
export const POST = route(async () => {
  const { user } = await requireSession();
  await revokeAllSessions(user.id);
  const res = json({ ok: true }, { headers: { "Clear-Site-Data": '"cache"' } });
  clearSessionCookie(res);
  return res;
});
