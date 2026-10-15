import { json, route } from "@/lib/api";
import { requireSession } from "@/lib/auth/session";
import { pushConfig } from "@/lib/push/server";

/** The VAPID public key browsers need to subscribe, or null if push isn't configured. */
export const GET = route(async () => {
  await requireSession();
  return json({ publicKey: pushConfig()?.publicKey ?? null });
});
