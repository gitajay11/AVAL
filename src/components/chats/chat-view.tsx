"use client";

import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { VirtuosoHandle } from "react-virtuoso";
import { ChevronDown, Lock } from "lucide-react";
import { useUser } from "@/components/app/user-context";
import { useRealtime, useRealtimeEvent } from "@/components/realtime/realtime-provider";
import { useToast } from "@/components/ui/toast";
import { api, ClientApiError } from "@/lib/client/api";
import { encodeCursor } from "@/lib/chats/cursor";
import { buildTimeline, messageKey, upsertSorted, type TimelineItem, type UiMessage } from "@/lib/chats/timeline";
import type { ChatDetailDTO, MessageDTO, MessagePage } from "@/lib/chats/types";
import { useChats } from "./chat-store";
import { ChatHeader } from "./chat-header";
import { Composer } from "./composer";
import { MessageList } from "./message-list";

const FIRST_INDEX = 1_000_000;
const POLL_MS = 3_000;

type State = {
  confirmed: UiMessage[];
  pending: UiMessage[];
  olderCursor: string | null;
  firstItemIndex: number;
  loadingOlder: boolean;
};

const sent = (m: MessageDTO): UiMessage => ({ ...m, status: "sent" });

function firstMessageIndex(items: TimelineItem[], key: string): number {
  return items.findIndex((i) => i.key === key);
}

export function ChatView({ detail }: { detail: ChatDetailDTO }) {
  const me = useUser();
  const toast = useToast();
  const chatId = detail.chat.id;
  const { chats, applyMessage, markRead, setActiveChat } = useChats();
  const { status } = useRealtime();
  const chat = chats.find((c) => c.id === chatId) ?? detail.chat;

  // Fixed for this visit: where the "unread messages" divider goes.
  const [unreadAfter] = useState(() => (detail.chat.unread > 0 ? (detail.myLastReadAt ?? "") : null));
  const [s, setS] = useState<State>(() => ({
    confirmed: detail.page.messages.map(sent),
    pending: [],
    olderCursor: detail.page.olderCursor,
    firstItemIndex: FIRST_INDEX,
    loadingOlder: false,
  }));
  const stateRef = useRef(s);
  useEffect(() => {
    stateRef.current = s;
  }, [s]);

  const build = useCallback(
    (confirmed: UiMessage[], pending: UiMessage[]) => buildTimeline([...confirmed, ...pending], { meId: me.id, unreadAfter }),
    [me.id, unreadAfter],
  );
  const items = useMemo(() => build(s.confirmed, s.pending), [build, s.confirmed, s.pending]);
  const [initialIndex] = useState(() => {
    const unread = items.findIndex((i) => i.kind === "unread");
    return unread !== -1 ? unread : Math.max(0, items.length - 1);
  });

  const list = useRef<VirtuosoHandle>(null);
  const [atBottom, setAtBottom] = useState(true);
  const atBottomRef = useRef(true);
  const [newWhileAway, setNewWhileAway] = useState(0);
  const [footerHeight, setFooterHeight] = useState(80);
  const footer = useRef<HTMLDivElement>(null);

  // Animate only messages that arrive or are sent while the chat is open, once.
  const fresh = useRef(new Set<string>());
  const markFresh = (key: string) => {
    fresh.current.add(key);
    setTimeout(() => fresh.current.delete(key), 900);
  };
  const shouldAnimate = useCallback((key: string) => fresh.current.has(key), []);

  const scrollToBottom = useCallback((behavior: "smooth" | "auto" = "smooth") => {
    requestAnimationFrame(() => list.current?.scrollToIndex({ index: "LAST", align: "end", behavior }));
  }, []);

  /** A confirmed message from the server (HTTP response, real-time or poll). */
  const receive = useCallback(
    (m: MessageDTO) => {
      const cur = stateRef.current;
      const known = cur.confirmed.some((x) => x.id === m.id);
      const replacesPending = m.senderId === me.id && cur.pending.some((p) => p.clientId === m.clientId);
      if (!known && !replacesPending) {
        markFresh(messageKey(m));
        if (m.senderId !== me.id && !atBottomRef.current) setNewWhileAway((n) => n + 1);
      }
      setS((x) => ({
        ...x,
        pending: x.pending.filter((p) => !(m.senderId === me.id && p.clientId === m.clientId)),
        confirmed: upsertSorted(x.confirmed, sent(m)),
      }));
    },
    [me.id],
  );

  const catchUp = useCallback(async () => {
    const last = stateRef.current.confirmed.at(-1);
    if (!last) {
      const page = await api<MessagePage>(`/api/chats/${chatId}/messages`);
      page.messages.forEach(receive);
      return;
    }
    const { messages } = await api<{ messages: MessageDTO[] }>(
      `/api/chats/${chatId}/messages?after=${encodeCursor(last)}`,
    );
    messages.forEach(receive);
  }, [chatId, receive]);

  useRealtimeEvent((e) => {
    if (e.name === "message.new" && e.data.message.chatId === chatId) receive(e.data.message);
    if (e.name === "resync") catchUp().catch(() => {});
  });

  // Polling fallback when real-time isn't available.
  useEffect(() => {
    if (status !== "polling") return;
    const t = setInterval(() => {
      if (document.visibilityState === "visible") catchUp().catch(() => {});
    }, POLL_MS);
    return () => clearInterval(t);
  }, [status, catchUp]);

  const loadOlder = useCallback(async () => {
    const cur = stateRef.current;
    if (!cur.olderCursor || cur.loadingOlder) return;
    setS((x) => ({ ...x, loadingOlder: true }));
    try {
      const page = await api<MessagePage>(`/api/chats/${chatId}/messages?before=${cur.olderCursor}`);
      setS((x) => {
        const anchor = x.confirmed[0] ? messageKey(x.confirmed[0]) : null;
        const confirmed = page.messages.map(sent).reduce(upsertSorted, x.confirmed);
        // Shift firstItemIndex by the rows added above the old first message,
        // so the viewport stays exactly where it was.
        const added = anchor ? firstMessageIndex(build(confirmed, x.pending), anchor) - firstMessageIndex(build(x.confirmed, x.pending), anchor) : 0;
        return { ...x, confirmed, olderCursor: page.olderCursor, loadingOlder: false, firstItemIndex: x.firstItemIndex - added };
      });
    } catch {
      setS((x) => ({ ...x, loadingOlder: false }));
    }
  }, [build, chatId]);

  const post = useCallback(
    async (m: UiMessage) => {
      try {
        const { message } = await api<{ message: MessageDTO }>(`/api/chats/${chatId}/messages`, {
          body: { clientId: m.clientId, text: m.text },
        });
        receive(message);
        applyMessage(message, { countUnread: false });
      } catch (err) {
        setS((x) => ({ ...x, pending: x.pending.map((p) => (p.clientId === m.clientId ? { ...p, status: "failed" } : p)) }));
        if (err instanceof ClientApiError && err.status !== 0) toast(err.message, "error");
      }
    },
    [applyMessage, chatId, receive, toast],
  );

  const send = useCallback(
    (text: string) => {
      const clientId = crypto.randomUUID().replace(/-/g, "");
      const m: UiMessage = {
        id: `pending-${clientId}`,
        chatId,
        senderId: me.id,
        clientId,
        type: "TEXT",
        text,
        createdAt: new Date().toISOString(),
        editedAt: null,
        deleted: false,
        status: "sending",
      };
      markFresh(messageKey(m));
      setS((x) => ({ ...x, pending: [...x.pending, m] }));
      scrollToBottom();
      post(m);
    },
    [chatId, me.id, post, scrollToBottom],
  );

  const retry = useCallback(
    (clientId: string) => {
      const m = stateRef.current.pending.find((p) => p.clientId === clientId);
      if (!m) return;
      setS((x) => ({ ...x, pending: x.pending.map((p) => (p.clientId === clientId ? { ...p, status: "sending" } : p)) }));
      post(m);
    },
    [post],
  );

  const onTyping = useCallback(() => {
    if (status === "live") api(`/api/chats/${chatId}/typing`, { method: "POST" }).catch(() => {});
  }, [chatId, status]);

  const onAtBottomChange = useCallback((bottom: boolean) => {
    atBottomRef.current = bottom;
    setAtBottom(bottom);
    if (bottom) setNewWhileAway(0);
  }, []);

  // While I'm at the bottom of a visible chat, it's "being read": no unread
  // counting, and the read watermark follows the newest incoming message.
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const onVis = () => setVisible(document.visibilityState === "visible");
    onVis();
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  useEffect(() => {
    setActiveChat(atBottom && visible ? chatId : null);
    return () => setActiveChat(null);
  }, [atBottom, visible, chatId, setActiveChat]);

  const lastMarked = useRef<string | null>(null);
  useEffect(() => {
    if (!atBottom || !visible) return;
    const lastIncoming = s.confirmed.findLast((m) => m.senderId !== me.id);
    if (!lastIncoming) return;
    if (lastMarked.current && lastIncoming.createdAt <= lastMarked.current) return;
    if (!lastMarked.current && chat.unread === 0 && !chat.markedUnread && detail.myLastReadAt && lastIncoming.createdAt <= detail.myLastReadAt) return;
    lastMarked.current = lastIncoming.createdAt;
    markRead(chatId, lastIncoming.createdAt);
  }, [atBottom, visible, s.confirmed, me.id, chatId, markRead, chat.unread, chat.markedUnread, detail.myLastReadAt]);

  // Keep the list's bottom padding equal to the composer's height.
  useEffect(() => {
    const el = footer.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setFooterHeight(el.offsetHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div className="bg-chat relative h-full">
      <ChatHeader chat={chat} />

      <MessageList
        ref={list}
        items={items}
        firstItemIndex={s.firstItemIndex}
        initialIndex={initialIndex}
        meId={me.id}
        loadingOlder={s.loadingOlder}
        reachedStart={s.olderCursor === null}
        footerHeight={footerHeight}
        shouldAnimate={shouldAnimate}
        onStartReached={loadOlder}
        onAtBottomChange={onAtBottomChange}
        onRetry={retry}
      />

      <AnimatePresence>
        {!atBottom && (
          <motion.button
            type="button"
            initial={{ opacity: 0, scale: 0.8, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.8, y: 8 }}
            transition={{ type: "spring", stiffness: 500, damping: 30 }}
            onClick={() => scrollToBottom()}
            style={{ bottom: footerHeight + 12 }}
            className="glass absolute right-4 z-10 grid size-11 place-items-center rounded-full border border-line text-fg shadow-float"
            aria-label={newWhileAway ? `${newWhileAway} new messages. Scroll to bottom` : "Scroll to bottom"}
          >
            <ChevronDown className="size-6" />
            {newWhileAway > 0 && (
              <span className="absolute -top-1.5 -right-1 grid h-5 min-w-5 place-items-center rounded-full bg-brand px-1 text-[11px] font-bold text-white">
                {newWhileAway}
              </span>
            )}
          </motion.button>
        )}
      </AnimatePresence>

      <div
        ref={footer}
        className="absolute inset-x-0 bottom-0 z-20 px-2 pt-2 pb-[max(0.625rem,env(safe-area-inset-bottom))] sm:px-4"
      >
        {detail.canSend ? (
          <Composer chatId={chatId} onSend={send} onTyping={onTyping} />
        ) : (
          <p className="glass mx-auto flex max-w-lg items-center justify-center gap-2 rounded-2xl border border-line px-4 py-3 text-center text-sm text-muted">
            <Lock className="size-4 shrink-0" aria-hidden="true" />
            {detail.cantSendReason}
          </p>
        )}
      </div>
    </div>
  );
}
