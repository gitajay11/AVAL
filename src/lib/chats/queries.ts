import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { contactAvatarUrl } from "@/lib/contacts/urls";
import { groupAvatarUrl } from "@/lib/groups/urls";
import { avatarUrl } from "@/lib/users";
import { PAGE_SIZE } from "@/lib/validation/chat";
import { encodeCursor, type Cursor } from "./cursor";
import type {
  MessageWindow,
  AttachmentDTO,
  ChatListItemDTO,
  LinkPreviewDTO,
  MediaKind,
  MessageDTO,
  MessagePage,
  MessageType,
  ReactionDTO,
} from "./types";

type ChatRow = {
  id: string;
  type: ChatListItemDTO["type"];
  title: string | null;
  created_at: Date;
  last_message_at: Date | null;
  pinned_at: Date | null;
  archived_at: Date | null;
  muted_until: Date | null;
  muted: boolean;
  marked_unread: boolean;
  lm_id: string | null;
  lm_sender_id: string | null;
  lm_type: MessageType | null;
  lm_text: string | null;
  lm_created_at: Date | null;
  lm_deleted_at: Date | null;
  lm_sender_name: string | null;
  avatar_key: string | null;
  member_count: number | null;
  peer_id: string | null;
  peer_username: string | null;
  peer_display_name: string | null;
  peer_alias: string | null;
  peer_avatar_key: string | null;
  peer_avatar_visible: boolean | null;
  peer_delivered_at: Date | null;
  peer_read_at: Date | null;
  contact_id: string | null;
  contact_name: string | null;
  contact_avatar_key: string | null;
  contact_visibility: "PRIVATE" | "PUBLIC" | null;
  unread: number;
};

/**
 * The chat list in one round trip: membership state, last visible message,
 * the 1:1 peer (with photo privacy and blocks applied), the peer's receipt
 * watermarks and my unread count. Every subquery is index-backed:
 * messages(chat_id, created_at), messages(chat_id, sender_id), chat_members(user_id, …).
 */
function chatRows(me: string, opts: { chatId?: string; limit: number }) {
  // Empty chats stay out of the list, except a contact's journal (it starts empty).
  const only = opts.chatId
    ? Prisma.sql`AND c.id = ${opts.chatId}::uuid`
    : Prisma.sql`AND (c.last_message_at IS NOT NULL OR c.type = 'CONTACT')`;
  return db.$queryRaw<ChatRow[]>`
    SELECT
      c.id, c.type::text AS type, c.title, c.avatar_key, c.created_at, c.last_message_at,
      coalesce(la.alias, lu.display_name) AS lm_sender_name,
      CASE WHEN c.type = 'GROUP' THEN (SELECT count(*)::int FROM chat_members gm WHERE gm.chat_id = c.id) END AS member_count,
      cm.pinned_at, cm.archived_at, cm.muted_until, coalesce(cm.muted_until > now(), false) AS muted, cm.marked_unread,
      lm.id AS lm_id, lm.sender_id AS lm_sender_id, lm.type::text AS lm_type, lm.text AS lm_text,
      lm.created_at AS lm_created_at, lm.deleted_at AS lm_deleted_at,
      p.id AS peer_id, p.username AS peer_username, p.display_name AS peer_display_name, pa.alias AS peer_alias,
      p.avatar_key AS peer_avatar_key,
      (
        p.avatar_key IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM blocks b
          WHERE (b.blocker_id = ${me}::uuid AND b.blocked_id = p.id) OR (b.blocker_id = p.id AND b.blocked_id = ${me}::uuid)
        )
        AND (
          p.avatar_audience = 'EVERYONE'
          OR (p.avatar_audience = 'CONTACTS' AND EXISTS (SELECT 1 FROM messages pm WHERE pm.chat_id = c.id AND pm.sender_id = p.id))
        )
      ) AS peer_avatar_visible,
      pr.last_delivered_at AS peer_delivered_at, pr.last_read_at AS peer_read_at,
      pc.id AS contact_id, pc.name AS contact_name, pc.avatar_key AS contact_avatar_key,
      pc.visibility::text AS contact_visibility,
      (
        SELECT count(*)::int FROM (
          SELECT 1 FROM messages um
          WHERE um.chat_id = c.id
            AND um.created_at > COALESCE(r.last_read_at, '-infinity'::timestamp)
            AND um.created_at > COALESCE(cm.cleared_at, '-infinity'::timestamp)
            AND um.sender_id IS DISTINCT FROM ${me}::uuid
            AND um.deleted_at IS NULL
            AND NOT EXISTS (SELECT 1 FROM hidden_messages h WHERE h.message_id = um.id AND h.user_id = ${me}::uuid)
          LIMIT 999
        ) unread_rows
      ) AS unread
    FROM chat_members cm
    JOIN chats c ON c.id = cm.chat_id
    LEFT JOIN receipts r ON r.chat_id = cm.chat_id AND r.user_id = cm.user_id
    LEFT JOIN LATERAL (
      SELECT m.id, m.sender_id, m.type, m.text, m.created_at, m.deleted_at
      FROM messages m
      WHERE m.chat_id = c.id
        AND (cm.cleared_at IS NULL OR m.created_at > cm.cleared_at)
        AND NOT EXISTS (SELECT 1 FROM hidden_messages h WHERE h.message_id = m.id AND h.user_id = ${me}::uuid)
      ORDER BY m.created_at DESC, m.id DESC
      LIMIT 1
    ) lm ON true
    LEFT JOIN LATERAL (
      SELECT u.id, u.username, u.display_name, u.avatar_key, u.avatar_audience
      FROM chat_members om JOIN users u ON u.id = om.user_id
      WHERE om.chat_id = c.id AND om.user_id <> ${me}::uuid
      LIMIT 1
    ) p ON c.type = 'DIRECT'
    LEFT JOIN receipts pr ON pr.chat_id = c.id AND pr.user_id = p.id
    LEFT JOIN personal_contacts pc ON pc.id = c.contact_id
    LEFT JOIN users lu ON lu.id = lm.sender_id AND c.type = 'GROUP'
    -- My private nicknames (contact_aliases primary key: owner, target).
    LEFT JOIN contact_aliases pa ON pa.owner_id = ${me}::uuid AND pa.target_user_id = p.id
    LEFT JOIN contact_aliases la ON la.owner_id = ${me}::uuid AND la.target_user_id = lu.id
    WHERE cm.user_id = ${me}::uuid ${only}
    ORDER BY cm.pinned_at DESC NULLS LAST, COALESCE(c.last_message_at, c.created_at) DESC, c.id DESC
    LIMIT ${opts.limit}
  `;
}

function toChatItem(r: ChatRow): ChatListItemDTO {
  const peer = r.peer_id
    ? {
        id: r.peer_id,
        username: r.peer_username!,
        displayName: r.peer_display_name!,
        avatarUrl: r.peer_avatar_visible ? avatarUrl(r.peer_id, r.peer_avatar_key) : null,
      }
    : null;
  return {
    id: r.id,
    type: r.type,
    title: r.title ?? r.contact_name ?? r.peer_alias ?? peer?.displayName ?? "Chat",
    avatarUrl: r.contact_id
      ? contactAvatarUrl(r.contact_id, r.contact_avatar_key)
      : r.type === "GROUP"
        ? groupAvatarUrl(r.id, r.avatar_key)
        : (peer?.avatarUrl ?? null),
    memberCount: r.member_count,
    peer,
    contact: r.contact_id ? { id: r.contact_id, visibility: r.contact_visibility! } : null,
    lastMessage: r.lm_id
      ? {
          id: r.lm_id,
          senderId: r.lm_sender_id,
          type: r.lm_type!,
          text: r.lm_deleted_at ? null : r.lm_text,
          createdAt: r.lm_created_at!.toISOString(),
          deleted: r.lm_deleted_at !== null,
          senderName: r.lm_sender_name,
        }
      : null,
    lastActivityAt: (r.last_message_at ?? r.created_at).toISOString(),
    unread: r.unread,
    pinned: r.pinned_at !== null,
    archived: r.archived_at !== null,
    muted: r.muted, // compared in SQL: no clock read while prerendering
    markedUnread: r.marked_unread,
    peerDeliveredAt: r.peer_delivered_at?.toISOString() ?? null,
    peerReadAt: r.peer_read_at?.toISOString() ?? null,
  };
}

export const CHAT_LIST_LIMIT = 200;

/** All my chats with at least one message, archived ones included (flagged). */
export async function listChats(me: string): Promise<ChatListItemDTO[]> {
  return (await chatRows(me, { limit: CHAT_LIST_LIMIT })).map(toChatItem);
}

/** One chat as `me` sees it in the list (also works for chats with no messages yet). */
export async function getChatItem(me: string, chatId: string): Promise<ChatListItemDTO | null> {
  const [row] = await chatRows(me, { chatId, limit: 1 });
  return row ? toChatItem(row) : null;
}

/**
 * A shared contact's journal as an approved viewer sees it: no membership state
 * (pin, archive, unread), no owner identity, just the contact and its last message.
 */
export async function getViewerChatItem(
  chatId: string,
  contact: { id: string; name: string; avatarKey: string | null; visibility: "PRIVATE" | "PUBLIC"; createdAt: Date },
): Promise<ChatListItemDTO> {
  const last = await db.message.findFirst({
    where: { chatId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: { id: true, senderId: true, type: true, text: true, createdAt: true, deletedAt: true },
  });
  return {
    id: chatId,
    type: "CONTACT",
    title: contact.name,
    avatarUrl: contactAvatarUrl(contact.id, contact.avatarKey),
    peer: null,
    memberCount: null,
    contact: { id: contact.id, visibility: contact.visibility },
    lastMessage: last
      ? { id: last.id, senderId: null, type: last.type, text: last.deletedAt ? null : last.text, createdAt: last.createdAt.toISOString(), deleted: last.deletedAt !== null }
      : null,
    lastActivityAt: (last?.createdAt ?? contact.createdAt).toISOString(),
    unread: 0,
    pinned: false,
    archived: false,
    muted: false,
    markedUnread: false,
    peerDeliveredAt: null,
    peerReadAt: null,
  };
}

// ─────────────────────────── Messages ───────────────────────────

/** Everything a message bubble needs, as seen by `me` (stars are per viewer). */
export function messageSelect(me: string) {
  return {
    id: true,
    chatId: true,
    senderId: true,
    clientId: true,
    type: true,
    text: true,
    createdAt: true,
    editedAt: true,
    deletedAt: true,
    forwardedFromName: true,
    linkPreview: true,
    pinnedAt: true,
    attachments: {
      where: { status: "READY" },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        kind: true,
        mimeType: true,
        sizeBytes: true,
        fileName: true,
        width: true,
        height: true,
        durationMs: true,
        waveform: true,
      },
    },
    replyTo: { select: { id: true, senderId: true, type: true, text: true, deletedAt: true } },
    reactions: { orderBy: { createdAt: "asc" }, select: { emoji: true, userId: true } },
    starredBy: { where: { userId: me }, select: { userId: true } },
  } satisfies Prisma.MessageSelect;
}

export type MessageRow = Prisma.MessageGetPayload<{ select: ReturnType<typeof messageSelect> }>;

export const mediaUrl = (attachmentId: string) => `/api/media/${attachmentId}`;

const SNIPPET = 140;

function groupReactions(rows: { emoji: string; userId: string }[]): ReactionDTO[] {
  const by = new Map<string, string[]>();
  for (const r of rows) by.set(r.emoji, [...(by.get(r.emoji) ?? []), r.userId]);
  return [...by].map(([emoji, userIds]) => ({ emoji, userIds }));
}

export function toMessage(m: MessageRow): MessageDTO {
  const deleted = m.deletedAt !== null;
  const media = m.attachments.filter((a) => a.kind !== "LINK_PREVIEW" && a.kind !== "AVATAR");
  const previewImage = m.attachments.find((a) => a.kind === "LINK_PREVIEW");
  const lp = m.linkPreview as Omit<LinkPreviewDTO, "imageUrl"> | null;
  return {
    id: m.id,
    chatId: m.chatId,
    senderId: m.senderId,
    clientId: m.clientId,
    type: m.type,
    text: deleted ? null : m.text,
    createdAt: m.createdAt.toISOString(),
    editedAt: m.editedAt?.toISOString() ?? null,
    deleted,
    attachments: deleted
      ? []
      : media.map(
          (a): AttachmentDTO => ({
            id: a.id,
            kind: a.kind as MediaKind,
            mimeType: a.mimeType,
            sizeBytes: a.sizeBytes,
            fileName: a.fileName,
            width: a.width,
            height: a.height,
            durationMs: a.durationMs,
            waveform: Array.isArray(a.waveform) ? (a.waveform as number[]) : null,
            url: mediaUrl(a.id),
          }),
        ),
    replyTo: m.replyTo
      ? {
          id: m.replyTo.id,
          senderId: m.replyTo.senderId,
          type: m.replyTo.type,
          text: m.replyTo.deletedAt ? null : (m.replyTo.text?.slice(0, SNIPPET) ?? null),
          deleted: m.replyTo.deletedAt !== null,
        }
      : null,
    forwardedFromName: m.forwardedFromName,
    linkPreview: !deleted && lp ? { ...lp, imageUrl: previewImage ? mediaUrl(previewImage.id) : null } : null,
    reactions: deleted ? [] : groupReactions(m.reactions),
    pinnedAt: deleted ? null : (m.pinnedAt?.toISOString() ?? null),
    starred: m.starredBy.length > 0,
  };
}

/** Messages visible to `me`: after "clear history", and not deleted-for-me. */
export function visibleTo(me: string, clearedAt: Date | null): Prisma.MessageWhereInput {
  return {
    ...(clearedAt ? { createdAt: { gt: clearedAt } } : {}),
    hiddenFor: { none: { userId: me } },
  };
}

export async function getMessage(me: string, messageId: string): Promise<MessageDTO | null> {
  const row = await db.message.findUnique({ where: { id: messageId }, select: messageSelect(me) });
  return row ? toMessage(row) : null;
}

/** Newest-first keyset page, returned oldest → newest for rendering. */
export async function listMessagesBefore(
  me: string,
  chatId: string,
  clearedAt: Date | null,
  before: Cursor | null,
  limit = PAGE_SIZE,
): Promise<MessagePage> {
  const rows = await db.message.findMany({
    where: {
      chatId,
      AND: [
        visibleTo(me, clearedAt),
        before
          ? { OR: [{ createdAt: { lt: before.createdAt } }, { createdAt: before.createdAt, id: { lt: before.id } }] }
          : {},
      ],
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit + 1,
    select: messageSelect(me),
  });
  const hasMore = rows.length > limit;
  const page = rows.slice(0, limit).reverse();
  return {
    messages: page.map(toMessage),
    olderCursor: hasMore && page.length ? encodeCursor(page[0]) : null,
  };
}

/** Messages newer than a cursor (catch-up after reconnect, or polling fallback). */
export async function listMessagesAfter(
  me: string,
  chatId: string,
  clearedAt: Date | null,
  after: Cursor,
  limit = 100,
): Promise<MessageDTO[]> {
  const rows = await db.message.findMany({
    where: {
      chatId,
      AND: [
        visibleTo(me, clearedAt),
        { OR: [{ createdAt: { gt: after.createdAt } }, { createdAt: after.createdAt, id: { gt: after.id } }] },
      ],
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take: limit,
    select: messageSelect(me),
  });
  return rows.map(toMessage);
}

/** Latest pinned message in a chat that `me` can see. */
export async function latestPinned(me: string, chatId: string, clearedAt: Date | null): Promise<MessageDTO | null> {
  const row = await db.message.findFirst({
    where: { chatId, pinnedAt: { not: null }, deletedAt: null, AND: [visibleTo(me, clearedAt)] },
    orderBy: { pinnedAt: "desc" },
    select: messageSelect(me),
  });
  return row ? toMessage(row) : null;
}

const AROUND = 15;

/**
 * Up to 15 messages either side of `messageId` (which must be visible to me),
 * with cursors to keep paging in both directions. Null if it isn't visible.
 */
export async function listMessagesAround(
  me: string,
  chatId: string,
  clearedAt: Date | null,
  messageId: string,
): Promise<MessageWindow | null> {
  const target = await db.message.findFirst({
    where: { id: messageId, chatId, AND: [visibleTo(me, clearedAt)] },
    select: messageSelect(me),
  });
  if (!target) return null;
  const at = { createdAt: target.createdAt, id: target.id };
  const [older, newer] = await Promise.all([
    listMessagesBefore(me, chatId, clearedAt, at, AROUND),
    listMessagesAfter(me, chatId, clearedAt, at, AROUND + 1),
  ]);
  const hasNewer = newer.length > AROUND;
  const newerShown = newer.slice(0, AROUND);
  const lastShown = newerShown.at(-1) ?? toMessage(target);
  return {
    messages: [...older.messages, toMessage(target), ...newerShown],
    olderCursor: older.olderCursor,
    newerCursor: hasNewer ? encodeCursor(lastShown) : null,
  };
}
