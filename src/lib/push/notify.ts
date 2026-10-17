import "server-only";
import { snippetOf } from "@/components/chats/message-snippet";
import type { MessageDTO } from "@/lib/chats/types";
import { db } from "@/lib/db";
import { pushConfig, pushToUser } from "./server";

/**
 * Who gets a push for a new message: the other members of the chat, if they
 * have message notifications on, haven't muted the chat, and (in 1:1 chats)
 * neither side has blocked the other. Journals (personal contacts) never push.
 * Previews follow each recipient's "Show message preview" setting.
 */
export async function pushNewMessage(message: MessageDTO) {
  if (!pushConfig() || !message.senderId || message.type === "SYSTEM") return;
  const chat = await db.chat.findUnique({
    where: { id: message.chatId },
    select: {
      type: true,
      title: true,
      members: {
        where: { userId: { not: message.senderId } },
        select: { mutedUntil: true, user: { select: { id: true, notifyMessages: true, notifyPreviews: true } } },
      },
    },
  });
  if (!chat || chat.type === "CONTACT") return;
  const sender = await db.user.findUnique({ where: { id: message.senderId }, select: { displayName: true } });
  if (!sender) return;

  const now = new Date();
  const recipients = chat.members.filter((m) => m.user.notifyMessages && !(m.mutedUntil && m.mutedUntil > now));
  if (recipients.length === 0) return;

  let blocked = new Set<string>();
  if (chat.type === "DIRECT") {
    const rows = await db.block.findMany({
      where: {
        OR: [
          { blockerId: message.senderId, blockedId: { in: recipients.map((r) => r.user.id) } },
          { blockedId: message.senderId, blockerId: { in: recipients.map((r) => r.user.id) } },
        ],
      },
      select: { blockerId: true, blockedId: true },
    });
    blocked = new Set(rows.map((b) => (b.blockerId === message.senderId ? b.blockedId : b.blockerId)));
  }

  const aliases = await db.contactAlias.findMany({
    where: { targetUserId: message.senderId, ownerId: { in: recipients.map((r) => r.user.id) } },
    select: { ownerId: true, alias: true },
  });
  const nameFor = new Map(aliases.map((a) => [a.ownerId, a.alias]));
  const preview = snippetOf(message) || "New message";
  await Promise.all(
    recipients
      .filter((r) => !blocked.has(r.user.id))
      .map((r) => {
        const body = r.user.notifyPreviews ? preview : "New message";
        const senderName = nameFor.get(r.user.id) ?? sender.displayName;
        return pushToUser(r.user.id, {
          kind: "message",
          title: chat.type === "GROUP" ? (chat.title ?? "Group") : senderName,
          body: chat.type === "GROUP" && r.user.notifyPreviews ? `${senderName}: ${body}` : body,
          tag: `chat-${message.chatId}`,
          url: `/chats/${message.chatId}`,
          chatId: message.chatId,
          reply: true,
        });
      }),
  );
}

/** Push for contact access events, if the person has access-request notifications on. */
export async function pushAccessEvent(userId: string, title: string, body: string, url: string) {
  if (!pushConfig()) return;
  const user = await db.user.findUnique({ where: { id: userId }, select: { notifyAccessRequests: true } });
  if (!user?.notifyAccessRequests) return;
  await pushToUser(userId, { kind: "access", title, body, tag: `access-${url}`, url }, { urgency: "normal" });
}
