import "server-only";
import { canSeeLastSeen } from "@/lib/authz/privacy";
import type { PresenceDTO } from "@/lib/chats/types";
import { db } from "@/lib/db";
import { isOnline, publishToUsers } from "@/lib/realtime/server";

/** Clients ping every 60s while visible; this window tolerates one missed ping. */
const ONLINE_WINDOW_MS = 75_000;
const TOUCH_THROTTLE_MS = 30_000;

/** Record activity. Throttled so frequent callers cost at most one write per 30s. */
export async function touchLastSeen(userId: string) {
  const now = new Date();
  await db.user.updateMany({
    where: { id: userId, OR: [{ lastSeenAt: null }, { lastSeenAt: { lt: new Date(now.getTime() - TOUCH_THROTTLE_MS) } }] },
    data: { lastSeenAt: now },
  });
}

/** What `viewerId` may know about `ownerId`'s online status, after privacy and blocks. */
export async function presenceFor(viewerId: string, ownerId: string): Promise<PresenceDTO> {
  const owner = await db.user.findUnique({
    where: { id: ownerId },
    select: { id: true, lastSeenAudience: true, lastSeenAt: true },
  });
  if (!owner || !(await canSeeLastSeen(viewerId, owner))) return { visible: false };
  const live = await isOnline(owner.id);
  const recent = owner.lastSeenAt !== null && Date.now() - owner.lastSeenAt.getTime() < ONLINE_WINDOW_MS;
  return { visible: true, online: live ?? recent, lastSeenAt: owner.lastSeenAt?.toISOString() ?? null };
}

/**
 * Push a user's online/offline change to their recent 1:1 partners, each
 * filtered through the user's "last seen" privacy setting.
 */
export async function broadcastPresence(userId: string) {
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const chats = await db.chat.findMany({
    where: { type: "DIRECT", lastMessageAt: { gt: since }, members: { some: { userId } } },
    select: { members: { where: { userId: { not: userId } }, select: { userId: true } } },
    orderBy: { lastMessageAt: "desc" },
    take: 200,
  });
  const peers = chats.flatMap((c) => c.members.map((m) => m.userId));
  for (const peerId of peers) {
    const presence = await presenceFor(peerId, userId);
    if (presence.visible) await publishToUsers([peerId], "presence", { userId, presence });
  }
}
