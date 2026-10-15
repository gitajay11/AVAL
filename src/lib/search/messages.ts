import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { encodeCursor, type Cursor } from "@/lib/chats/cursor";
import { listChats, messageSelect, toMessage } from "@/lib/chats/queries";
import type { SearchHit, SearchPage } from "./types";
import { db } from "@/lib/db";
import { toTsQuery } from "./tsquery";

const PAGE = 30;

export type { SearchHit, SearchPage };

/** Load full DTOs for ids in the given order, plus sender names. */
async function hydrate(me: string, ids: string[]) {
  const rows = await db.message.findMany({
    where: { id: { in: ids } },
    select: { ...messageSelect(me), sender: { select: { displayName: true } } },
  });
  const byId = new Map(rows.map((r) => [r.id, r]));
  return ids.flatMap((id) => {
    const r = byId.get(id);
    return r ? [{ message: toMessage(r), senderName: r.sender?.displayName ?? null }] : [];
  });
}

const cursorSql = (before: Cursor | null) =>
  before ? Prisma.sql`AND (m.created_at, m.id) < (${before.createdAt}, ${before.id}::uuid)` : Prisma.empty;

/**
 * Full-text search inside one chat I can read. Uses the GIN index on
 * search_vector and the same visibility rules as the message list.
 */
export async function searchInChat(me: string, chatId: string, clearedAt: Date | null, q: string, before: Cursor | null): Promise<SearchPage> {
  const query = toTsQuery(q);
  if (!query) return { hits: [], olderCursor: null };
  const rows = await db.$queryRaw<{ id: string; created_at: Date }[]>`
    SELECT m.id, m.created_at FROM messages m
    WHERE m.chat_id = ${chatId}::uuid
      AND m.search_vector @@ to_tsquery('simple', ${query})
      AND m.deleted_at IS NULL AND m.type <> 'SYSTEM'
      AND (${clearedAt}::timestamp IS NULL OR m.created_at > ${clearedAt}::timestamp)
      AND NOT EXISTS (SELECT 1 FROM hidden_messages h WHERE h.message_id = m.id AND h.user_id = ${me}::uuid)
      ${cursorSql(before)}
    ORDER BY m.created_at DESC, m.id DESC
    LIMIT ${PAGE + 1}
  `;
  const page = rows.slice(0, PAGE);
  const items = await hydrate(me, page.map((r) => r.id));
  const chat = (await listChats(me)).find((c) => c.id === chatId);
  const last = page.at(-1);
  return {
    hits: items.map((i) => ({ ...i, chat: { id: chatId, title: chat?.title ?? "", avatarUrl: chat?.avatarUrl ?? null, type: chat?.type ?? "" } })),
    olderCursor: rows.length > PAGE && last ? encodeCursor({ createdAt: last.created_at, id: last.id }) : null,
  };
}

/**
 * Search across every chat I'm a member of (shared contacts I only view are
 * not included). Membership, "clear history" and "delete for me" are applied
 * in the same query, so nothing outside my own view can match.
 */
export async function searchAll(me: string, q: string, before: Cursor | null): Promise<SearchPage> {
  const query = toTsQuery(q);
  if (!query) return { hits: [], olderCursor: null };
  const rows = await db.$queryRaw<{ id: string; chat_id: string; created_at: Date }[]>`
    SELECT m.id, m.chat_id, m.created_at FROM messages m
    JOIN chat_members cm ON cm.chat_id = m.chat_id AND cm.user_id = ${me}::uuid
    WHERE m.search_vector @@ to_tsquery('simple', ${query})
      AND m.deleted_at IS NULL AND m.type <> 'SYSTEM'
      AND (cm.cleared_at IS NULL OR m.created_at > cm.cleared_at)
      AND NOT EXISTS (SELECT 1 FROM hidden_messages h WHERE h.message_id = m.id AND h.user_id = ${me}::uuid)
      ${cursorSql(before)}
    ORDER BY m.created_at DESC, m.id DESC
    LIMIT ${PAGE + 1}
  `;
  const page = rows.slice(0, PAGE);
  const [items, chats] = await Promise.all([hydrate(me, page.map((r) => r.id)), listChats(me)]);
  const chatById = new Map(chats.map((c) => [c.id, c]));
  const last = page.at(-1);
  return {
    hits: items.flatMap((i) => {
      const c = chatById.get(i.message.chatId);
      return c ? [{ ...i, chat: { id: c.id, title: c.title, avatarUrl: c.avatarUrl, type: c.type } }] : [];
    }),
    olderCursor: rows.length > PAGE && last ? encodeCursor({ createdAt: last.created_at, id: last.id }) : null,
  };
}
