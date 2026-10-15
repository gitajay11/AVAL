"use client";

import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { ChevronLeft, Pin, X } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { formatLastSeen, useMinute } from "@/lib/client/time";
import type { ChatListItemDTO, MessageDTO } from "@/lib/chats/types";
import { useTyping } from "./chat-store";
import { snippetOf } from "./message-snippet";
import { TypingDots } from "./typing-dots";
import { usePresence } from "./use-presence";

function StatusLine({ chat }: { chat: ChatListItemDTO }) {
  const typingUser = useTyping(chat.id);
  const presence = usePresence(chat.peer?.id ?? null);
  useMinute(); // keep "x min ago" fresh

  let key: string;
  let content: React.ReactNode;
  if (typingUser) {
    key = "typing";
    content = (
      <span className="inline-flex items-center gap-1.5 text-accent">
        typing <TypingDots />
      </span>
    );
  } else if (!presence) {
    key = "loading";
    content = <span className="text-subtle">@{chat.peer?.username}</span>;
  } else if (!presence.visible) {
    key = "hidden";
    content = "last seen recently";
  } else if (presence.online) {
    key = "online";
    content = <span className="font-medium text-accent">online</span>;
  } else {
    key = "seen";
    content = formatLastSeen(presence.lastSeenAt);
  }

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.span
        key={key}
        initial={{ opacity: 0, y: 3 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -3 }}
        transition={{ duration: 0.15 }}
        className="block truncate text-[13px] text-muted"
        aria-live="polite"
      >
        {content}
      </motion.span>
    </AnimatePresence>
  );
}

type HeaderProps = {
  chat: ChatListItemDTO;
  pinned: MessageDTO | null;
  onOpenProfile: () => void;
  onJumpToPinned: () => void;
  onUnpin: () => void;
};

export function ChatHeader({ chat, pinned, onOpenProfile, onJumpToPinned, onUnpin }: HeaderProps) {
  return (
    <header className="glass absolute inset-x-0 top-0 z-20 border-b border-line pt-[env(safe-area-inset-top)]">
      <div className="flex h-16 items-center gap-2 px-2 sm:px-4">
        <Link
          href="/chats"
          className="grid size-10 shrink-0 place-items-center rounded-xl text-fg hover:bg-surface-3 md:hidden"
          aria-label="Back to chats"
        >
          <ChevronLeft className="size-6" />
        </Link>
        <button
          type="button"
          onClick={onOpenProfile}
          className="flex min-w-0 flex-1 items-center gap-3 rounded-2xl py-1 pr-2 text-left hover:bg-surface-3/60"
          aria-label={`Open ${chat.title}'s profile`}
        >
          <Avatar name={chat.title} src={chat.avatarUrl} size={42} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[16px] leading-tight font-bold">{chat.title}</span>
            <StatusLine chat={chat} />
          </span>
        </button>
      </div>
      <AnimatePresence initial={false}>
        {pinned && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden border-t border-line"
          >
            <div className="flex h-11 items-center gap-2 px-3 sm:px-5">
              <button type="button" onClick={onJumpToPinned} className="flex min-w-0 flex-1 items-center gap-2.5 text-left">
                <span className="h-7 w-[3px] shrink-0 rounded-full bg-accent" aria-hidden="true" />
                <span className="min-w-0">
                  <span className="flex items-center gap-1 text-xs font-semibold text-accent">
                    <Pin className="size-3 rotate-45" aria-hidden="true" /> Pinned message
                  </span>
                  <span className="block truncate text-[13px] text-muted">{snippetOf(pinned)}</span>
                </span>
              </button>
              <button type="button" onClick={onUnpin} className="grid size-8 place-items-center rounded-full text-subtle hover:bg-surface-3" aria-label="Unpin message">
                <X className="size-4" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}

/** Height of the header content (without the safe area), used to pad the list. */
export const CHAT_HEADER_HEIGHT = 64;
