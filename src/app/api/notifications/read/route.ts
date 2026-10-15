import { json, parseJson, route } from "@/lib/api";
import { requireSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { NotificationsReadSchema } from "@/lib/validation/contacts";

/** Mark some (`ids`) or all of my notifications as read. */
export const POST = route(async (req) => {
  const { user } = await requireSession();
  const { ids } = await parseJson(req, NotificationsReadSchema);
  await db.notification.updateMany({
    where: { userId: user.id, readAt: null, ...(ids ? { id: { in: ids } } : {}) },
    data: { readAt: new Date() },
  });
  return json({ ok: true });
});
