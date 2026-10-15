import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { avatarUrl } from "@/lib/users";
import { PAGE_SIZE } from "@/lib/validation/chat";
import { encodeCursor, type Cursor } from "./cursor";
import type { ChatListItemDTO, MessageDTO, MessagePage, MessageType } from "./types";

type ChatRow = {
  id: string;
  type: ChatListItemDTO["type"];
  title: string | null;
  created_at: Date;
  last_message_at: Date | null;
  pinned_at: Date | null;
  muted_until: Date | null;
  marked_unread: boolean;
  lm_id: string | null;
  lm_sender_id: string | null;
  lm_type: MessageType | null;
  lm_text: string | null;
  lm_created_at: Date | null;
  lm_deleted_at: Date | null;
  peer_id: string | null;
  peer_username: string | null;
  peer_display_name: string | null;
  peer_avatar_key: string | null;
  peer_avatar_visible: boolean | null;
  unread: number;
};

/**
 * The chat list in one round trip: membership state, last visible message,
 * the 1:1 peer (with photo privacy and blocks applied) and the unread count.
 * Every subquery is served by an index: messages(chat_id, created_at),
 * messages(chat_id, sender_id), chat_members(user_id, archived_at).
 */
function chatRows(me: string, opts: { chatId?: string; limit: number }) {
  const only = opts.chatId
    ? Prisma.sql`AND c.id = ${opts.chatId}::uuid`
    : Prisma.sql`AND cm.archived_at IS NULL AND c.last_message_at IS NOT NULL`;
  return db.$queryRaw<ChatRow[]>`
    SELECT
      c.id, c.type::text AS type, c.title, c.created_at, c.last_message_at,
      cm.pinned_at, cm.muted_until, cm.marked_unread,
      lm.id AS lm_id, lm.sender_id AS lm_sender_id, lm.type::text AS lm_type, lm.text AS lm_text,
      lm.created_at AS lm_created_at, lm.deleted_at AS lm_deleted_at,
      p.id AS peer_id, p.username AS peer_username, p.display_name AS peer_display_name,
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
    title: r.title ?? peer?.displayName ?? "Chat",
    avatarUrl: peer?.avatarUrl ?? null,
    peer,
    lastMessage: r.lm_id
      ? {
          id: r.lm_id,
          senderId: r.lm_sender_id,
          type: r.lm_type!,
          text: r.lm_deleted_at ? null : r.lm_text,
          createdAt: r.lm_created_at!.toISOString(),
          deleted: r.lm_deleted_at !== null,
        }
      : null,
    lastActivityAt: (r.last_message_at ?? r.created_at).toISOString(),
    unread: r.unread,
    pinned: r.pinned_at !== null,
    muted: r.muted_until !== null && r.muted_until > new Date(),
    markedUnread: r.marked_unread,
  };
}

export const CHAT_LIST_LIMIT = 100;

export async function listChats(me: string): Promise<ChatListItemDTO[]> {
  return (await chatRows(me, { limit: CHAT_LIST_LIMIT })).map(toChatItem);
}

/** One chat as `me` sees it in the list (also works for chats with no messages yet). */
export async function getChatItem(me: string, chatId: string): Promise<ChatListItemDTO | null> {
  const [row] = await chatRows(me, { chatId, limit: 1 });
  return row ? toChatItem(row) : null;
}

type MessageRow = {
  id: string;
  chatId: string;
  senderId: string | null;
  clientId: string | null;
  type: MessageType;
  text: string | null;
  createdAt: Date;
  editedAt: Date | null;
  deletedAt: Date | null;
};

export const messageSelect = {
  id: true,
  chatId: true,
  senderId: true,
  clientId: true,
  type: true,
  text: true,
  createdAt: true,
  editedAt: true,
  deletedAt: true,
} as const;

export function toMessage(m: MessageRow): MessageDTO {
  return {
    id: m.id,
    chatId: m.chatId,
    senderId: m.senderId,
    clientId: m.clientId,
    type: m.type,
    text: m.deletedAt ? null : m.text,
    createdAt: m.createdAt.toISOString(),
    editedAt: m.editedAt?.toISOString() ?? null,
    deleted: m.deletedAt !== null,
  };
}

/** Messages visible to `me`: after "clear history", and not deleted-for-me. */
function visibleTo(me: string, clearedAt: Date | null): Prisma.MessageWhereInput {
  return {
    ...(clearedAt ? { createdAt: { gt: clearedAt } } : {}),
    hiddenFor: { none: { userId: me } },
  };
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
    select: messageSelect,
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
    select: messageSelect,
  });
  return rows.map(toMessage);
}
