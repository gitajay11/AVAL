"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { useRealtime, useRealtimeEvent } from "@/components/realtime/realtime-provider";
import { api } from "@/lib/client/api";
import type { ChatDetailDTO, ChatListItemDTO, MessageDTO } from "@/lib/chats/types";

/**
 * In-memory chat list, seeded by the server render and kept fresh by real-time
 * events (or polling). Nothing here is persisted on the device.
 */

type State = { chats: ChatListItemDTO[] };

type Action =
  | { type: "replace"; chats: ChatListItemDTO[] }
  | { type: "upsert"; chat: ChatListItemDTO }
  | { type: "message"; message: MessageDTO; meId: string; countUnread: boolean }
  | { type: "read"; chatId: string };

function sortChats(chats: ChatListItemDTO[]): ChatListItemDTO[] {
  return [...chats].sort(
    (a, b) => Number(b.pinned) - Number(a.pinned) || b.lastActivityAt.localeCompare(a.lastActivityAt) || b.id.localeCompare(a.id),
  );
}

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "replace":
      return { chats: sortChats(action.chats) };
    case "upsert": {
      const rest = state.chats.filter((c) => c.id !== action.chat.id);
      return { chats: sortChats([...rest, action.chat]) };
    }
    case "message": {
      const { message, meId, countUnread } = action;
      const chat = state.chats.find((c) => c.id === message.chatId);
      if (!chat) return state;
      if (chat.lastMessage && chat.lastMessage.createdAt > message.createdAt) return state; // stale
      if (chat.lastMessage?.id === message.id) return state; // duplicate delivery
      const mine = message.senderId === meId;
      const updated: ChatListItemDTO = {
        ...chat,
        lastMessage: {
          id: message.id,
          senderId: message.senderId,
          type: message.type,
          text: message.text,
          createdAt: message.createdAt,
          deleted: message.deleted,
        },
        lastActivityAt: message.createdAt,
        unread: mine ? 0 : chat.unread + (countUnread ? 1 : 0),
        markedUnread: mine ? false : chat.markedUnread,
      };
      return { chats: sortChats(state.chats.map((c) => (c.id === chat.id ? updated : c))) };
    }
    case "read":
      return {
        chats: state.chats.map((c) => (c.id === action.chatId ? { ...c, unread: 0, markedUnread: false } : c)),
      };
  }
}

type TypingMap = Record<string, { userId: string; until: number }>;

type Ctx = {
  chats: ChatListItemDTO[];
  activeChatId: string | null;
  setActiveChat: (id: string | null) => void;
  /** Record a message I just sent or received while viewing the chat. */
  applyMessage: (m: MessageDTO, opts?: { countUnread?: boolean }) => void;
  upsertChat: (c: ChatListItemDTO) => void;
  markRead: (chatId: string, upTo: string) => void;
  typing: TypingMap;
};

const ChatsContext = createContext<Ctx | null>(null);

export function useChats(): Ctx {
  const ctx = useContext(ChatsContext);
  if (!ctx) throw new Error("useChats must be used inside ChatsProvider");
  return ctx;
}

/** Who is typing in a chat right now (or null). */
export function useTyping(chatId: string): string | null {
  const { typing } = useChats();
  // Expired entries are pruned by the provider within a second.
  return typing[chatId]?.userId ?? null;
}

const TYPING_SHOW_MS = 5_000;
const POLL_LIST_MS = 10_000;

export function ChatsProvider({
  meId,
  initialChats,
  children,
}: {
  meId: string;
  initialChats: ChatListItemDTO[];
  children: React.ReactNode;
}) {
  const [state, dispatch] = useReducer(reducer, { chats: sortChats(initialChats) });
  const [activeChatId, setActiveChat] = useState<string | null>(null);
  const [typing, setTyping] = useState<TypingMap>({});
  const { status } = useRealtime();
  const chatsRef = useRef(state.chats);
  useEffect(() => {
    chatsRef.current = state.chats;
  }, [state.chats]);
  const activeRef = useRef(activeChatId);
  useEffect(() => {
    activeRef.current = activeChatId;
  }, [activeChatId]);

  const refresh = useCallback(async () => {
    const { chats } = await api<{ chats: ChatListItemDTO[] }>("/api/chats");
    dispatch({ type: "replace", chats });
  }, []);

  const fetchChat = useCallback(async (chatId: string) => {
    const detail = await api<ChatDetailDTO>(`/api/chats/${chatId}`);
    dispatch({ type: "upsert", chat: detail.chat });
  }, []);

  const applyMessage = useCallback(
    (message: MessageDTO, opts?: { countUnread?: boolean }) => {
      if (!chatsRef.current.some((c) => c.id === message.chatId)) {
        fetchChat(message.chatId).catch(() => {});
        return;
      }
      const viewing = activeRef.current === message.chatId && document.visibilityState === "visible";
      dispatch({ type: "message", message, meId, countUnread: opts?.countUnread ?? !viewing });
    },
    [fetchChat, meId],
  );

  const markRead = useCallback((chatId: string, upTo: string) => {
    dispatch({ type: "read", chatId });
    api(`/api/chats/${chatId}/read`, { body: { upTo } }).catch(() => {});
  }, []);

  const upsertChat = useCallback((chat: ChatListItemDTO) => dispatch({ type: "upsert", chat }), []);

  useRealtimeEvent((e) => {
    switch (e.name) {
      case "message.new":
        applyMessage(e.data.message);
        if (e.data.message.senderId) {
          // A message ends that person's "typing…".
          const { chatId, senderId } = e.data.message;
          setTyping((t) =>
            t[chatId]?.userId === senderId ? Object.fromEntries(Object.entries(t).filter(([id]) => id !== chatId)) : t,
          );
        }
        break;
      case "chat.read":
        dispatch({ type: "read", chatId: e.data.chatId });
        break;
      case "typing":
        if (e.data.userId !== meId) {
          setTyping((t) => ({ ...t, [e.data.chatId]: { userId: e.data.userId, until: Date.now() + TYPING_SHOW_MS } }));
        }
        break;
      case "resync":
        refresh().catch(() => {});
        break;
    }
  });

  // Expire typing indicators.
  useEffect(() => {
    const ids = Object.keys(typing);
    if (ids.length === 0) return;
    const t = setTimeout(() => {
      const now = Date.now();
      setTyping((cur) => Object.fromEntries(Object.entries(cur).filter(([, v]) => v.until > now)));
    }, 1000);
    return () => clearTimeout(t);
  }, [typing]);

  // Polling fallback when real-time is unavailable.
  useEffect(() => {
    if (status !== "polling") return;
    const t = setInterval(() => {
      if (document.visibilityState === "visible") refresh().catch(() => {});
    }, POLL_LIST_MS);
    return () => clearInterval(t);
  }, [status, refresh]);

  const value = useMemo<Ctx>(
    () => ({ chats: state.chats, activeChatId, setActiveChat, applyMessage, upsertChat, markRead, typing }),
    [state.chats, activeChatId, applyMessage, upsertChat, markRead, typing],
  );

  return <ChatsContext value={value}>{children}</ChatsContext>;
}
