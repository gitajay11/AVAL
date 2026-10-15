"use client";

import Link from "next/link";
import { animate, motion, useMotionValue } from "motion/react";
import { useState, useSyncExternalStore } from "react";
import { Archive, ArchiveRestore, Bell, BellOff, Check, CheckCheck, Mail, MailOpen, Pin, PinOff } from "lucide-react";
import { ActionMenu, useLongPress, type MenuItem } from "@/components/ui/action-menu";
import { Avatar } from "@/components/ui/avatar";
import { cn } from "@/lib/cn";
import { ClientTime, formatListTime } from "@/lib/client/time";
import type { ChatListItemDTO } from "@/lib/chats/types";
import { useChats } from "./chat-store";
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
  return m.senderId === meId ? (
    <>
      <span className="text-fg/80">You: </span>
      {body}
    </>
  ) : (
    body
  );
}

const coarse = () => window.matchMedia("(pointer: coarse)").matches;
const useTouch = () => useSyncExternalStore(() => () => {}, coarse, () => false);

const ACTION_W = 76;
const OPEN = ACTION_W * 2;

/**
 * Chat row. Touch: swipe left for Mute/Archive, right for Pin/Read. Mouse:
 * right-click for the same actions. Long-press also opens the menu.
 */
export function ChatListItem({ chat, meId, active, typing }: { chat: ChatListItemDTO; meId: string; active: boolean; typing: boolean }) {
  const { updateSettings, markRead } = useChats();
  const touch = useTouch();
  const x = useMotionValue(0);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const unread = chat.unread > 0 || chat.markedUnread;
  const longPress = useLongPress(setMenu);

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
    <motion.li layout="position" transition={{ type: "spring", stiffness: 500, damping: 40 }} className="relative mx-2 overflow-hidden rounded-2xl">
      {touch && (
        <div className="absolute inset-0 flex justify-between" aria-hidden="true">
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
        </div>
      )}
      <motion.div
        style={{ x, touchAction: "pan-y" }}
        drag={touch ? "x" : false}
        dragDirectionLock
        dragConstraints={{ left: -OPEN, right: OPEN }}
        dragElastic={0.08}
        onDragEnd={(_, info) => {
          const offset = x.get() + info.velocity.x * 0.15;
          animate(x, offset < -ACTION_W ? -OPEN : offset > ACTION_W ? OPEN : 0, { type: "spring", stiffness: 500, damping: 40 });
        }}
        className="relative bg-surface"
      >
        <Link
          href={`/chats/${chat.id}`}
          prefetch
          aria-current={active ? "page" : undefined}
          onClick={(e) => {
            // An open swipe closes on tap instead of navigating.
            if (x.get() !== 0) {
              e.preventDefault();
              close();
            }
          }}
          className={cn(
            "flex items-center gap-3 rounded-2xl px-2.5 py-2.5 transition-colors",
            active ? "bg-brand text-white" : "hover:bg-surface-2 active:bg-surface-3",
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
      <ActionMenu anchor={menu} onClose={() => setMenu(null)} items={items} label={`Actions for ${chat.title}`} />
    </motion.li>
  );
}
