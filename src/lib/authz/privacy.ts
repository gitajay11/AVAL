import "server-only";
import type { Audience } from "@/generated/prisma/client";
import { db } from "@/lib/db";

/** Stable key for the 1:1 chat between two users, independent of order. */
export function directKey(a: string, b: string): string {
  return a < b ? `${a}:${b}` : `${b}:${a}`;
}

/**
 * Privacy "contacts": `ownerId` counts `viewerId` as a contact once the owner has
 * sent them a message (in their 1:1 chat). Group chats will count too (phase 5).
 */
export async function hasMessaged(ownerId: string, viewerId: string): Promise<boolean> {
  const chat = await db.chat.findUnique({ where: { directKey: directKey(ownerId, viewerId) }, select: { id: true } });
  if (!chat) return false;
  const msg = await db.message.findFirst({ where: { chatId: chat.id, senderId: ownerId }, select: { id: true } });
  return msg !== null;
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

/** Ids among `others` that `userId` has blocked or been blocked by. */
export async function blockedAmong(userId: string, others: string[]): Promise<Set<string>> {
  if (others.length === 0) return new Set();
  const rows = await db.block.findMany({
    where: {
      OR: [
        { blockerId: userId, blockedId: { in: others } },
        { blockedId: userId, blockerId: { in: others } },
      ],
    },
    select: { blockerId: true, blockedId: true },
  });
  return new Set(rows.map((r) => (r.blockerId === userId ? r.blockedId : r.blockerId)));
}

/** Pure audience rule; `isContact` is only consulted for CONTACTS. */
export function audienceAllows(audience: Audience, isSelf: boolean, isContact: () => Promise<boolean>): Promise<boolean> {
  if (isSelf) return Promise.resolve(true);
  if (audience === "EVERYONE") return Promise.resolve(true);
  if (audience === "NOBODY") return Promise.resolve(false);
  return isContact();
}

type Owner = { id: string; avatarAudience: Audience; lastSeenAudience: Audience; messageAudience: Audience };

/** Can `viewerId` see the owner's profile photo? Blocks hide it both ways. */
export async function canSeeAvatar(viewerId: string, owner: Pick<Owner, "id" | "avatarAudience">): Promise<boolean> {
  if (viewerId === owner.id) return true;
  if (await isBlockedEitherWay(viewerId, owner.id)) return false;
  return audienceAllows(owner.avatarAudience, false, () => hasMessaged(owner.id, viewerId));
}

/** Can `viewerId` see the owner's online status and last seen? */
export async function canSeeLastSeen(viewerId: string, owner: Pick<Owner, "id" | "lastSeenAudience">): Promise<boolean> {
  if (viewerId === owner.id) return true;
  if (await isBlockedEitherWay(viewerId, owner.id)) return false;
  return audienceAllows(owner.lastSeenAudience, false, () => hasMessaged(owner.id, viewerId));
}

/**
 * Can `senderId` message the recipient? EVERYONE: anyone not blocked.
 * CONTACTS: only people the recipient has messaged before.
 */
export async function canMessage(senderId: string, recipient: Pick<Owner, "id" | "messageAudience">): Promise<string | null> {
  if (senderId === recipient.id) return null;
  if (await isBlockedEitherWay(senderId, recipient.id)) return "You can't message this person.";
  const allowed = await audienceAllows(
    recipient.messageAudience === "NOBODY" ? "CONTACTS" : recipient.messageAudience,
    false,
    () => hasMessaged(recipient.id, senderId),
  );
  return allowed ? null : "This person only accepts messages from people they've messaged.";
}
