"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { useRealtime, useRealtimeEvent } from "@/components/realtime/realtime-provider";
import { useToast } from "@/components/ui/toast";
import { api, ClientApiError } from "@/lib/client/api";
import type { ChatDetailDTO, ChatListItemDTO, ChatSettingsDTO, MessageDTO } from "@/lib/chats/types";

/**
 * In-memory chat list, seeded by the server render and kept fresh by real-time
 * events (or polling). Nothing here is persisted on the device.
 */

type State = { chats: ChatListItemDTO[] };

type Action =
  | { type: "replace"; chats: ChatListItemDTO[] }
  | { type: "upsert"; chat: ChatListItemDTO }
  | { type: "message"; message: MessageDTO; meId: string; countUnread: boolean }
  | { type: "updated"; message: MessageDTO }
  | { type: "read"; chatId: string }
  | { type: "remove"; chatId: string }
  | { type: "settings"; chatId: string; settings: Partial<ChatSettingsDTO> }
  | { type: "receipt"; chatId: string; userId: string; lastDeliveredAt: string | null; lastReadAt: string | null };

function sortChats(chats: ChatListItemDTO[]): ChatListItemDTO[] {
  return [...chats].sort(
    (a, b) => Number(b.pinned) - Number(a.pinned) || b.lastActivityAt.localeCompare(a.lastActivityAt) || b.id.localeCompare(a.id),
  );
}

const lastOf = (m: MessageDTO): ChatListItemDTO["lastMessage"] => ({
  id: m.id,
  senderId: m.senderId,
  type: m.type,
  text: m.text,
  createdAt: m.createdAt,
  deleted: m.deleted,
});

function reducer(state: State, action: Action): State {
  const map = (id: string, fn: (c: ChatListItemDTO) => ChatListItemDTO) => ({
    chats: state.chats.map((c) => (c.id === id ? fn(c) : c)),
  });
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
        lastMessage: lastOf(message),
        lastActivityAt: message.createdAt,
        unread: mine ? 0 : chat.unread + (countUnread ? 1 : 0),
        markedUnread: mine ? false : chat.markedUnread,
        // A new message un-archives the chat unless it's muted (matches the server).
        archived: mine ? chat.archived : chat.archived && chat.muted,
      };
      return { chats: sortChats(state.chats.map((c) => (c.id === chat.id ? updated : c))) };
    }
    case "updated":
      return map(action.message.chatId, (c) => (c.lastMessage?.id === action.message.id ? { ...c, lastMessage: lastOf(action.message) } : c));
    case "read":
      return map(action.chatId, (c) => ({ ...c, unread: 0, markedUnread: false }));
    case "remove":
      return { chats: state.chats.filter((c) => c.id !== action.chatId) };
    case "settings": {
      const next = map(action.chatId, (c) => ({ ...c, ...action.settings }));
      return { chats: sortChats(next.chats) };
    }
    case "receipt":
      return map(action.chatId, (c) =>
        c.peer?.id === action.userId ? { ...c, peerDeliveredAt: action.lastDeliveredAt, peerReadAt: action.lastReadAt } : c,
      );
  }
}

type TypingMap = Record<string, { userId: string; until: number }>;

export type SettingsPatch = { pinned?: boolean; archived?: boolean; markedUnread?: boolean; mute?: "8h" | "1w" | "forever" | "off" };

type Ctx = {
  chats: ChatListItemDTO[];
  activeChatId: string | null;
  setActiveChat: (id: string | null) => void;
  /** Record a message I just sent or received while viewing the chat. */
  applyMessage: (m: MessageDTO, opts?: { countUnread?: boolean }) => void;
  upsertChat: (c: ChatListItemDTO) => void;
  markRead: (chatId: string, upTo: string) => void;
  /** Pin / archive / mute / mark unread, optimistic with rollback. */
  updateSettings: (chatId: string, patch: SettingsPatch) => void;
  refetchChat: (chatId: string) => void;
  /** Reload the whole chat list from the server. */
  refresh: () => Promise<void>;
  typing: TypingMap;
};

const ChatsContext = createContext<Ctx | null>(null);

type Commands = Pick<Ctx, "updateSettings" | "markRead">;
const CommandsContext = createContext<Commands | null>(null);

/** Just the actions (stable across list updates): for rows that shouldn't re-render with the list. */
export function useChatCommands(): Commands {
  const ctx = useContext(CommandsContext);
  if (!ctx) throw new Error("useChatCommands must be used inside ChatsProvider");
  return ctx;
}

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
const DELIVERED_DEBOUNCE_MS = 800;

export function ChatsProvider({
  meId,
  initialChats,
  children,
}: {
  meId: string;
  initialChats: ChatListItemDTO[];
  children: React.ReactNode;
}) {
  const toast = useToast();
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

  const refetchChat = useCallback((chatId: string) => {
    api<ChatDetailDTO>(`/api/chats/${chatId}`)
      // Shared contacts I only view never enter my chat list.
      .then((d) => d.access === "member" && dispatch({ type: "upsert", chat: d.chat }))
      .catch(() => {});
  }, []);

  // Tell the server new messages reached this device (senders see ✓✓), batched.
  const deliveredTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ackDelivered = useCallback(() => {
    if (deliveredTimer.current) return;
    deliveredTimer.current = setTimeout(() => {
      deliveredTimer.current = null;
      api("/api/chats/delivered", { method: "POST" }).catch(() => {});
    }, DELIVERED_DEBOUNCE_MS);
  }, []);

  // Unread messages that came with the page reached this device too. (Done
  // from here, not the layout, so prefetching a page never marks anything.)
  useEffect(() => {
    if (initialChats.some((c) => c.unread > 0)) ackDelivered();
    // Once per app load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const applyMessage = useCallback(
    (message: MessageDTO, opts?: { countUnread?: boolean }) => {
      if (!chatsRef.current.some((c) => c.id === message.chatId)) {
        refetchChat(message.chatId);
        return;
      }
      const viewing = activeRef.current === message.chatId && document.visibilityState === "visible";
      dispatch({ type: "message", message, meId, countUnread: opts?.countUnread ?? !viewing });
    },
    [refetchChat, meId],
  );

  const markRead = useCallback((chatId: string, upTo: string) => {
    dispatch({ type: "read", chatId });
    api(`/api/chats/${chatId}/read`, { body: { upTo } }).catch(() => {});
  }, []);

  const upsertChat = useCallback((chat: ChatListItemDTO) => dispatch({ type: "upsert", chat }), []);

  const updateSettings = useCallback(
    (chatId: string, patch: SettingsPatch) => {
      const before = chatsRef.current.find((c) => c.id === chatId);
      if (!before) return;
      const optimistic: Partial<ChatSettingsDTO> = {
        ...(patch.pinned !== undefined && { pinned: patch.pinned }),
        ...(patch.archived !== undefined && { archived: patch.archived, ...(patch.archived && { pinned: false }) }),
        ...(patch.markedUnread !== undefined && { markedUnread: patch.markedUnread }),
        ...(patch.mute !== undefined && { muted: patch.mute !== "off" }),
      };
      dispatch({ type: "settings", chatId, settings: optimistic });
      api<{ settings: ChatSettingsDTO }>(`/api/chats/${chatId}/settings`, { method: "PATCH", body: patch })
        .then(({ settings }) => dispatch({ type: "settings", chatId, settings }))
        .catch((err) => {
          dispatch({
            type: "settings",
            chatId,
            settings: { pinned: before.pinned, archived: before.archived, muted: before.muted, markedUnread: before.markedUnread },
          });
          toast(err instanceof ClientApiError ? err.message : "Couldn't update the chat.", "error");
        });
    },
    [toast],
  );

  useRealtimeEvent((e) => {
    switch (e.name) {
      case "message.new": {
        const { message } = e.data;
        applyMessage(message);
        if (message.senderId && message.senderId !== meId) {
          ackDelivered();
          // A message ends that person's "typing…".
          setTyping((t) =>
            t[message.chatId]?.userId === message.senderId
              ? Object.fromEntries(Object.entries(t).filter(([id]) => id !== message.chatId))
              : t,
          );
        }
        break;
      }
      case "message.updated":
        dispatch({ type: "updated", message: e.data.message });
        break;
      case "message.hidden":
        if (chatsRef.current.find((c) => c.id === e.data.chatId)?.lastMessage?.id === e.data.messageId) refetchChat(e.data.chatId);
        break;
      case "chat.read":
        dispatch({ type: "read", chatId: e.data.chatId });
        break;
      case "chat.removed":
        dispatch({ type: "remove", chatId: e.data.chatId });
        break;
      case "chat.settings": {
        const { chatId, ...settings } = e.data;
        dispatch({ type: "settings", chatId, settings });
        break;
      }
      case "receipt":
        dispatch({ type: "receipt", ...e.data });
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

  // Polling fallback when real-time is unavailable (listing also marks delivery).
  useEffect(() => {
    if (status !== "polling") return;
    const t = setInterval(() => {
      if (document.visibilityState === "visible") refresh().catch(() => {});
    }, POLL_LIST_MS);
    return () => clearInterval(t);
  }, [status, refresh]);

  const value = useMemo<Ctx>(
    () => ({ chats: state.chats, activeChatId, setActiveChat, applyMessage, upsertChat, markRead, updateSettings, refetchChat, refresh, typing }),
    [state.chats, activeChatId, applyMessage, upsertChat, markRead, updateSettings, refetchChat, refresh, typing],
  );

  const commands = useMemo<Commands>(() => ({ updateSettings, markRead }), [updateSettings, markRead]);

  return (
    <CommandsContext value={commands}>
      <ChatsContext value={value}>{children}</ChatsContext>
    </CommandsContext>
  );
}
