import { json, route } from "@/lib/api";
import { clearSessionCookie, requireSession, revokeAllSessions } from "@/lib/auth/session";
import { db } from "@/lib/db";

/** Sign out every device, including this one. */
export const POST = route(async () => {
  const { user } = await requireSession();
  await revokeAllSessions(user.id);
  // No device should keep receiving notifications for a signed-out account.
  await db.pushSubscription.deleteMany({ where: { userId: user.id } });
  const res = json({ ok: true }, { headers: { "Clear-Site-Data": '"cache"' } });
  clearSessionCookie(res);
  return res;
});
