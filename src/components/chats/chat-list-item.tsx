"use client";

import Link from "next/link";
import { animate, motion, useDragControls, useMotionValue, useTransform } from "motion/react";
import { memo, useState } from "react";
import { Archive, ArchiveRestore, Bell, BellOff, Check, CheckCheck, Mail, MailOpen, Pin, PinOff } from "lucide-react";
import { ActionMenu, useLongPress, type MenuItem } from "@/components/ui/action-menu";
import { Avatar } from "@/components/ui/avatar";
import { cn } from "@/lib/cn";
import { ClientTime, formatListTime } from "@/lib/client/time";
import type { ChatListItemDTO } from "@/lib/chats/types";
import { useChatCommands } from "./chat-store";
import { snippetOf } from "./message-snippet";
import { TypingDots } from "./typing-dots";

function LastTicks({ chat }: { chat: ChatListItemDTO }) {
  const at = chat.lastMessage?.createdAt;
  if (!at) return null;
  if (chat.peerReadAt && chat.peerReadAt >= at) return <CheckCheck className="size-4 shrink-0 text-accent" aria-label="Read" />;
  if (chat.peerDeliveredAt && chat.peerDeliveredAt >= at) return <CheckCheck className="size-4 shrink-0 opacity-70" aria-label="Delivered" />;
  return <Check className="size-4 shrink-0 opacity-70" aria-label="Sent" />;
}

function preview(chat: ChatListItemDTO, meId: string): React.ReactNode {
  const m = chat.lastMessage;
  if (!m) return <span className="italic">No messages yet</span>;
  const body = m.deleted ? <span className="italic">Message deleted</span> : snippetOf(m);
  if (m.type === "SYSTEM") return <span className="italic">{body}</span>;
  const who = m.senderId === meId ? "You" : chat.type === "GROUP" ? m.senderName : null;
  return who ? (
    <>
      <span className="text-fg/80">{who}: </span>
      {body}
    </>
  ) : (
    body
  );
}


const ACTION_W = 76;
const OPEN = ACTION_W * 2;

/**
 * Chat row. Touch: swipe left for Mute/Archive, right for Pin/Read. Mouse:
 * right-click for the same actions. Long-press also opens the menu.
 */
/** Memoised: a list update re-renders only the rows whose chat changed. */
export const ChatListItem = memo(function ChatListItem({
  chat,
  meId,
  active,
  typing,
  prefetchContent = false,
  virtual,
}: {
  chat: ChatListItemDTO;
  meId: string;
  active: boolean;
  typing: boolean;
  /** Prefetch the conversation itself (top chats), not just the page shell. */
  prefetchContent?: boolean;
  /** In a virtualised list: where the row sits, and the measuring ref. */
  virtual?: { index: number; start: number; measure: (el: HTMLElement | null) => void };
}) {
  const { updateSettings, markRead } = useChatCommands();
  // Swipe actions start from a touch press, and their buttons render only then:
  // the first render is the same on server and client (no re-render after hydration).
  const [swiped, setSwiped] = useState(false);
  const drag = useDragControls();
  const x = useMotionValue(0);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  // Mounted on first open (then kept, for its closing animation): rows hydrate faster.
  const [menuUsed, setMenuUsed] = useState(false);
  if (menu && !menuUsed) setMenuUsed(true);
  const unread = chat.unread > 0 || chat.markedUnread;
  const longPress = useLongPress(setMenu);
  // The card is see-through glass, so the swipe actions only show while it moves.
  const actionsOpacity = useTransform(x, (v) => (v === 0 ? 0 : 1));

  const close = () => animate(x, 0, { type: "spring", stiffness: 500, damping: 40 });
  const run = (fn: () => void) => () => {
    fn();
    close();
  };

  const toggleRead = () =>
    unread
      ? markRead(chat.id, chat.lastMessage?.createdAt ?? new Date().toISOString())
      : updateSettings(chat.id, { markedUnread: true });

  const items: MenuItem[] = [
    { label: chat.pinned ? "Unpin" : "Pin", icon: chat.pinned ? PinOff : Pin, onSelect: () => updateSettings(chat.id, { pinned: !chat.pinned }), hidden: chat.archived },
    { label: unread ? "Mark as read" : "Mark as unread", icon: unread ? MailOpen : Mail, onSelect: toggleRead },
    { label: chat.muted ? "Unmute" : "Mute", icon: chat.muted ? Bell : BellOff, onSelect: () => updateSettings(chat.id, { mute: chat.muted ? "off" : "forever" }) },
    { label: chat.archived ? "Unarchive" : "Archive", icon: chat.archived ? ArchiveRestore : Archive, onSelect: () => updateSettings(chat.id, { archived: !chat.archived }) },
  ];

  const swipeBtn = "flex h-full w-[76px] flex-col items-center justify-center gap-1 text-xs font-semibold text-white";

  return (
    <motion.li
      ref={virtual?.measure}
      data-index={virtual?.index}
      layout={virtual ? false : "position"}
      transition={{ type: "spring", stiffness: 500, damping: 40 }}
      className={cn("relative mx-2 overflow-hidden rounded-2xl", virtual && "absolute top-0 right-0 left-0")}
      style={virtual ? { transform: `translateY(${virtual.start}px)` } : undefined}
    >
      {swiped && (
        <motion.div className="absolute inset-0 flex justify-between" style={{ opacity: actionsOpacity }} aria-hidden="true">
          <div className="flex">
            <button type="button" tabIndex={-1} className={cn(swipeBtn, "bg-[#0f766e]")} onClick={run(() => updateSettings(chat.id, { pinned: !chat.pinned }))}>
              {chat.pinned ? <PinOff className="size-5" /> : <Pin className="size-5" />}
              {chat.pinned ? "Unpin" : "Pin"}
            </button>
            <button type="button" tabIndex={-1} className={cn(swipeBtn, "bg-[#1d4ed8]")} onClick={run(toggleRead)}>
              {unread ? <MailOpen className="size-5" /> : <Mail className="size-5" />}
              {unread ? "Read" : "Unread"}
            </button>
          </div>
          <div className="flex">
            <button type="button" tabIndex={-1} className={cn(swipeBtn, "bg-[#475569]")} onClick={run(() => updateSettings(chat.id, { mute: chat.muted ? "off" : "forever" }))}>
              {chat.muted ? <Bell className="size-5" /> : <BellOff className="size-5" />}
              {chat.muted ? "Unmute" : "Mute"}
            </button>
            <button type="button" tabIndex={-1} className={cn(swipeBtn, "bg-[#0b3a66]")} onClick={run(() => updateSettings(chat.id, { archived: !chat.archived }))}>
              {chat.archived ? <ArchiveRestore className="size-5" /> : <Archive className="size-5" />}
              {chat.archived ? "Restore" : "Archive"}
            </button>
          </div>
        </motion.div>
      )}
      <motion.div
        style={{ x, touchAction: "pan-y" }}
        drag="x"
        dragListener={false}
        dragControls={drag}
        onPointerDown={(e) => {
          if (e.pointerType !== "touch") return;
          setSwiped(true);
          drag.start(e);
        }}
        dragDirectionLock
        dragConstraints={{ left: -OPEN, right: OPEN }}
        dragElastic={0.08}
        onDragEnd={(_, info) => {
          const offset = x.get() + info.velocity.x * 0.15;
          animate(x, offset < -ACTION_W ? -OPEN : offset > ACTION_W ? OPEN : 0, { type: "spring", stiffness: 500, damping: 40 });
        }}
        className="glass-1 glass-sheen rounded-2xl"
      >
        <Link
          href={`/chats/${chat.id}`}
          prefetch={prefetchContent ? true : undefined}
          aria-current={active ? "page" : undefined}
          onClick={(e) => {
            // An open swipe closes on tap instead of navigating.
            if (x.get() !== 0) {
              e.preventDefault();
              close();
            }
          }}
          className={cn(
            "relative z-[1] flex items-center gap-3 rounded-2xl px-2.5 py-2.5 transition-transform active:scale-[0.97]",
            active && "glass-primary text-white",
          )}
          {...longPress}
        >
          <Avatar name={chat.title} src={chat.avatarUrl} size={52} />
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-2">
              <p className="min-w-0 flex-1 truncate text-[15px] font-semibold">{chat.title}</p>
              {chat.muted && <BellOff className={cn("size-3.5 shrink-0", active ? "text-white/80" : "text-subtle")} aria-label="Muted" />}
              <span className={cn("flex shrink-0 items-center gap-1 text-xs", active ? "text-white/80" : unread ? "font-semibold text-accent" : "text-subtle")}>
                {chat.lastMessage?.senderId === meId && !chat.lastMessage.deleted && <LastTicks chat={chat} />}
                <ClientTime iso={chat.lastActivityAt} format={formatListTime} />
              </span>
            </div>
            <div className="mt-0.5 flex items-center gap-2">
              <p className={cn("min-w-0 flex-1 truncate text-sm", active ? "text-white/85" : "text-muted")}>
                {typing ? (
                  <span className={cn("inline-flex items-center gap-1.5 font-medium", active ? "text-white" : "text-accent")}>
                    typing <TypingDots />
                  </span>
                ) : (
                  preview(chat, meId)
                )}
              </p>
              {chat.pinned && !unread && <Pin className={cn("size-3.5 shrink-0 rotate-45", active ? "text-white/80" : "text-subtle")} aria-label="Pinned" />}
              {unread && (
                <span
                  className={cn(
                    "grid h-5 min-w-5 shrink-0 place-items-center rounded-full px-1.5 text-[11px] font-bold",
                    active ? "bg-white text-[#0f3d6e]" : chat.muted ? "bg-surface-3 text-muted" : "bg-brand text-white",
                  )}
                  aria-label={chat.unread ? `${chat.unread} unread` : "Marked unread"}
                >
                  {chat.unread > 99 ? "99+" : chat.unread || ""}
                </span>
              )}
            </div>
          </div>
        </Link>
      </motion.div>
      {menuUsed && <ActionMenu anchor={menu} onClose={() => setMenu(null)} items={items} label={`Actions for ${chat.title}`} />}
    </motion.li>
  );
});
