import { json, route } from "@/lib/api";
import { requireSession } from "@/lib/auth/session";
import { markAllDelivered } from "@/lib/chats/service";
import { rateLimit } from "@/lib/security/rate-limit";

/** "New messages reached this device": advances my delivered watermarks (✓✓ for senders). */
export const POST = route(async () => {
  const { user } = await requireSession();
  await rateLimit("messageAction", user.id);
  await markAllDelivered(user.id);
  return json({ ok: true });
});
