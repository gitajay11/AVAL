"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { BellOff, Pin } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { cn } from "@/lib/cn";
import { ClientTime, formatListTime } from "@/lib/client/time";
import type { ChatListItemDTO } from "@/lib/chats/types";
import { TypingDots } from "./typing-dots";

function preview(chat: ChatListItemDTO, meId: string): React.ReactNode {
  const m = chat.lastMessage;
  if (!m) return <span className="italic">No messages yet</span>;
  const body = m.deleted ? <span className="italic">Message deleted</span> : m.text;
  return m.senderId === meId ? (
    <>
      <span className="text-fg/80">You: </span>
      {body}
    </>
  ) : (
    body
  );
}

export function ChatListItem({
  chat,
  meId,
  active,
  typing,
}: {
  chat: ChatListItemDTO;
  meId: string;
  active: boolean;
  typing: boolean;
}) {
  const unread = chat.unread > 0 || chat.markedUnread;
  return (
    <motion.li layout="position" transition={{ type: "spring", stiffness: 500, damping: 40 }}>
      <Link
        href={`/chats/${chat.id}`}
        prefetch
        aria-current={active ? "page" : undefined}
        className={cn(
          "group mx-2 flex items-center gap-3 rounded-2xl px-2.5 py-2.5 transition-colors",
          active ? "bg-brand text-white" : "hover:bg-surface-2 active:bg-surface-3",
        )}
      >
        <Avatar name={chat.title} src={chat.avatarUrl} size={52} />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <p className="min-w-0 flex-1 truncate text-[15px] font-semibold">{chat.title}</p>
            {chat.muted && <BellOff className={cn("size-3.5 shrink-0", active ? "text-white/80" : "text-subtle")} aria-label="Muted" />}
            <span className={cn("shrink-0 text-xs", active ? "text-white/80" : unread ? "font-semibold text-accent" : "text-subtle")}>
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
    </motion.li>
  );
}
