import "server-only";
import webpush from "web-push";
import { db } from "@/lib/db";

/**
 * Web Push (VAPID). Optional: without keys the app works and simply sends no
 * pushes. Payloads are end-to-end encrypted to each browser by web-push.
 */

let configured: boolean | undefined;

export function pushConfig(): { publicKey: string } | null {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) return null;
  if (!configured) {
    webpush.setVapidDetails(process.env.VAPID_SUBJECT ?? "mailto:admin@example.com", publicKey, privateKey);
    configured = true;
  }
  return { publicKey };
}

export type PushPayload = {
  kind: "message" | "access";
  title: string;
  body: string;
  /** Collapses notifications for the same chat into one. */
  tag: string;
  url: string;
  chatId?: string;
  /** Offer an inline reply action (where the browser supports it). */
  reply?: boolean;
};

const MAX_BODY = 180;

/** Send to every device of a user. Dead subscriptions (404/410) are removed. */
export async function pushToUser(userId: string, payload: PushPayload, opts: { urgency?: "high" | "normal" } = {}) {
  if (!pushConfig()) return;
  const subs = await db.pushSubscription.findMany({ where: { userId }, select: { id: true, endpoint: true, p256dh: true, auth: true } });
  const body = JSON.stringify({ ...payload, body: payload.body.slice(0, MAX_BODY) });
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, body, {
          TTL: 24 * 60 * 60,
          urgency: opts.urgency ?? "high",
          topic: payload.tag.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 32) || undefined,
        });
        await db.pushSubscription.update({ where: { id: s.id }, data: { lastUsedAt: new Date() } });
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) await db.pushSubscription.delete({ where: { id: s.id } }).catch(() => {});
        else console.warn("[push] send failed", status ?? (err as Error).message);
      }
    }),
  );
}
