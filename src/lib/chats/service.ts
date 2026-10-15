import "server-only";
import { ApiError } from "@/lib/api";
import { chatAudience, directPeerId, type Membership } from "@/lib/authz/chats";
import { canMessage, directKey, isBlockedEitherWay } from "@/lib/authz/privacy";
import { db, uniqueViolation } from "@/lib/db";
import { touchLastSeen } from "@/lib/presence";
import { publishToUsers } from "@/lib/realtime/server";
import { messageSelect, toMessage } from "./queries";
import type { MessageDTO } from "./types";

const VERIFY_FIRST = "Verify your email to start chatting.";

/** Why `me` can't send in this chat right now, or null if they can. */
export async function cantSendReason(me: { id: string; emailVerified: boolean }, m: Membership): Promise<string | null> {
  if (!me.emailVerified) return VERIFY_FIRST;
  const peerId = directPeerId(m, me.id);
  if (!peerId) return null;
  const peer = await db.user.findUnique({ where: { id: peerId }, select: { id: true, messageAudience: true } });
  if (!peer) return "This account no longer exists.";
  return canMessage(me.id, peer);
}

/** Find or create the 1:1 chat with `peerId`. Enforces verification, blocks and the peer's privacy. */
export async function startDirectChat(me: { id: string; emailVerified: boolean }, peerId: string): Promise<string> {
  if (peerId === me.id) throw new ApiError(400, "self_chat", "You can't start a chat with yourself.");
  const key = directKey(me.id, peerId);
  const existing = await db.chat.findUnique({ where: { directKey: key }, select: { id: true } });
  if (existing) return existing.id;

  if (!me.emailVerified) throw new ApiError(403, "unverified", VERIFY_FIRST);
  const peer = await db.user.findUnique({ where: { id: peerId }, select: { id: true, messageAudience: true } });
  if (!peer) throw new ApiError(404, "not_found", "User not found.");
  const reason = await canMessage(me.id, peer);
  if (reason) throw new ApiError(403, "not_allowed", reason);

  try {
    const chat = await db.chat.create({
      data: {
        type: "DIRECT",
        directKey: key,
        createdById: me.id,
        members: { create: [{ userId: me.id }, { userId: peerId }] },
      },
      select: { id: true },
    });
    return chat.id;
  } catch (err) {
    // Both users started the chat at the same moment: use the one that won.
    if (!uniqueViolation(err)) throw err;
    return (await db.chat.findUniqueOrThrow({ where: { directKey: key }, select: { id: true } })).id;
  }
}

/** Store a message (idempotent per clientId) and fan it out to every member. */
export async function sendTextMessage(
  me: { id: string; emailVerified: boolean },
  m: Membership,
  input: { clientId: string; text: string },
): Promise<MessageDTO> {
  const dupe = await db.message.findUnique({
    where: { senderId_clientId: { senderId: me.id, clientId: input.clientId } },
    select: messageSelect,
  });
  if (dupe) {
    if (dupe.chatId !== m.chat.id) throw new ApiError(409, "client_id_reused", "Duplicate message id.");
    return toMessage(dupe); // retry of a send that already succeeded
  }

  const reason = await cantSendReason(me, m);
  if (reason) throw new ApiError(403, "not_allowed", reason);

  const message = await db.$transaction(async (tx) => {
    const created = await tx.message.create({
      data: { chatId: m.chat.id, senderId: me.id, clientId: input.clientId, type: "TEXT", text: input.text },
      select: messageSelect,
    });
    await tx.chat.update({ where: { id: m.chat.id }, data: { lastMessageAt: created.createdAt } });
    // Sending implies having read everything up to this point.
    await tx.receipt.upsert({
      where: { chatId_userId: { chatId: m.chat.id, userId: me.id } },
      create: { chatId: m.chat.id, userId: me.id, lastReadAt: created.createdAt, lastDeliveredAt: created.createdAt },
      update: { lastReadAt: created.createdAt, lastDeliveredAt: created.createdAt },
    });
    // A new message brings an archived chat back for everyone else.
    await tx.chatMember.updateMany({
      where: { chatId: m.chat.id, userId: { not: me.id }, archivedAt: { not: null }, mutedUntil: null },
      data: { archivedAt: null },
    });
    return created;
  });

  const dto = toMessage(message);
  await Promise.all([publishToUsers(await chatAudience(m.chat.id), "message.new", { message: dto }), touchLastSeen(me.id)]);
  return dto;
}

/** Advance my read watermark (never backwards) and sync my other devices. */
export async function markRead(meId: string, chatId: string, upTo: Date): Promise<string> {
  const capped = upTo > new Date() ? new Date() : upTo;
  const [row] = await db.$queryRaw<{ last_read_at: Date }[]>`
    INSERT INTO receipts (chat_id, user_id, last_read_at, last_delivered_at, updated_at)
    VALUES (${chatId}::uuid, ${meId}::uuid, ${capped}, ${capped}, now())
    ON CONFLICT (chat_id, user_id) DO UPDATE SET
      last_read_at = GREATEST(receipts.last_read_at, EXCLUDED.last_read_at),
      last_delivered_at = GREATEST(receipts.last_delivered_at, EXCLUDED.last_delivered_at),
      updated_at = now()
    RETURNING last_read_at
  `;
  await db.chatMember.updateMany({ where: { chatId, userId: meId, markedUnread: true }, data: { markedUnread: false } });
  const lastReadAt = row.last_read_at.toISOString();
  await publishToUsers([meId], "chat.read", { chatId, lastReadAt });
  return lastReadAt;
}

/** Relay "typing…" to the other members. Nothing is stored. */
export async function relayTyping(meId: string, m: Membership) {
  const peerId = directPeerId(m, meId);
  if (peerId && (await isBlockedEitherWay(meId, peerId))) return;
  const others = (await chatAudience(m.chat.id)).filter((id) => id !== meId);
  await publishToUsers(others, "typing", { chatId: m.chat.id, userId: meId });
}
