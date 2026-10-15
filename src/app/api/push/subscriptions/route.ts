import { z } from "zod";
import { json, parseJson, route } from "@/lib/api";
import { requireSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { rateLimit } from "@/lib/security/rate-limit";

const SubscriptionSchema = z.object({
  endpoint: z.url().max(2048).refine((u) => u.startsWith("https://"), "Push endpoints are HTTPS"),
  keys: z.object({ p256dh: z.string().min(1).max(256), auth: z.string().min(1).max(64) }),
});

const EndpointSchema = z.object({ endpoint: z.url().max(2048) });

/**
 * Register this device for push. An endpoint belongs to one browser profile, so
 * if another account used it before (shared device), it moves to me.
 */
export const POST = route(async (req) => {
  const { user } = await requireSession();
  await rateLimit("pushSubscribe", user.id);
  const { endpoint, keys } = await parseJson(req, SubscriptionSchema);
  const userAgent = req.headers.get("user-agent")?.slice(0, 255) ?? null;
  await db.pushSubscription.upsert({
    where: { endpoint },
    create: { userId: user.id, endpoint, p256dh: keys.p256dh, auth: keys.auth, userAgent },
    update: { userId: user.id, p256dh: keys.p256dh, auth: keys.auth, userAgent },
  });
  return json({ ok: true }, { status: 201 });
});

/** Stop push on this device (also called on logout). */
export const DELETE = route(async (req) => {
  const { user } = await requireSession();
  const { endpoint } = await parseJson(req, EndpointSchema);
  await db.pushSubscription.deleteMany({ where: { endpoint, userId: user.id } });
  return json({ ok: true });
});
