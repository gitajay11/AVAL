"use client";

import { createContext, useContext } from "react";
import type { MessageDTO } from "@/lib/chats/types";

/** Callbacks a message row needs, provided once by the chat screen (keeps rows memoizable). */
export type ChatActions = {
  meId: string;
  /** Viewing someone's shared contact: no menu, swipe, reactions or downloads. */
  readOnly: boolean;
  nameOf: (userId: string | null) => string;
  /** Groups: show sender names and photos beside other people's messages. */
  isGroup: boolean;
  avatarOf: (userId: string | null) => string | null;
  retry: (clientId: string) => void;
  reply: (m: MessageDTO) => void;
  openMenu: (m: MessageDTO, point: { x: number; y: number }) => void;
  toggleReaction: (m: MessageDTO, emoji: string) => void;
  /** Who reacted to this message. */
  showReactions: (m: MessageDTO) => void;
  /** A group member's card (their avatar beside a message, when they have no photo). */
  showMember: (userId: string) => void;
  /** A member's @username, for the photo viewer. */
  usernameOf: (userId: string | null) => string | null;
  jumpTo: (messageId: string) => void;
};

export const ChatActionsContext = createContext<ChatActions | null>(null);

export function useChatActions(): ChatActions {
  const ctx = useContext(ChatActionsContext);
  if (!ctx) throw new Error("useChatActions must be used inside a chat");
  return ctx;
}
