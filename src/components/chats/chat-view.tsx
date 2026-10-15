"use client";

import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { VirtuosoHandle } from "react-virtuoso";
import { ChevronDown, Copy, Eye, Flag, Forward, Lock, Pencil, Pin, PinOff, Reply, Star, StarOff, Trash2 } from "lucide-react";
import { PublicContactSheet } from "@/components/contacts/public-contact-sheet";
import { ChatSearch } from "./chat-search";
import { GroupInfoSheet } from "./group-info";
import { useUser } from "@/components/app/user-context";
import { useRealtime, useRealtimeEvent } from "@/components/realtime/realtime-provider";
import { ActionMenu, type MenuItem } from "@/components/ui/action-menu";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { api, ClientApiError } from "@/lib/client/api";
import { uploadMedia, type PreparedMedia } from "@/lib/client/media-upload";
import { scrollBehavior } from "@/lib/client/motion";
import { encodeCursor } from "@/lib/chats/cursor";
import { buildTimeline, messageKey, upsertSorted, type TimelineItem, type UiMessage } from "@/lib/chats/timeline";
import type { AttachmentDTO, ChatDetailDTO, MemberDTO, MessageDTO, MessagePage, MessageWindow, ReactionDTO, ReceiptDTO } from "@/lib/chats/types";
import type { PublicContactDTO } from "@/lib/contacts/types";
import { EDIT_WINDOW_MS } from "@/lib/validation/limits";
import { ChatActionsContext, type ChatActions } from "./chat-actions";
import { ChatHeader } from "./chat-header";
import { useChats } from "./chat-store";
import { Composer, type ComposerSubmit } from "./composer";
import { DeleteDialog, ForwardSheet, ProfileSheet, ReportSheet, type ReportTarget } from "./dialogs";
import type { Receipt } from "./message-bubble";
import { MessageList } from "./message-list";

const FIRST_INDEX = 1_000_000;
const POLL_MS = 3_000;
const PINNED_BAR = 44;
const QUICK_REACTIONS = ["👍", "❤️", "😂", "😮", "😢", "🙏", "🔥"];

type State = {
  confirmed: UiMessage[];
  pending: UiMessage[];
  olderCursor: string | null;
  /**
   * Non-null while showing a window in the past (after jumping to an old
   * message): newer messages load as you scroll down, and live ones wait.
   */
  newerCursor: string | null;
  firstItemIndex: number;
  loadingOlder: boolean;
  loadingNewer: boolean;
};

type Job = { text: string; media: PreparedMedia | null; replyToId?: string; attachmentId?: string };

const sent = (m: MessageDTO): UiMessage => ({ ...m, status: "sent" });

/** Apply one person's reaction change to a reaction list. */
function applyReaction(list: ReactionDTO[], userId: string, emoji: string | null): ReactionDTO[] {
  const without = list.map((r) => ({ ...r, userIds: r.userIds.filter((u) => u !== userId) })).filter((r) => r.userIds.length);
  if (!emoji) return without;
  const existing = without.find((r) => r.emoji === emoji);
  return existing
    ? without.map((r) => (r.emoji === emoji ? { ...r, userIds: [...r.userIds, userId] } : r))
    : [...without, { emoji, userIds: [userId] }];
}

function firstMessageIndex(items: TimelineItem[], key: string): number {
  return items.findIndex((i) => i.key === key);
}

export function ChatView({ detail }: { detail: ChatDetailDTO }) {
  const me = useUser();
  const toast = useToast();
  const router = useRouter();
  const chatId = detail.chat.id;
  const { chats, applyMessage, markRead, setActiveChat } = useChats();
  const { status } = useRealtime();
  const chat = chats.find((c) => c.id === chatId) ?? detail.chat;
  // A shared contact I only view: everything is read-only (enforced by the server too).
  const readOnly = detail.access === "viewer";
  const isJournal = chat.type === "CONTACT";
  const [contactCard, setContactCard] = useState<PublicContactDTO | null>(null);

  // Fixed for this visit: where the "unread messages" divider goes.
  const [unreadAfter] = useState(() => (detail.chat.unread > 0 ? (detail.myLastReadAt ?? "") : null));
  const [s, setS] = useState<State>(() => ({
    confirmed: detail.page.messages.map(sent),
    pending: [],
    olderCursor: detail.page.olderCursor,
    newerCursor: null,
    firstItemIndex: FIRST_INDEX,
    loadingOlder: false,
    loadingNewer: false,
  }));
  const stateRef = useRef(s);
  useEffect(() => {
    stateRef.current = s;
  }, [s]);

  const [receipts, setReceipts] = useState<ReceiptDTO[]>(detail.receipts);
  const [pinned, setPinned] = useState<MessageDTO | null>(detail.pinned);
  const [replyTo, setReplyTo] = useState<MessageDTO | null>(null);
  const [editing, setEditing] = useState<MessageDTO | null>(null);
  // `openedAt` is captured when the menu opens (edit is offered only within the edit window).
  const [menu, setMenu] = useState<{ message: MessageDTO; point: { x: number; y: number }; openedAt: number } | null>(null);
  const [forwarding, setForwarding] = useState<MessageDTO | null>(null);
  const [deleting, setDeleting] = useState<MessageDTO | null>(null);
  const [reporting, setReporting] = useState<ReportTarget>(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [groupOpen, setGroupOpen] = useState(false);
  const isGroup = chat.type === "GROUP";
  const [members, setMembers] = useState<MemberDTO[]>(detail.members ?? []);
  const [myRole, setMyRole] = useState(detail.myRole);
  const isAdmin = myRole === "OWNER" || myRole === "ADMIN";

  const build = useCallback(
    (confirmed: UiMessage[], pending: UiMessage[]) => buildTimeline([...confirmed, ...pending], { meId: me.id, unreadAfter }),
    [me.id, unreadAfter],
  );
  const items = useMemo(() => build(s.confirmed, s.pending), [build, s.confirmed, s.pending]);
  const itemsRef = useRef(items);
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);
  // The list is re-mounted (new key) when we switch windows, starting at `initialIndex`.
  const [view, setView] = useState(() => {
    const unread = items.findIndex((i) => i.kind === "unread");
    return { key: 0, initialIndex: unread !== -1 ? unread : Math.max(0, items.length - 1) };
  });

  const list = useRef<VirtuosoHandle>(null);
  const [atBottom, setAtBottom] = useState(true);
  const atBottomRef = useRef(true);
  const [newWhileAway, setNewWhileAway] = useState(0);
  const [footerHeight, setFooterHeight] = useState(80);
  const footer = useRef<HTMLDivElement>(null);
  const jobs = useRef(new Map<string, Job>());
  const offlineFailed = useRef(new Set<string>());

  // Animate only messages that arrive or are sent while the chat is open, once.
  const fresh = useRef(new Set<string>());
  const markFresh = (key: string) => {
    fresh.current.add(key);
    setTimeout(() => fresh.current.delete(key), 900);
  };
  const shouldAnimate = useCallback((key: string) => fresh.current.has(key), []);

  const scrollToBottom = useCallback((behavior: "smooth" | "auto" = scrollBehavior()) => {
    requestAnimationFrame(() => list.current?.scrollToIndex({ index: "LAST", align: "end", behavior }));
  }, []);

  const updateMessage = useCallback((id: string, fn: (m: UiMessage) => UiMessage) => {
    setS((x) => ({ ...x, confirmed: x.confirmed.map((m) => (m.id === id ? fn(m) : m)) }));
  }, []);

  /** A confirmed message from the server (HTTP response, real-time or poll). */
  const receive = useCallback(
    (m: MessageDTO) => {
      const cur = stateRef.current;
      const known = cur.confirmed.some((x) => x.id === m.id);
      const replacesPending = m.senderId === me.id && cur.pending.some((p) => p.clientId === m.clientId);
      if (cur.newerCursor !== null && !known && !replacesPending) {
        // Viewing older history: it'll load when scrolling down to it.
        if (m.senderId !== me.id) setNewWhileAway((n) => n + 1);
        return;
      }
      if (!known && !replacesPending) {
        markFresh(messageKey(m));
        if (m.senderId !== me.id && !atBottomRef.current) setNewWhileAway((n) => n + 1);
      }
      if (replacesPending && m.clientId) jobs.current.delete(m.clientId);
      setS((x) => ({
        ...x,
        pending: x.pending.filter((p) => !(m.senderId === me.id && p.clientId === m.clientId)),
        confirmed: upsertSorted(x.confirmed, sent(m)),
      }));
    },
    [me.id],
  );

  const refreshPinned = useCallback(() => {
    api<{ pinned: MessageDTO | null }>(`/api/chats/${chatId}/pinned`)
      .then((r) => setPinned(r.pinned))
      .catch(() => {});
  }, [chatId]);

  /** Edits, deletions, pins and link previews. My `starred` flag is mine, so it's kept. */
  const onUpdated = useCallback(
    (m: MessageDTO) => {
      setS((x) => ({
        ...x,
        confirmed: x.confirmed.map((c) => {
          if (c.id === m.id) return { ...sent(m), starred: m.deleted ? false : c.starred };
          if (c.replyTo?.id === m.id) {
            return { ...c, replyTo: { ...c.replyTo, text: m.deleted ? null : (m.text?.slice(0, 140) ?? null), deleted: m.deleted } };
          }
          return c;
        }),
      }));
      setPinned((p) => {
        if (m.pinnedAt && !m.deleted && (!p || p.id === m.id || m.pinnedAt >= (p.pinnedAt ?? ""))) return m;
        if (p?.id === m.id) {
          refreshPinned();
          return null;
        }
        return p;
      });
    },
    [refreshPinned],
  );

  const refreshMembers = useCallback(() => {
    if (!isGroup) return;
    api<{ members: MemberDTO[]; myRole: "OWNER" | "ADMIN" | "MEMBER" }>(`/api/chats/${chatId}/members`)
      .then((r) => {
        setMembers(r.members);
        setMyRole(r.myRole);
      })
      .catch(() => {});
  }, [chatId, isGroup]);

  const catchUp = useCallback(async () => {
    if (stateRef.current.newerCursor !== null) return; // detached: nothing to append
    const last = stateRef.current.confirmed.at(-1);
    if (!last) {
      const page = await api<MessagePage>(`/api/chats/${chatId}/messages`);
      page.messages.forEach(receive);
      return;
    }
    const { messages, receipts: latest } = await api<{ messages: MessageDTO[]; receipts: ReceiptDTO[] }>(
      `/api/chats/${chatId}/messages?after=${encodeCursor(last)}`,
    );
    messages.forEach(receive);
    setReceipts(latest);
  }, [chatId, receive]);

  // Access can end at any time (revoked, made private, blocked, deleted): the
  // server then answers 404, and the chat closes instead of going stale.
  const leftRef = useRef(false);
  const leave = useCallback(() => {
    if (leftRef.current) return;
    leftRef.current = true;
    toast(readOnly ? "Your access to this contact has ended." : "This chat is no longer available.", "error");
    router.replace(readOnly ? "/contacts" : "/chats");
  }, [readOnly, router, toast]);
  const safeCatchUp = useCallback(() => {
    catchUp().catch((err) => {
      if (err instanceof ClientApiError && err.status === 404) leave();
    });
  }, [catchUp, leave]);

  useRealtimeEvent((e) => {
    switch (e.name) {
      case "message.new":
        if (e.data.message.chatId === chatId) {
          receive(e.data.message);
          // Group events (joins, leaves, roles, renames) change the member list.
          if (e.data.message.type === "SYSTEM") refreshMembers();
        }
        break;
      case "chat.removed":
        if (e.data.chatId === chatId) leave();
        break;
      case "message.updated":
        if (e.data.message.chatId === chatId) onUpdated(e.data.message);
        break;
      case "message.hidden":
        if (e.data.chatId === chatId) setS((x) => ({ ...x, confirmed: x.confirmed.filter((m) => m.id !== e.data.messageId) }));
        break;
      case "message.starred":
        if (e.data.chatId === chatId) updateMessage(e.data.messageId, (m) => ({ ...m, starred: e.data.starred }));
        break;
      case "reaction":
        if (e.data.chatId === chatId) {
          updateMessage(e.data.messageId, (m) => ({ ...m, reactions: applyReaction(m.reactions, e.data.userId, e.data.emoji) }));
        }
        break;
      case "receipt":
        if (e.data.chatId === chatId) {
          const { userId, lastDeliveredAt, lastReadAt } = e.data;
          setReceipts((cur) => [...cur.filter((x) => x.userId !== userId), { userId, lastDeliveredAt, lastReadAt }]);
        }
        break;
      case "contact.access":
        // The owner revoked my access, made it private, or deleted it: leave now.
        if (e.data.chatId === chatId && e.data.access === "revoked") leave();
        break;
      case "resync":
        safeCatchUp();
        break;
    }
  });

  // Polling fallback when real-time isn't available.
  useEffect(() => {
    if (status !== "polling") return;
    const t = setInterval(() => {
      if (document.visibilityState === "visible") safeCatchUp();
    }, POLL_MS);
    return () => clearInterval(t);
  }, [status, safeCatchUp]);

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

  /** Replace what's shown with a window of history, re-mounting the list at `targetId`. */
  const showWindow = useCallback(
    (win: MessagePage & { newerCursor: string | null }, targetId: string | null) => {
      const confirmed = win.messages.map(sent);
      const timeline = build(confirmed, []);
      const idx = targetId ? timeline.findIndex((i) => i.kind === "message" && i.message.id === targetId) : timeline.length - 1;
      setS((x) => ({
        ...x,
        confirmed,
        pending: win.newerCursor === null ? x.pending : [],
        olderCursor: win.olderCursor,
        newerCursor: win.newerCursor,
        firstItemIndex: FIRST_INDEX,
        loadingOlder: false,
        loadingNewer: false,
      }));
      setView((v) => ({ key: v.key + 1, initialIndex: Math.max(0, idx) }));
    },
    [build],
  );

  /** Leave older history and show the latest messages again. */
  const returnToLatest = useCallback(async () => {
    const page = await api<MessagePage>(`/api/chats/${chatId}/messages`);
    showWindow({ ...page, newerCursor: null }, null);
    setNewWhileAway(0);
  }, [chatId, showWindow]);

  const loadNewer = useCallback(async () => {
    const cur = stateRef.current;
    if (!cur.newerCursor || cur.loadingNewer) return;
    setS((x) => ({ ...x, loadingNewer: true }));
    try {
      const { messages } = await api<{ messages: MessageDTO[] }>(`/api/chats/${chatId}/messages?after=${cur.newerCursor}`);
      setS((x) => ({
        ...x,
        confirmed: messages.map(sent).reduce(upsertSorted, x.confirmed),
        // The "after" page holds up to 100; fewer means we've reached the latest.
        newerCursor: messages.length >= 100 ? encodeCursor(messages[messages.length - 1]) : null,
        loadingNewer: false,
      }));
    } catch {
      setS((x) => ({ ...x, loadingNewer: false }));
    }
  }, [chatId]);

  const setPendingState = useCallback((clientId: string, patch: Partial<UiMessage>) => {
    setS((x) => ({ ...x, pending: x.pending.map((p) => (p.clientId === clientId ? { ...p, ...patch } : p)) }));
  }, []);

  /** Upload (if needed) then send. Safe to call again for a retry: steps that succeeded are reused. */
  const post = useCallback(
    async (clientId: string) => {
      const job = jobs.current.get(clientId);
      if (!job) return;
      try {
        if (job.media && !job.attachmentId) {
          job.attachmentId = await uploadMedia(chatId, job.media, (p) => setPendingState(clientId, { upload: p }));
        }
        const { message } = await api<{ message: MessageDTO }>(`/api/chats/${chatId}/messages`, {
          body: { clientId, text: job.text, attachmentId: job.attachmentId, replyToId: job.replyToId },
        });
        receive(message);
        applyMessage(message, { countUnread: false });
      } catch (err) {
        setPendingState(clientId, { status: "failed" });
        // Lost connection: retried automatically when it returns (the offline bar says so).
        if (!(err instanceof ClientApiError) || err.status === 0) offlineFailed.current.add(clientId);
        else toast(err.message, "error");
      }
    },
    [applyMessage, chatId, receive, setPendingState, toast],
  );

  const send = useCallback(
    async ({ text, media }: ComposerSubmit) => {
      // Sending from an older window first returns to the latest messages.
      if (stateRef.current.newerCursor !== null) await returnToLatest();
      const clientId = crypto.randomUUID().replace(/-/g, "");
      const local: AttachmentDTO[] = media
        ? [
            {
              id: `local-${clientId}`,
              kind: media.kind,
              mimeType: media.contentType,
              sizeBytes: media.blob.size,
              fileName: media.fileName,
              width: media.width ?? null,
              height: media.height ?? null,
              durationMs: media.durationMs ?? null,
              waveform: media.waveform ?? null,
              url: URL.createObjectURL(media.blob),
            },
          ]
        : [];
      const m: UiMessage = {
        id: `pending-${clientId}`,
        chatId,
        senderId: me.id,
        clientId,
        type: media ? media.kind : "TEXT",
        text: text || null,
        createdAt: new Date().toISOString(),
        editedAt: null,
        deleted: false,
        attachments: local,
        replyTo: replyTo ? { id: replyTo.id, senderId: replyTo.senderId, type: replyTo.type, text: replyTo.text?.slice(0, 140) ?? null, deleted: false } : null,
        forwardedFromName: null,
        linkPreview: null,
        reactions: [],
        pinnedAt: null,
        starred: false,
        status: "sending",
        ...(media ? { upload: 0 } : {}),
      };
      jobs.current.set(clientId, { text, media, replyToId: replyTo?.id });
      // Local previews are released once the server copy has had time to load.
      if (local[0]) setTimeout(() => URL.revokeObjectURL(local[0].url), 60_000);
      setReplyTo(null);
      markFresh(messageKey(m));
      setS((x) => ({ ...x, pending: [...x.pending, m] }));
      scrollToBottom();
      post(clientId);
    },
    [chatId, me.id, post, replyTo, returnToLatest, scrollToBottom],
  );

  const retry = useCallback(
    (clientId: string) => {
      offlineFailed.current.delete(clientId);
      setPendingState(clientId, { status: "sending" });
      post(clientId);
    },
    [post, setPendingState],
  );

  // Sends that failed for lack of network go out again once it's back. The
  // server de-duplicates by clientId, so a send that did arrive isn't doubled.
  useEffect(() => {
    const online = () => [...offlineFailed.current].forEach(retry);
    window.addEventListener("online", online);
    return () => window.removeEventListener("online", online);
  }, [retry]);

  const toggleReaction = useCallback(
    (m: MessageDTO, emoji: string) => {
      const mine = m.reactions.find((r) => r.userIds.includes(me.id))?.emoji ?? null;
      const next = mine === emoji ? null : emoji;
      updateMessage(m.id, (x) => ({ ...x, reactions: applyReaction(x.reactions, me.id, next) }));
      api(`/api/messages/${m.id}/reaction`, { method: "PUT", body: { emoji: next } }).catch((err) => {
        updateMessage(m.id, (x) => ({ ...x, reactions: applyReaction(x.reactions, me.id, mine) }));
        toast(err instanceof ClientApiError ? err.message : "Couldn't react.", "error");
      });
    },
    [me.id, toast, updateMessage],
  );

  const flash = useCallback((id: string) => {
    setHighlightedId(id);
    setTimeout(() => setHighlightedId((h) => (h === id ? null : h)), 1600);
  }, []);

  /**
   * Scroll to a message. If it isn't loaded, load a window around it (any age)
   * and continue from there in both directions.
   */
  const jumpTo = useCallback(
    async (id: string) => {
      const idx = itemsRef.current.findIndex((i) => i.kind === "message" && i.message.id === id);
      if (idx !== -1) {
        list.current?.scrollToIndex({ index: idx, align: "center", behavior: scrollBehavior() });
        flash(id);
        return;
      }
      try {
        const win = await api<MessageWindow>(`/api/chats/${chatId}/messages?around=${id}`);
        showWindow(win, id);
        setTimeout(() => flash(id), 250);
      } catch {
        toast("That message is no longer available.", "error");
      }
    },
    [chatId, flash, showWindow, toast],
  );

  // Opened from a search result: /chats/:id?m=<messageId>
  const jumped = useRef(false);
  useEffect(() => {
    if (jumped.current) return;
    jumped.current = true;
    const target = new URLSearchParams(window.location.search).get("m");
    if (target) {
      history.replaceState(history.state, "", window.location.pathname);
      setTimeout(() => jumpTo(target), 0);
    }
  }, [jumpTo]);

  const nameOf = useCallback(
    (userId: string | null) => {
      if (userId === me.id) return "You";
      if (userId && userId === chat.peer?.id) return chat.peer.displayName;
      return members.find((m) => m.id === userId)?.displayName ?? "Former member";
    },
    [chat.peer, me.id, members],
  );
  const avatarOf = useCallback((userId: string | null) => members.find((m) => m.id === userId)?.avatarUrl ?? null, [members]);

  const canSend = detail.canSend;
  const actions = useMemo<ChatActions>(
    () => ({
      meId: me.id,
      readOnly,
      nameOf,
      isGroup,
      avatarOf,
      retry,
      reply: (m) => canSend && setReplyTo(m),
      openMenu: (m, point) => !readOnly && setMenu({ message: m, point, openedAt: Date.now() }),
      toggleReaction: (m, emoji) => !readOnly && toggleReaction(m, emoji),
      jumpTo,
    }),
    [avatarOf, canSend, isGroup, jumpTo, me.id, nameOf, readOnly, retry, toggleReaction],
  );

  const receiptFor = useCallback(
    (m: UiMessage): Receipt => {
      if (m.status !== "sent") return m.status;
      if (isJournal) return "none";
      if (receipts.length && receipts.every((r) => r.lastReadAt && r.lastReadAt >= m.createdAt)) return "read";
      if (receipts.length && receipts.every((r) => r.lastDeliveredAt && r.lastDeliveredAt >= m.createdAt)) return "delivered";
      return "sent";
    },
    [isJournal, receipts],
  );

  async function submitEdit(text: string) {
    if (!editing) return;
    const target = editing;
    setEditing(null);
    try {
      const { message } = await api<{ message: MessageDTO }>(`/api/messages/${target.id}`, { method: "PATCH", body: { text } });
      onUpdated(message);
    } catch (err) {
      toast(err instanceof ClientApiError ? err.message : "Couldn't edit.", "error");
    }
  }

  async function setPin(m: MessageDTO, pin: boolean) {
    try {
      const { message } = await api<{ message: MessageDTO }>(`/api/messages/${m.id}/pin`, { method: pin ? "POST" : "DELETE" });
      onUpdated(message);
      toast(pin ? "Message pinned" : "Message unpinned");
    } catch (err) {
      toast(err instanceof ClientApiError ? err.message : "Couldn't update pin.", "error");
    }
  }

  async function setStar(m: MessageDTO, star: boolean) {
    updateMessage(m.id, (x) => ({ ...x, starred: star }));
    try {
      await api(`/api/messages/${m.id}/star`, { method: star ? "POST" : "DELETE" });
      toast(star ? "Saved to starred messages" : "Removed from starred");
    } catch (err) {
      updateMessage(m.id, (x) => ({ ...x, starred: !star }));
      toast(err instanceof ClientApiError ? err.message : "Couldn't update.", "error");
    }
  }

  const menuItems: MenuItem[] = menu
    ? (() => {
        const m = menu.message;
        const mine = m.senderId === me.id;
        const editable = mine && canSend && (m.type === "TEXT" || m.text !== null) && menu.openedAt - Date.parse(m.createdAt) < EDIT_WINDOW_MS;
        return [
          { label: "Reply", icon: Reply, onSelect: () => setReplyTo(m), hidden: !canSend },
          {
            label: "Copy text",
            icon: Copy,
            onSelect: () => navigator.clipboard.writeText(m.text ?? "").then(() => toast("Copied")),
            hidden: !m.text,
          },
          { label: "Forward", icon: Forward, onSelect: () => setForwarding(m) },
          { label: m.pinnedAt ? "Unpin" : "Pin", icon: m.pinnedAt ? PinOff : Pin, onSelect: () => setPin(m, !m.pinnedAt), hidden: isGroup && !isAdmin },
          { label: m.starred ? "Unstar" : "Star", icon: m.starred ? StarOff : Star, onSelect: () => setStar(m, !m.starred) },
          { label: "Edit", icon: Pencil, onSelect: () => setEditing(m), hidden: !editable },
          { label: "Delete", icon: Trash2, onSelect: () => setDeleting(m), danger: true },
          { label: "Report", icon: Flag, onSelect: () => setReporting({ messageId: m.id, label: "message" }), hidden: mine, danger: true },
        ];
      })()
    : [];

  const reactionBar = menu && canSend && (
    <div className="mb-1 flex gap-0.5 border-b border-line px-1 pb-1.5" role="group" aria-label="React">
      {QUICK_REACTIONS.map((emoji) => (
        <motion.button
          key={emoji}
          type="button"
          whileHover={{ scale: 1.2 }}
          whileTap={{ scale: 0.9 }}
          onClick={() => {
            toggleReaction(menu.message, emoji);
            setMenu(null);
          }}
          className="grid size-9 place-items-center rounded-full text-[22px] hover:bg-surface-3"
          aria-label={`React ${emoji}`}
        >
          {emoji}
        </motion.button>
      ))}
    </div>
  );

  const onTyping = useCallback(() => {
    if (status === "live" && !isJournal) api(`/api/chats/${chatId}/typing`, { method: "POST" }).catch(() => {});
  }, [chatId, isJournal, status]);

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

  // Coming back to the tab: catch up at once (and notice lost access) rather
  // than waiting for the next poll or event.
  useEffect(() => {
    const onVis = () => document.visibilityState === "visible" && safeCatchUp();
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [safeCatchUp]);

  useEffect(() => {
    setActiveChat(atBottom && visible ? chatId : null);
    return () => setActiveChat(null);
  }, [atBottom, visible, chatId, setActiveChat]);

  const lastMarked = useRef<string | null>(null);
  useEffect(() => {
    if (!atBottom || !visible || readOnly) return;
    const lastIncoming = s.confirmed.findLast((m) => m.senderId !== me.id);
    if (!lastIncoming) return;
    if (lastMarked.current && lastIncoming.createdAt <= lastMarked.current) return;
    if (!lastMarked.current && chat.unread === 0 && !chat.markedUnread && detail.myLastReadAt && lastIncoming.createdAt <= detail.myLastReadAt) return;
    lastMarked.current = lastIncoming.createdAt;
    markRead(chatId, lastIncoming.createdAt);
  }, [atBottom, visible, readOnly, s.confirmed, me.id, chatId, markRead, chat.unread, chat.markedUnread, detail.myLastReadAt]);

  // Keep the list's bottom padding equal to the composer's height.
  useEffect(() => {
    const el = footer.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setFooterHeight(el.offsetHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  async function unblock() {
    if (!chat.peer) return;
    try {
      await api(`/api/users/${chat.peer.id}/block`, { method: "DELETE" });
      toast(`${chat.peer.displayName} unblocked`);
      router.refresh();
    } catch (err) {
      toast(err instanceof ClientApiError ? err.message : "Couldn't unblock.", "error");
    }
  }

  return (
    <ChatActionsContext value={actions}>
      <div className="relative h-full">
        <ChatHeader
          chat={chat}
          readOnly={readOnly}
          pinned={pinned}
          nameOf={nameOf}
          onSearch={() => setSearchOpen(true)}
          onOpenProfile={() => {
            if (isGroup) return setGroupOpen(true);
            if (!chat.contact) return setProfileOpen(true);
            if (!readOnly) return router.push(`/contacts/${chat.contact.id}`);
            api<{ contact: PublicContactDTO }>(`/api/contacts/${chat.contact.id}/public`)
              .then((r) => setContactCard(r.contact))
              .catch(() => {});
          }}
          onJumpToPinned={() => pinned && jumpTo(pinned.id)}
          onUnpin={() => pinned && (!isGroup || isAdmin) && setPin(pinned, false)}
        />

        <MessageList
          key={view.key}
          ref={list}
          items={items}
          firstItemIndex={s.firstItemIndex}
          initialIndex={view.initialIndex}
          meId={me.id}
          loadingOlder={s.loadingOlder}
          reachedStart={s.olderCursor === null}
          footerHeight={footerHeight}
          headerExtra={pinned ? PINNED_BAR : 0}
          highlightedId={highlightedId}
          receiptFor={receiptFor}
          shouldAnimate={shouldAnimate}
          onStartReached={loadOlder}
          onEndReached={loadNewer}
          loadingNewer={s.loadingNewer}
          onAtBottomChange={onAtBottomChange}
        />

        <AnimatePresence>
          {(!atBottom || s.newerCursor !== null) && (
            <motion.button
              type="button"
              initial={{ opacity: 0, scale: 0.8, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.8, y: 8 }}
              transition={{ type: "spring", stiffness: 500, damping: 30 }}
              onClick={() => (s.newerCursor !== null ? returnToLatest() : scrollToBottom())}
              style={{ bottom: footerHeight + 12 }}
              className="glass-2 glass-sheen absolute right-4 z-10 grid size-11 place-items-center rounded-full text-fg"
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

        <div ref={footer} className="absolute inset-x-0 bottom-0 z-20 px-2 pt-2 pb-[max(0.625rem,env(safe-area-inset-bottom))] sm:px-4">
          {canSend ? (
            <Composer
              chatId={chatId}
              onSend={send}
              onTyping={onTyping}
              replyTo={replyTo ? { message: replyTo, senderName: nameOf(replyTo.senderId) } : null}
              onCancelReply={() => setReplyTo(null)}
              editing={editing}
              onSubmitEdit={submitEdit}
              onCancelEdit={() => setEditing(null)}
            />
          ) : readOnly ? (
            <div className="glass-2 mx-auto flex max-w-lg items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm text-muted">
              <Eye className="size-4 shrink-0" aria-hidden="true" />
              View only. You can&apos;t reply, react, forward or download.
            </div>
          ) : detail.blockedByMe ? (
            <div className="glass-2 mx-auto flex max-w-lg items-center justify-between gap-3 rounded-2xl px-4 py-2.5">
              <p className="text-sm text-muted">You blocked {chat.title}.</p>
              <Button size="sm" variant="secondary" onClick={unblock}>
                Unblock
              </Button>
            </div>
          ) : (
            <p className="glass-2 mx-auto flex max-w-lg items-center justify-center gap-2 rounded-2xl px-4 py-3 text-center text-sm text-muted">
              <Lock className="size-4 shrink-0" aria-hidden="true" />
              {detail.cantSendReason}
            </p>
          )}
        </div>

        <ActionMenu anchor={menu?.point ?? null} onClose={() => setMenu(null)} items={menuItems} header={reactionBar} label="Message actions" />
        <ForwardSheet message={forwarding} onClose={() => setForwarding(null)} />
        <DeleteDialog
          message={deleting}
          mine={deleting?.senderId === me.id || (isGroup && isAdmin)}
          onClose={() => setDeleting(null)}
          onDeleted={(id, forEveryone) =>
            forEveryone
              ? updateMessage(id, (m) => ({ ...m, deleted: true, text: null, attachments: [], reactions: [], linkPreview: null, pinnedAt: null }))
              : setS((x) => ({ ...x, confirmed: x.confirmed.filter((m) => m.id !== id) }))
          }
        />
        <ReportSheet target={reporting} onClose={() => setReporting(null)} />
        <PublicContactSheet contact={contactCard} onClose={() => setContactCard(null)} onChange={setContactCard} />
        <ChatSearch open={searchOpen} chatId={chatId} nameOf={nameOf} onClose={() => setSearchOpen(false)} onPick={(id) => {
          setSearchOpen(false);
          jumpTo(id);
        }} />
        {isGroup && (
          <GroupInfoSheet
            open={groupOpen}
            onClose={() => setGroupOpen(false)}
            chat={chat}
            description={detail.description}
            members={members}
            myRole={myRole}
            onChanged={refreshMembers}
          />
        )}
        {chat.peer && (
          <ProfileSheet
            open={profileOpen}
            onClose={() => setProfileOpen(false)}
            chat={chat}
            onReport={() => setReporting({ userId: chat.peer!.id, label: chat.title })}
            onBlockChanged={() => router.refresh()}
          />
        )}
      </div>
    </ChatActionsContext>
  );
}
