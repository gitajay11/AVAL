import "server-only";
import type { SessionUser } from "@/lib/auth/session";
import { getMembership } from "@/lib/authz/chats";
import { db } from "@/lib/db";
import { getChatItem, listMessagesBefore } from "./queries";
import { cantSendReason } from "./service";
import type { ChatDetailDTO } from "./types";

/** Everything the chat screen needs on first paint, or null if `me` isn't a member. */
export async function getChatDetail(me: SessionUser, chatId: string): Promise<ChatDetailDTO | null> {
  const m = await getMembership(me.id, chatId);
  if (!m) return null;
  const [chat, page, receipt, reason] = await Promise.all([
    getChatItem(me.id, chatId),
    listMessagesBefore(me.id, chatId, m.clearedAt, null),
    db.receipt.findUnique({ where: { chatId_userId: { chatId, userId: me.id } }, select: { lastReadAt: true } }),
    cantSendReason(me, m),
  ]);
  if (!chat) return null;
  return {
    chat,
    myLastReadAt: receipt?.lastReadAt?.toISOString() ?? null,
    canSend: reason === null,
    cantSendReason: reason,
    page,
  };
}
