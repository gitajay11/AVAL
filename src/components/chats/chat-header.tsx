"use client";

import { IdleLink as Link } from "@/components/ui/idle-link";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { Bell, BellOff, ChevronLeft, Eye, Globe, Info, Lock, MoreHorizontal, Pin, Search, X } from "lucide-react";
import { ActionMenu } from "@/components/ui/action-menu";
import { Avatar } from "@/components/ui/avatar";
import { formatLastSeen, useMinute } from "@/lib/client/time";
import type { ChatListItemDTO, MessageDTO } from "@/lib/chats/types";
import { useChats, useTyping } from "./chat-store";
import { snippetOf } from "./message-snippet";
import { TypingDots } from "./typing-dots";
import { usePresence } from "./use-presence";

/** Journals and shared contacts have no presence: say what the chat is instead. */
function ContactLine({ chat, readOnly }: { chat: ChatListItemDTO; readOnly: boolean }) {
  const isPublic = chat.contact?.visibility === "PUBLIC";
  const Icon = readOnly ? Eye : isPublic ? Globe : Lock;
  return (
    <span className="flex items-center gap-1 truncate text-[13px] text-muted">
      <Icon className="size-3.5 shrink-0" aria-hidden="true" />
      {readOnly ? "View only · shared with you" : isPublic ? "Personal contact · public" : "Personal contact · private"}
    </span>
  );
}

/** Groups: who's typing, otherwise the member count. */
function GroupLine({ chat, nameOf }: { chat: ChatListItemDTO; nameOf: (id: string | null) => string }) {
  const typingUser = useTyping(chat.id);
  return (
    <span className="block truncate text-[13px] text-muted" aria-live="polite">
      {typingUser ? (
        <span className="inline-flex items-center gap-1.5 text-accent">
          {nameOf(typingUser)} is typing <TypingDots />
        </span>
      ) : (
        `${chat.memberCount ?? 0} members`
      )}
    </span>
  );
}

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
  readOnly: boolean;
  nameOf: (id: string | null) => string;
  onSearch: () => void;
  pinned: MessageDTO | null;
  onOpenProfile: () => void;
  onJumpToPinned: () => void;
  onUnpin: () => void;
};

/**
 * Floating glass capsule over the messages (they scroll underneath it): back,
 * squircle avatar, name and status, search and a "⋯" menu. The pinned message
 * folds out of the same capsule.
 */
export function ChatHeader({ chat, readOnly, nameOf, onSearch, pinned, onOpenProfile, onJumpToPinned, onUnpin }: HeaderProps) {
  const { updateSettings } = useChats();
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const infoLabel = chat.type === "GROUP" ? "Group info" : chat.contact ? (readOnly ? "About" : "Manage contact") : "View profile";

  return (
    <header className="glass-2 absolute inset-x-2 top-[max(0.5rem,env(safe-area-inset-top))] z-20 overflow-hidden rounded-[24px] sm:inset-x-3">
      <div className="flex h-16 items-center gap-1 px-1.5 sm:px-2.5">
        <Link
          href="/chats"
          className="grid size-10 shrink-0 place-items-center rounded-2xl text-fg hover:bg-surface-3 md:hidden"
          aria-label="Back to chats"
        >
          <ChevronLeft className="size-6" />
        </Link>
        <button
          type="button"
          onClick={onOpenProfile}
          className="flex min-w-0 flex-1 items-center gap-3 rounded-2xl py-1 pr-2 pl-1 text-left hover:bg-surface-3/60"
        >
          <span className="sr-only">{chat.type === "GROUP" ? "Group info: " : chat.contact ? (readOnly ? "About: " : "Manage contact: ") : "Profile: "}</span>
          <Avatar name={chat.title} src={chat.avatarUrl} size={42} shape="squircle" />
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-1.5">
              <span className="truncate text-[16px] leading-tight font-bold">{chat.title}</span>
              {chat.muted && <BellOff className="size-3.5 shrink-0 text-subtle" aria-label="Muted" />}
            </span>
            {chat.type === "GROUP" ? (
              <GroupLine chat={chat} nameOf={nameOf} />
            ) : chat.contact ? (
              <ContactLine chat={chat} readOnly={readOnly} />
            ) : (
              <StatusLine chat={chat} />
            )}
          </span>
        </button>
        <button
          type="button"
          onClick={onSearch}
          className="grid size-10 shrink-0 place-items-center rounded-2xl text-muted hover:bg-surface-3 hover:text-fg"
          aria-label="Search in this chat"
        >
          <Search className="size-5" />
        </button>
        <button
          type="button"
          onClick={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            setMenu({ x: r.right - 200, y: r.bottom + 6 });
          }}
          className="grid size-10 shrink-0 place-items-center rounded-2xl text-muted hover:bg-surface-3 hover:text-fg"
          aria-label="More"
          aria-haspopup="menu"
        >
          <MoreHorizontal className="size-5" />
        </button>
      </div>
      <ActionMenu
        anchor={menu}
        onClose={() => setMenu(null)}
        label="Chat"
        items={[
          { label: "Search", icon: Search, onSelect: onSearch },
          {
            label: chat.muted ? "Unmute" : "Mute",
            icon: chat.muted ? Bell : BellOff,
            onSelect: () => updateSettings(chat.id, { mute: chat.muted ? "off" : "forever" }),
          },
          { label: infoLabel, icon: Info, onSelect: onOpenProfile },
        ]}
      />
      <AnimatePresence initial={false}>
        {pinned && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden border-t border-line"
          >
            <div className="flex h-11 items-center gap-2 px-3 sm:px-4">
              <button type="button" onClick={onJumpToPinned} className="flex min-w-0 flex-1 items-center gap-2.5 text-left">
                <span className="h-7 w-[3px] shrink-0 rounded-full bg-accent" aria-hidden="true" />
                <span className="min-w-0">
                  <span className="flex items-center gap-1 text-xs font-semibold text-accent">
                    <Pin className="size-3 rotate-45" aria-hidden="true" /> Pinned message
                  </span>
                  <span className="block truncate text-[13px] text-muted">{snippetOf(pinned)}</span>
                </span>
              </button>
              {!readOnly && (
                <button type="button" onClick={onUnpin} className="grid size-8 place-items-center rounded-full text-subtle hover:bg-surface-3" aria-label="Unpin message">
                  <X className="size-4" />
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}

/**
 * Space the floating header takes above the first message (without the safe
 * area): 8px inset + the 64px capsule + a 4px gap.
 */
export const CHAT_HEADER_HEIGHT = 76;
