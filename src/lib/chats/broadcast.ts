import "server-only";
import { chatAudience } from "@/lib/authz/chats";
import { publishToUsers } from "@/lib/realtime/server";
import { getMessage } from "./queries";
import type { MessageDTO } from "./types";

/** Publish a message event to every member of its chat. */
export async function broadcast(name: "message.new" | "message.updated", message: MessageDTO) {
  await publishToUsers(await chatAudience(message.chatId), name, { message });
}

/**
 * Re-read a message and broadcast it as updated. Receivers keep their own
 * `starred` flag (it's per viewer and not part of what changed).
 */
export async function rebroadcast(actorId: string, messageId: string) {
  const message = await getMessage(actorId, messageId);
  if (message) await broadcast("message.updated", message);
  return message;
}
