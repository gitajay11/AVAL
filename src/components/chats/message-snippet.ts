import type { LastMessageDTO, MessageType, ReplyRefDTO } from "@/lib/chats/types";

const LABELS: Record<MessageType, string> = {
  TEXT: "",
  IMAGE: "📷 Photo",
  VIDEO: "🎬 Video",
  VOICE: "🎤 Voice message",
  FILE: "📎 File",
  SYSTEM: "",
};

/** One-line summary of a message for previews, replies and the chat list. */
export function snippetOf(m: Pick<LastMessageDTO, "type" | "text" | "deleted"> | ReplyRefDTO): string {
  if (m.deleted) return "Message deleted";
  const label = LABELS[m.type];
  if (label && m.text) return `${label} · ${m.text}`;
  return label || m.text || "";
}
