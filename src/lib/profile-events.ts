import "server-only";
import { db } from "@/lib/db";
import { publishToUsers } from "@/lib/realtime/server";

/**
 * Tell everyone who shares a chat with `userId` (and the user's own other
 * devices) that their photo, name or photo privacy changed. The event carries
 * only the id: each viewer refetches, so per-viewer privacy and blocks still
 * apply to what they get back.
 */
export async function profileChanged(userId: string) {
  const others = await db.chatMember.findMany({
    where: { userId: { not: userId }, chat: { members: { some: { userId } } } },
    select: { userId: true },
    distinct: ["userId"],
  });
  await publishToUsers([userId, ...others.map((m) => m.userId)], "user.updated", { userId });
}
