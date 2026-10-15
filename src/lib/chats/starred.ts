import "server-only";
import { db } from "@/lib/db";
import type { Cursor } from "./cursor";
import { messageSelect, toMessage } from "./queries";
import type { MessageDTO } from "./types";

export type StarredItem = { savedAt: string; chat: { id: string; title: string }; message: MessageDTO };

const PAGE = 30;

/**
 * Starred messages that are still visible to me: I'm still a member, the
 * message isn't deleted, hidden for me or cleared from my history.
 */
export async function listStarred(me: string, before: Cursor | null) {
  const rows = await db.starredMessage.findMany({
    where: {
      userId: me,
      message: { deletedAt: null, hiddenFor: { none: { userId: me } }, chat: { members: { some: { userId: me } } } },
      ...(before
        ? { OR: [{ createdAt: { lt: before.createdAt } }, { createdAt: before.createdAt, messageId: { lt: before.id } }] }
        : {}),
    },
    orderBy: [{ createdAt: "desc" }, { messageId: "desc" }],
    take: PAGE + 1,
    select: {
      createdAt: true,
      messageId: true,
      message: {
        select: {
          ...messageSelect(me),
          chat: {
            select: {
              id: true,
              title: true,
              members: { where: { userId: { not: me } }, take: 1, select: { user: { select: { displayName: true } } } },
            },
          },
        },
      },
    },
  });
  const page = rows.slice(0, PAGE);
  const items: StarredItem[] = page.map((r) => ({
    savedAt: r.createdAt.toISOString(),
    chat: { id: r.message.chat.id, title: r.message.chat.title ?? r.message.chat.members[0]?.user.displayName ?? "Chat" },
    message: toMessage(r.message),
  }));
  const lastRow = page.at(-1);
  return { items, hasMore: rows.length > PAGE, last: lastRow ? { createdAt: lastRow.createdAt, id: lastRow.messageId } : null };
}
