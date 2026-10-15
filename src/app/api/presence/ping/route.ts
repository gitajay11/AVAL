import { json, route } from "@/lib/api";
import { requireSession } from "@/lib/auth/session";
import { touchLastSeen } from "@/lib/presence";
import { rateLimit } from "@/lib/security/rate-limit";

/** Heartbeat from a visible tab, every 60s. Keeps "last seen" accurate. */
export const POST = route(async () => {
  const { user } = await requireSession();
  await rateLimit("presencePing", user.id);
  await touchLastSeen(user.id);
  return json({ ok: true });
});
