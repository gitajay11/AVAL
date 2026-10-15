import "server-only";
import type { SessionUser } from "@/lib/auth/session";
import { directPeerId, getMembership } from "@/lib/authz/chats";
import { hasBlocked } from "@/lib/authz/privacy";
import { db } from "@/lib/db";
import { getChatItem, latestPinned, listMessagesBefore } from "./queries";
import { cantSendReason } from "./service";
import type { ChatDetailDTO } from "./types";

/** Everything the chat screen needs on first paint, or null if `me` isn't a member. */
export async function getChatDetail(me: SessionUser, chatId: string): Promise<ChatDetailDTO | null> {
  const m = await getMembership(me.id, chatId);
  if (!m) return null;
  const peerId = directPeerId(m, me.id);
  const [chat, page, receipts, reason, pinned, blockedByMe] = await Promise.all([
    getChatItem(me.id, chatId),
    listMessagesBefore(me.id, chatId, m.clearedAt, null),
    db.receipt.findMany({ where: { chatId }, select: { userId: true, lastDeliveredAt: true, lastReadAt: true } }),
    cantSendReason(me, m),
    latestPinned(me.id, chatId, m.clearedAt),
    peerId ? hasBlocked(me.id, peerId) : Promise.resolve(false),
  ]);
  if (!chat) return null;
  const mine = receipts.find((r) => r.userId === me.id);
  return {
    chat,
    myLastReadAt: mine?.lastReadAt?.toISOString() ?? null,
    canSend: reason === null,
    cantSendReason: reason,
    blockedByMe,
    receipts: receipts
      .filter((r) => r.userId !== me.id)
      .map((r) => ({
        userId: r.userId,
        lastDeliveredAt: r.lastDeliveredAt?.toISOString() ?? null,
        lastReadAt: r.lastReadAt?.toISOString() ?? null,
      })),
    pinned,
    page,
  };
}
