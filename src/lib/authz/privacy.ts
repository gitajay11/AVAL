import "server-only";
import type { Audience } from "@/generated/prisma/client";
import { db } from "@/lib/db";

/** Stable key for the 1:1 chat between two users, independent of order. */
export function directKey(a: string, b: string): string {
  return a < b ? `${a}:${b}` : `${b}:${a}`;
}

/** "Contacts" for privacy purposes: the two users share a 1:1 chat. */
export async function shareDirectChat(a: string, b: string): Promise<boolean> {
  const chat = await db.chat.findUnique({ where: { directKey: directKey(a, b) }, select: { id: true } });
  return chat !== null;
}

/** True if either user has blocked the other. */
export async function isBlockedEitherWay(a: string, b: string): Promise<boolean> {
  const block = await db.block.findFirst({
    where: {
      OR: [
        { blockerId: a, blockedId: b },
        { blockerId: b, blockedId: a },
      ],
    },
    select: { blockerId: true },
  });
  return block !== null;
}

/** Pure audience rule; `isContact` is only consulted for CONTACTS. */
export function audienceAllows(audience: Audience, isSelf: boolean, isContact: () => Promise<boolean>): Promise<boolean> {
  if (isSelf) return Promise.resolve(true);
  if (audience === "EVERYONE") return Promise.resolve(true);
  if (audience === "NOBODY") return Promise.resolve(false);
  return isContact();
}

/** Can `viewerId` see `ownerId`'s profile photo? Blocks hide it both ways. */
export async function canSeeAvatar(viewerId: string, owner: { id: string; avatarAudience: Audience }): Promise<boolean> {
  if (viewerId === owner.id) return true;
  if (await isBlockedEitherWay(viewerId, owner.id)) return false;
  return audienceAllows(owner.avatarAudience, false, () => shareDirectChat(viewerId, owner.id));
}
