"use client";

import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { ChevronLeft } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { formatLastSeen, useMinute } from "@/lib/client/time";
import type { ChatListItemDTO } from "@/lib/chats/types";
import { useTyping } from "./chat-store";
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
      <motion.p
        key={key}
        initial={{ opacity: 0, y: 3 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -3 }}
        transition={{ duration: 0.15 }}
        className="truncate text-[13px] text-muted"
        aria-live="polite"
      >
        {content}
      </motion.p>
    </AnimatePresence>
  );
}

export function ChatHeader({ chat }: { chat: ChatListItemDTO }) {
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
        <Avatar name={chat.title} src={chat.avatarUrl} size={42} />
        <div className="min-w-0 flex-1 pl-1">
          <h1 className="truncate text-[16px] leading-tight font-bold">{chat.title}</h1>
          <StatusLine chat={chat} />
        </div>
      </div>
    </header>
  );
}

/** Height of the header content (without the safe area), used to pad the list. */
export const CHAT_HEADER_HEIGHT = 64;
