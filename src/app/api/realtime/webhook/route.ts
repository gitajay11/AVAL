import { createHmac, timingSafeEqual } from "node:crypto";
import { after, NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { broadcastPresence } from "@/lib/presence";
import { isOnline } from "@/lib/realtime/server";

/**
 * Ably "channel.presence" webhook (enveloped, signed with the API key). Fires when
 * a user's devices connect or disconnect: records last seen and tells allowed peers.
 * Configure in Ably → Integrations → Webhook, channel filter `^user:`.
 */
function verified(raw: string, req: NextRequest): boolean {
  const key = process.env.ABLY_API_KEY;
  const signature = req.headers.get("x-ably-signature");
  if (!key || !signature) return false;
  const secret = key.slice(key.indexOf(":") + 1);
  const expected = createHmac("sha256", secret).update(raw).digest("base64");
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && timingSafeEqual(a, b);
}

type PresenceItem = { clientId?: string; action?: number | string };
type Envelope = { items?: { source?: string; data?: { channelId?: string; presence?: PresenceItem[] } }[] };

const UUID = /^[0-9a-f-]{36}$/i;

export async function POST(req: NextRequest) {
  const raw = await req.text();
  if (!verified(raw, req)) return NextResponse.json({ error: "invalid signature" }, { status: 401 });

  let body: Envelope;
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }

  const users = new Set<string>();
  for (const item of body.items ?? []) {
    if (item.source !== "channel.presence") continue;
    const channelUser = item.data?.channelId?.replace(/^user:/, "");
    for (const p of item.data?.presence ?? []) {
      // Only a user's own presence on their own channel counts.
      if (p.clientId && p.clientId === channelUser && UUID.test(p.clientId)) users.add(p.clientId);
    }
  }

  after(async () => {
    for (const userId of users) {
      // A user may have several devices; only "offline" once none remain.
      if ((await isOnline(userId)) === false) {
        await db.user.updateMany({ where: { id: userId }, data: { lastSeenAt: new Date() } });
      }
      await broadcastPresence(userId);
    }
  });
  return NextResponse.json({ ok: true });
}
