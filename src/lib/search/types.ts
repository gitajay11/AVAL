import type { MessageDTO } from "@/lib/chats/types";

export type SearchHit = {
  message: MessageDTO;
  senderName: string | null;
  chat: { id: string; title: string; avatarUrl: string | null; type: string };
};

export type SearchPage = { hits: SearchHit[]; olderCursor: string | null };
