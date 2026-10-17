import "server-only";
import { after } from "next/server";
import { Prisma } from "@/generated/prisma/client";
import { ApiError } from "@/lib/api";
import { chatMembers, directPeerId, getMembership, requireMessage, type Membership } from "@/lib/authz/chats";
import { chatAudience } from "@/lib/authz/contacts";
import { canMessage, directKey, isBlockedEitherWay } from "@/lib/authz/privacy";
import { db, uniqueViolation } from "@/lib/db";
import { uuidv7 } from "@/lib/ids";
import { attachLinkPreview, firstUrl } from "@/lib/link-preview";
import { deleteAttachments } from "@/lib/media/storage";
import { touchLastSeen } from "@/lib/presence";
import { pushNewMessage } from "@/lib/push/notify";
import { publishToUsers } from "@/lib/realtime/server";
import { EDIT_WINDOW_MS, MAX_PINNED_CHATS } from "@/lib/validation/chat";
import { broadcast, rebroadcast } from "./broadcast";
import { getMessage, messageSelect, toMessage } from "./queries";
import type { ChatSettingsDTO, MessageDTO, MessageType } from "./types";

type Me = { id: string; emailVerified: boolean };

const VERIFY_FIRST = "Verify your email to start chatting.";

/** Why `me` can't send in this chat right now, or null if they can. */
export async function cantSendReason(me: Me, m: Membership): Promise<string | null> {
  if (!me.emailVerified) return VERIFY_FIRST;
  const peerId = directPeerId(m, me.id);
  if (!peerId) return null;
  // One query: the peer, plus any block between us in either direction.
  const peer = await db.user.findUnique({
    where: { id: peerId },
    select: {
      id: true,
      messageAudience: true,
      blocksMade: { where: { blockedId: me.id }, select: { blockerId: true }, take: 1 },
      blocksReceived: { where: { blockerId: me.id }, select: { blockerId: true }, take: 1 },
    },
  });
  if (!peer) return "This account no longer exists.";
  return canMessage(me.id, peer, { senderBlocked: peer.blocksReceived.length > 0, recipientBlocked: peer.blocksMade.length > 0 });
}

async function requireCanSend(me: Me, m: Membership) {
  const reason = await cantSendReason(me, m);
  if (reason) throw new ApiError(403, "not_allowed", reason);
}

// ─────────────────────────── Chats ───────────────────────────

/** Find or create the 1:1 chat with `peerId`. Enforces verification, blocks and the peer's privacy. */
export async function startDirectChat(me: Me, peerId: string): Promise<string> {
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
      data: { type: "DIRECT", directKey: key, createdById: me.id, members: { create: [{ userId: me.id }, { userId: peerId }] } },
      select: { id: true },
    });
    return chat.id;
  } catch (err) {
    // Both users started the chat at the same moment: use the one that won.
    if (!uniqueViolation(err)) throw err;
    return (await db.chat.findUniqueOrThrow({ where: { directKey: key }, select: { id: true } })).id;
  }
}

const FOREVER = new Date("9999-12-31T00:00:00Z");

/** Per-user chat list state: pin, archive, mute, mark unread. Synced to my other devices. */
export async function updateChatSettings(
  meId: string,
  chatId: string,
  input: { pinned?: boolean; archived?: boolean; markedUnread?: boolean; mute?: "8h" | "1w" | "forever" | "off" },
): Promise<ChatSettingsDTO> {
  const data: Prisma.ChatMemberUpdateInput = {};
  if (input.pinned !== undefined) {
    if (input.pinned) {
      const count = await db.chatMember.count({ where: { userId: meId, pinnedAt: { not: null }, chatId: { not: chatId } } });
      if (count >= MAX_PINNED_CHATS) throw new ApiError(400, "pin_limit", `You can pin up to ${MAX_PINNED_CHATS} chats.`);
    }
    data.pinnedAt = input.pinned ? new Date() : null;
  }
  if (input.archived !== undefined) {
    data.archivedAt = input.archived ? new Date() : null;
    if (input.archived) data.pinnedAt = null; // archived chats leave the pinned section
  }
  if (input.markedUnread !== undefined) data.markedUnread = input.markedUnread;
  if (input.mute !== undefined) {
    const now = Date.now();
    data.mutedUntil =
      input.mute === "off" ? null : input.mute === "8h" ? new Date(now + 8 * 3600_000) : input.mute === "1w" ? new Date(now + 7 * 86400_000) : FOREVER;
  }
  const row = await db.chatMember.update({
    where: { chatId_userId: { chatId, userId: meId } },
    data,
    select: { pinnedAt: true, archivedAt: true, mutedUntil: true, markedUnread: true },
  });
  const settings: ChatSettingsDTO = {
    pinned: row.pinnedAt !== null,
    archived: row.archivedAt !== null,
    muted: row.mutedUntil !== null && row.mutedUntil > new Date(),
    markedUnread: row.markedUnread,
  };
  await publishToUsers([meId], "chat.settings", { chatId, ...settings });
  return settings;
}

// ─────────────────────────── Sending ───────────────────────────

const TYPE_FOR_KIND: Record<string, MessageType> = { IMAGE: "IMAGE", VIDEO: "VIDEO", VOICE: "VOICE", FILE: "FILE" };

/**
 * Store a message (idempotent per clientId) with an optional confirmed
 * attachment and reply, then fan it out to every member.
 */
export async function sendMessage(
  me: Me,
  m: Membership,
  input: { clientId: string; text: string; attachmentId?: string; replyToId?: string },
): Promise<MessageDTO> {
  const findDupe = () =>
    db.message.findUnique({ where: { senderId_clientId: { senderId: me.id, clientId: input.clientId } }, select: messageSelect(me.id) });
  // Independent checks run together (one round trip instead of four).
  const [dupe, cantSend, a, target] = await Promise.all([
    findDupe(),
    cantSendReason(me, m),
    input.attachmentId ? db.attachment.findUnique({ where: { id: input.attachmentId } }) : null,
    input.replyToId
      ? db.message.findFirst({ where: { id: input.replyToId, chatId: m.chat.id, type: { not: "SYSTEM" } }, select: { id: true } })
      : null,
  ]);
  if (dupe) {
    if (dupe.chatId !== m.chat.id) throw new ApiError(409, "client_id_reused", "Duplicate message id.");
    return toMessage(dupe); // retry of a send that already succeeded
  }
  if (cantSend) throw new ApiError(403, "not_allowed", cantSend);

  let type: MessageType = "TEXT";
  if (input.attachmentId) {
    // Must be my own confirmed upload, made for this chat, not yet used.
    if (!a || a.uploaderId !== me.id || a.status !== "READY" || a.messageId || !a.objectKey.startsWith(`chats/${m.chat.id}/`)) {
      throw new ApiError(400, "bad_attachment", "That upload can't be sent. Please try again.");
    }
    type = TYPE_FOR_KIND[a.kind] ?? "FILE";
  }
  if (input.replyToId && !target) throw new ApiError(400, "bad_reply", "The message you replied to is gone.");

  // Every write in one atomic statement (one round trip instead of a 7-step
  // transaction): the message, its attachment, the chat's last-activity time,
  // my receipt (sending implies having read up to here), and un-archiving the
  // chat for other members who haven't muted it.
  const id = uuidv7();
  const now = new Date();
  try {
    await db.$executeRaw`
      WITH msg AS (
        INSERT INTO messages (id, chat_id, sender_id, client_id, type, text, reply_to_id, created_at)
        VALUES (${id}::uuid, ${m.chat.id}::uuid, ${me.id}::uuid, ${input.clientId}, ${type}::"MessageType",
                ${input.text || null}, ${input.replyToId ?? null}::uuid, ${now}::timestamp)
        RETURNING id, created_at
      ),
      att AS (
        UPDATE attachments SET message_id = msg.id FROM msg
        WHERE attachments.id = ${input.attachmentId ?? null}::uuid
        RETURNING attachments.id
      ),
      ch AS (
        UPDATE chats SET last_message_at = msg.created_at, updated_at = msg.created_at FROM msg
        WHERE chats.id = ${m.chat.id}::uuid
        RETURNING chats.id
      ),
      rc AS (
        INSERT INTO receipts (chat_id, user_id, last_delivered_at, last_read_at, updated_at)
        SELECT ${m.chat.id}::uuid, ${me.id}::uuid, created_at, created_at, created_at FROM msg
        ON CONFLICT (chat_id, user_id) DO UPDATE
          SET last_delivered_at = EXCLUDED.last_delivered_at, last_read_at = EXCLUDED.last_read_at, updated_at = EXCLUDED.updated_at
        RETURNING chat_id
      ),
      un AS (
        UPDATE chat_members SET archived_at = NULL
        WHERE chat_id = ${m.chat.id}::uuid AND user_id <> ${me.id}::uuid AND archived_at IS NOT NULL AND muted_until IS NULL
        RETURNING user_id
      )
      SELECT 1`;
  } catch (err) {
    // Two requests with the same clientId raced: the other one stored it.
    const again = await findDupe();
    if (again && again.chatId === m.chat.id) return toMessage(again);
    throw err;
  }

  const dto = (await getMessage(me.id, id))!;
  // Recipients hear about it right after the response is sent; the sender
  // already has the message from this response.
  after(() => Promise.all([broadcast("message.new", dto), touchLastSeen(me.id)]));
  after(() => pushNewMessage(dto));
  if (input.text && firstUrl(input.text)) after(() => attachLinkPreview(me.id, id));
  return dto;
}

/** Copy a message into other chats I can send to. Media objects are shared, not duplicated. */
export async function forwardMessage(me: Me, messageId: string, chatIds: string[]): Promise<string[]> {
  const { message } = await requireMessage(me.id, messageId);
  if (message.deletedAt) throw new ApiError(400, "deleted", "That message was deleted.");
  if (message.type === "SYSTEM") throw new ApiError(400, "system", "That can't be forwarded.");
  const source = await db.message.findUniqueOrThrow({
    where: { id: messageId },
    select: {
      sender: { select: { displayName: true } },
      attachments: { where: { status: "READY" }, select: { kind: true, objectKey: true, mimeType: true, sizeBytes: true, fileName: true, width: true, height: true, durationMs: true, waveform: true } },
    },
  });
  const origin = message.forwardedFromName ?? source.sender?.displayName ?? "Unknown";

  const targets: Membership[] = [];
  for (const chatId of [...new Set(chatIds)]) {
    const target = await getMembership(me.id, chatId);
    if (!target) throw new ApiError(404, "not_found", "Chat not found.");
    await requireCanSend(me, target);
    targets.push(target);
  }

  const sent: string[] = [];
  for (const t of targets) {
    const row = await db.$transaction(async (tx) => {
      const created = await tx.message.create({
        data: {
          chatId: t.chat.id,
          senderId: me.id,
          type: message.type,
          text: message.text,
          forwardedFromId: message.id,
          forwardedFromName: origin,
          linkPreview: (message.linkPreview ?? undefined) as Prisma.InputJsonValue | undefined,
        },
        select: { id: true, createdAt: true },
      });
      if (source.attachments.length) {
        await tx.attachment.createMany({
          data: source.attachments.map((a) => ({
            ...a,
            waveform: a.waveform ?? undefined,
            uploaderId: me.id,
            messageId: created.id,
            status: "READY" as const,
          })),
        });
      }
      await tx.chat.update({ where: { id: t.chat.id }, data: { lastMessageAt: created.createdAt } });
      await tx.receipt.upsert({
        where: { chatId_userId: { chatId: t.chat.id, userId: me.id } },
        create: { chatId: t.chat.id, userId: me.id, lastReadAt: created.createdAt, lastDeliveredAt: created.createdAt },
        update: { lastReadAt: created.createdAt, lastDeliveredAt: created.createdAt },
      });
      return created;
    });
    const dto = (await getMessage(me.id, row.id))!;
    await broadcast("message.new", dto);
    after(() => pushNewMessage(dto));
    sent.push(row.id);
  }
  return sent;
}

// ─────────────────────────── Changing messages ───────────────────────────

/** Edit my own message's text (or caption) within 48 hours. */
export async function editMessage(me: Me, messageId: string, text: string): Promise<MessageDTO> {
  const { message, membership } = await requireMessage(me.id, messageId);
  if (message.senderId !== me.id || message.type === "SYSTEM") throw new ApiError(403, "not_owner", "You can only edit your own messages.");
  if (message.deletedAt) throw new ApiError(400, "deleted", "That message was deleted.");
  if (Date.now() - message.createdAt.getTime() > EDIT_WINDOW_MS) {
    throw new ApiError(400, "too_old", "Messages can only be edited for 48 hours.");
  }
  if (message.type === "TEXT" && !text) throw new ApiError(400, "empty", "Message is empty.");
  await requireCanSend(me, membership);

  const urlChanged = firstUrl(text) !== firstUrl(message.text ?? "");
  await db.message.update({
    where: { id: messageId },
    data: { text: text || null, editedAt: new Date(), ...(urlChanged ? { linkPreview: Prisma.DbNull } : {}) },
  });
  if (urlChanged) {
    await deleteAttachments({ ids: (await db.attachment.findMany({ where: { messageId, kind: "LINK_PREVIEW" }, select: { id: true } })).map((a) => a.id) });
    if (firstUrl(text)) after(() => attachLinkPreview(me.id, messageId));
  }
  return (await rebroadcast(me.id, messageId))!;
}

/** Delete my message for everyone: content, media and reactions are removed; a placeholder remains. */
export async function deleteForEveryone(meId: string, messageId: string): Promise<MessageDTO> {
  const { message, membership } = await requireMessage(meId, messageId);
  // Your own messages anywhere; in groups, admins may also delete anyone's.
  const groupAdmin = membership.chat.type === "GROUP" && (membership.role === "OWNER" || membership.role === "ADMIN");
  if (message.type === "SYSTEM" || (message.senderId !== meId && !groupAdmin)) {
    throw new ApiError(403, "not_owner", "You can only delete your own messages for everyone.");
  }
  if (!message.deletedAt) {
    await db.$transaction([
      db.message.update({
        where: { id: messageId },
        data: { deletedAt: new Date(), text: null, linkPreview: Prisma.DbNull, pinnedAt: null, pinnedById: null },
      }),
      db.reaction.deleteMany({ where: { messageId } }),
      db.starredMessage.deleteMany({ where: { messageId } }),
    ]);
    await deleteAttachments({ messageId });
  }
  return (await rebroadcast(meId, messageId))!;
}

/** Delete for me: hidden only from my own view, on all my devices. */
export async function hideForMe(meId: string, messageId: string) {
  const { message } = await requireMessage(meId, messageId);
  await db.hiddenMessage.upsert({
    where: { messageId_userId: { messageId, userId: meId } },
    create: { messageId, userId: meId },
    update: {},
  });
  await db.starredMessage.deleteMany({ where: { messageId, userId: meId } });
  await publishToUsers([meId], "message.hidden", { chatId: message.chatId, messageId });
}

/** Set or clear my reaction (one per person per message). */
export async function setReaction(me: Me, messageId: string, emoji: string | null) {
  const { message, membership } = await requireMessage(me.id, messageId);
  if (message.deletedAt) throw new ApiError(400, "deleted", "That message was deleted.");
  if (message.type === "SYSTEM") throw new ApiError(400, "system", "You can't react to that.");
  const peerId = directPeerId(membership, me.id);
  if (peerId && (await isBlockedEitherWay(me.id, peerId))) throw new ApiError(403, "blocked", "You can't react in this chat.");

  if (emoji) {
    await db.reaction.upsert({
      where: { messageId_userId: { messageId, userId: me.id } },
      create: { messageId, userId: me.id, emoji },
      update: { emoji, createdAt: new Date() },
    });
  } else {
    await db.reaction.deleteMany({ where: { messageId, userId: me.id } });
  }
  await publishToUsers(await chatAudience(message.chatId), "reaction", { chatId: message.chatId, messageId, userId: me.id, emoji });
}

/** Pin or unpin a message for everyone in the chat. */
export async function setPinned(meId: string, messageId: string, pinned: boolean): Promise<MessageDTO> {
  const { message, membership } = await requireMessage(meId, messageId);
  if (message.deletedAt) throw new ApiError(400, "deleted", "That message was deleted.");
  if (message.type === "SYSTEM") throw new ApiError(400, "system", "That can't be pinned.");
  if (membership.chat.type === "GROUP" && membership.role === "MEMBER") {
    throw new ApiError(403, "not_admin", "Only group admins can pin messages.");
  }
  await db.message.update({
    where: { id: messageId },
    data: pinned ? { pinnedAt: new Date(), pinnedById: meId } : { pinnedAt: null, pinnedById: null },
  });
  return (await rebroadcast(meId, messageId))!;
}

/** Save to / remove from my starred messages. Private to me. */
export async function setStarred(meId: string, messageId: string, starred: boolean) {
  const { message } = await requireMessage(meId, messageId);
  if (starred) {
    if (message.deletedAt) throw new ApiError(400, "deleted", "That message was deleted.");
    await db.starredMessage.upsert({
      where: { messageId_userId: { messageId, userId: meId } },
      create: { messageId, userId: meId },
      update: {},
    });
  } else {
    await db.starredMessage.deleteMany({ where: { messageId, userId: meId } });
  }
  await publishToUsers([meId], "message.starred", { chatId: message.chatId, messageId, starred });
}

// ─────────────────────────── Receipts ───────────────────────────

/** Tell the other members about my new watermarks (drives their ✓✓). */
async function publishReceipt(meId: string, chatId: string, lastDeliveredAt: Date | null, lastReadAt: Date | null) {
  const others = (await chatMembers(chatId)).filter((id) => id !== meId);
  await publishToUsers(others, "receipt", {
    chatId,
    userId: meId,
    lastDeliveredAt: lastDeliveredAt?.toISOString() ?? null,
    lastReadAt: lastReadAt?.toISOString() ?? null,
  });
}

/** Advance my read watermark (never backwards), sync my devices, notify the sender. */
export async function markRead(meId: string, chatId: string, upTo: Date): Promise<string> {
  const capped = upTo > new Date() ? new Date() : upTo;
  const [row] = await db.$queryRaw<{ last_read_at: Date; last_delivered_at: Date }[]>`
    INSERT INTO receipts (chat_id, user_id, last_read_at, last_delivered_at, updated_at)
    VALUES (${chatId}::uuid, ${meId}::uuid, ${capped}, ${capped}, now())
    ON CONFLICT (chat_id, user_id) DO UPDATE SET
      last_read_at = GREATEST(receipts.last_read_at, EXCLUDED.last_read_at),
      last_delivered_at = GREATEST(receipts.last_delivered_at, EXCLUDED.last_delivered_at),
      updated_at = now()
    RETURNING last_read_at, last_delivered_at
  `;
  await db.chatMember.updateMany({ where: { chatId, userId: meId, markedUnread: true }, data: { markedUnread: false } });
  await Promise.all([
    publishToUsers([meId], "chat.read", { chatId, lastReadAt: row.last_read_at.toISOString() }),
    publishReceipt(meId, chatId, row.last_delivered_at, row.last_read_at),
  ]);
  return row.last_read_at.toISOString();
}

/**
 * "Delivered" = the message reached one of my devices. Advances my delivered
 * watermark in every chat with newer messages, in one statement, and tells
 * the senders. Called when the chat list loads and when new messages arrive.
 */
export async function markAllDelivered(meId: string) {
  const rows = await db.$queryRaw<{ chat_id: string; last_delivered_at: Date; last_read_at: Date | null }[]>`
    WITH stale AS (
      SELECT cm.chat_id
      FROM chat_members cm
      JOIN chats c ON c.id = cm.chat_id
      LEFT JOIN receipts r ON r.chat_id = cm.chat_id AND r.user_id = cm.user_id
      WHERE cm.user_id = ${meId}::uuid
        AND c.last_message_at IS NOT NULL
        AND (r.last_delivered_at IS NULL OR r.last_delivered_at < c.last_message_at)
    )
    INSERT INTO receipts (chat_id, user_id, last_delivered_at, updated_at)
    SELECT chat_id, ${meId}::uuid, now(), now() FROM stale
    ON CONFLICT (chat_id, user_id) DO UPDATE SET
      last_delivered_at = GREATEST(receipts.last_delivered_at, EXCLUDED.last_delivered_at),
      updated_at = now()
    RETURNING chat_id, last_delivered_at, last_read_at
  `;
  await Promise.all(rows.map((r) => publishReceipt(meId, r.chat_id, r.last_delivered_at, r.last_read_at)));
}

/** Relay "typing…" to the other members. Nothing is stored. */
export async function relayTyping(meId: string, m: Membership) {
  const peerId = directPeerId(m, meId);
  if (peerId && (await isBlockedEitherWay(meId, peerId))) return;
  if (m.chat.type === "CONTACT") return; // a journal has no one to type to
  const others = (await chatMembers(m.chat.id)).filter((id) => id !== meId);
  await publishToUsers(others, "typing", { chatId: m.chat.id, userId: meId });
}
