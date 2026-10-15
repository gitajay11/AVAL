import "server-only";
import type { SessionUser } from "@/lib/auth/session";
import { directPeerId } from "@/lib/authz/chats";
import { getChatAccess } from "@/lib/authz/contacts";
import { hasBlocked } from "@/lib/authz/privacy";
import { db } from "@/lib/db";
import { listMembers } from "@/lib/groups/service";
import { getChatItem, getViewerChatItem, latestPinned, listMessagesBefore } from "./queries";
import { cantSendReason } from "./service";
import type { ChatDetailDTO } from "./types";

const READ_ONLY = "View only: this contact was shared with you.";

/**
 * Everything the chat screen needs on first paint, or null if `me` may not read
 * it. Members get the full chat; approved viewers of a shared contact get a
 * read-only view (no receipts, no sending).
 */
export async function getChatDetail(me: SessionUser, chatId: string): Promise<ChatDetailDTO | null> {
  const access = await getChatAccess(me.id, chatId);
  if (!access) return null;

  if (access.kind === "viewer") {
    const [chat, page, pinned] = await Promise.all([
      getViewerChatItem(chatId, access.contact),
      listMessagesBefore(me.id, chatId, null, null),
      latestPinned(me.id, chatId, null),
    ]);
    return {
      chat,
      access: "viewer",
      myLastReadAt: null,
      canSend: false,
      cantSendReason: READ_ONLY,
      blockedByMe: false,
      receipts: [],
      pinned,
      members: null,
      myRole: null,
      description: null,
      page,
    };
  }

  const m = access.membership;
  const peerId = directPeerId(m, me.id);
  const isGroup = m.chat.type === "GROUP";
  const [chat, page, receipts, reason, pinned, blockedByMe, members, group] = await Promise.all([
    getChatItem(me.id, chatId),
    listMessagesBefore(me.id, chatId, m.clearedAt, null),
    // Every member's watermark, mine included (a contact's journal has only mine).
    db.receipt.findMany({ where: { chatId }, select: { userId: true, lastDeliveredAt: true, lastReadAt: true } }),
    cantSendReason(me, m),
    latestPinned(me.id, chatId, m.clearedAt),
    peerId ? hasBlocked(me.id, peerId) : Promise.resolve(false),
    isGroup ? listMembers(me.id, chatId) : Promise.resolve(null),
    isGroup ? db.chat.findUnique({ where: { id: chatId }, select: { description: true } }) : Promise.resolve(null),
  ]);
  if (!chat) return null;
  const mine = receipts.find((r) => r.userId === me.id);
  return {
    chat,
    access: "member",
    myLastReadAt: mine?.lastReadAt?.toISOString() ?? null,
    canSend: reason === null,
    cantSendReason: reason,
    blockedByMe,
    // One entry per other member (even those with no receipt row yet), so a
    // group message only shows ✓✓ once everyone has received / read it.
    receipts: (members ? members.map((x) => x.id) : receipts.map((r) => r.userId))
      .filter((userId) => userId !== me.id)
      .map((userId) => {
        const r = receipts.find((x) => x.userId === userId);
        return {
          userId,
          lastDeliveredAt: r?.lastDeliveredAt?.toISOString() ?? null,
          lastReadAt: r?.lastReadAt?.toISOString() ?? null,
        };
      }),
    pinned,
    members,
    myRole: isGroup ? m.role : null,
    description: group?.description ?? null,
    page,
  };
}
