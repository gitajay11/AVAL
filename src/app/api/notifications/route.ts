import { json, route } from "@/lib/api";
import { requireSession } from "@/lib/auth/session";
import { listNotifications } from "@/lib/contacts/notifications";

/** My latest in-app notifications and the unread count. */
export const GET = route(async () => {
  const { user } = await requireSession();
  return json(await listNotifications(user.id));
});
