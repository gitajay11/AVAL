import "server-only";
import { ApiError } from "@/lib/api";
import { db } from "@/lib/db";
import { uuid } from "@/lib/validation/common";

export type Membership = NonNullable<Awaited<ReturnType<typeof findMembership>>>;

function findMembership(userId: string, chatId: string) {
  return db.chatMember.findUnique({
    where: { chatId_userId: { chatId, userId } },
    select: {
      role: true,
      joinedAt: true,
      clearedAt: true,
      chat: { select: { id: true, type: true, directKey: true } },
    },
  });
}

/**
 * The caller's membership in a chat, or null. Non-members get exactly the same
 * answer as a chat that doesn't exist, so ids can't be probed.
 */
export async function getMembership(userId: string, chatId: string): Promise<Membership | null> {
  if (!uuid.safeParse(chatId).success) return null;
  return findMembership(userId, chatId);
}

/** For route handlers: membership or 404. */
export async function requireMembership(userId: string, chatId: string): Promise<Membership> {
  const m = await getMembership(userId, chatId);
  if (!m) throw new ApiError(404, "not_found", "Chat not found.");
  return m;
}

/** The other participant of a 1:1 chat. */
export function directPeerId(m: Membership, userId: string): string | null {
  if (m.chat.type !== "DIRECT" || !m.chat.directKey) return null;
  const [a, b] = m.chat.directKey.split(":");
  return a === userId ? b : a;
}

/** User ids that should receive real-time events for a chat. */
export async function chatAudience(chatId: string): Promise<string[]> {
  const members = await db.chatMember.findMany({ where: { chatId }, select: { userId: true } });
  return members.map((m) => m.userId);
}

/**
 * A message the caller may act on: they're a member of its chat and haven't
 * hidden it or cleared it away. Otherwise 404, indistinguishable from missing.
 */
export async function requireMessage(userId: string, messageId: string) {
  const id = uuid.safeParse(messageId);
  const message = id.success
    ? await db.message.findUnique({
        where: { id: id.data },
        select: {
          id: true,
          chatId: true,
          senderId: true,
          type: true,
          text: true,
          createdAt: true,
          deletedAt: true,
          pinnedAt: true,
          forwardedFromName: true,
          linkPreview: true,
          hiddenFor: { where: { userId }, select: { userId: true } },
        },
      })
    : null;
  const membership = message ? await getMembership(userId, message.chatId) : null;
  if (
    !message ||
    !membership ||
    message.hiddenFor.length > 0 ||
    (membership.clearedAt && message.createdAt <= membership.clearedAt)
  ) {
    throw new ApiError(404, "not_found", "Message not found.");
  }
  return { message, membership };
}
