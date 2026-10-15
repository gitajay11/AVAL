"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { useRef, useState } from "react";
import { Archive, Bell, BookUser, ChevronLeft, ChevronRight, MessageCircleMore, Search, SquarePen, Star, X } from "lucide-react";
import { PublicContactResults } from "@/components/contacts/public-contact-results";
import { useNotifications } from "@/components/notifications/notifications-provider";
import { useUser } from "@/components/app/user-context";
import { VerifyBanner } from "@/components/app/verify-banner";
import { useRealtime } from "@/components/realtime/realtime-provider";
import { Avatar } from "@/components/ui/avatar";
import { cn } from "@/lib/cn";
import { useChats } from "./chat-store";
import { ChatListItem } from "./chat-list-item";
import { PeopleResults } from "./people-results";

function ConnectionPill() {
  const { status } = useRealtime();
  if (status !== "reconnecting") return null;
  return (
    <span className="rounded-full bg-surface-3 px-2 py-0.5 text-xs font-semibold text-muted" role="status">
      Connecting…
    </span>
  );
}

export function ChatSidebar() {
  const me = useUser();
  const pathname = usePathname();
  const { chats, typing } = useChats();
  const { unread: unreadNotifications } = useNotifications();
  const [query, setQuery] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const activeId = pathname.startsWith("/chats/") ? pathname.split("/")[2] : null;
  const searching = query.trim().length > 0;

  const q = query.trim().replace(/^@/, "").toLowerCase();
  const archived = chats.filter((c) => c.archived);
  const archivedUnread = archived.filter((c) => c.unread > 0 || c.markedUnread).length;
  const chatMatches = searching
    ? chats.filter((c) => c.title.toLowerCase().includes(q) || c.peer?.username.toLowerCase().startsWith(q))
    : chats.filter((c) => c.archived === showArchived);
  const listEmpty = !searching && !showArchived && chats.length === 0;

  return (
    <>
      <header className="glass sticky top-0 z-10 px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-2">
        <div className="flex items-center gap-3">
          {showArchived ? (
            <button
              type="button"
              onClick={() => setShowArchived(false)}
              className="-ml-1 grid size-10 place-items-center rounded-xl hover:bg-surface-3"
              aria-label="Back to chats"
            >
              <ChevronLeft className="size-6" />
            </button>
          ) : (
            <Link href="/settings" className="rounded-full" aria-label="Open settings">
              <Avatar name={me.displayName} src={me.avatarUrl} size={38} />
            </Link>
          )}
          <h1 className="flex flex-1 items-center gap-2 text-xl font-extrabold tracking-tight">
            {showArchived ? "Archived" : "Chats"} <ConnectionPill />
          </h1>
          <Link
            href="/notifications"
            className="relative grid size-10 place-items-center rounded-xl text-muted hover:bg-surface-3 hover:text-fg"
            aria-label={unreadNotifications ? `Notifications, ${unreadNotifications} new` : "Notifications"}
          >
            <Bell className="size-5" />
            {unreadNotifications > 0 && (
              <span className="absolute top-1 right-1 grid h-4 min-w-4 place-items-center rounded-full bg-brand px-1 text-[10px] font-bold text-white">
                {unreadNotifications > 9 ? "9+" : unreadNotifications}
              </span>
            )}
          </Link>
          <Link
            href="/contacts"
            className="grid size-10 place-items-center rounded-xl text-muted hover:bg-surface-3 hover:text-fg"
            aria-label="Contacts"
          >
            <BookUser className="size-5" />
          </Link>
          <Link
            href="/saved"
            className="grid size-10 place-items-center rounded-xl text-muted hover:bg-surface-3 hover:text-fg"
            aria-label="Starred messages"
          >
            <Star className="size-5" />
          </Link>
          <button
            type="button"
            onClick={() => input.current?.focus()}
            className="grid size-10 place-items-center rounded-xl text-muted hover:bg-surface-3 hover:text-fg"
            aria-label="New chat"
          >
            <SquarePen className="size-5" />
          </button>
        </div>
        <label className="relative mt-3 block">
          <span className="sr-only">Search chats and people</span>
          <Search className="pointer-events-none absolute top-1/2 left-3.5 size-[18px] -translate-y-1/2 text-subtle" aria-hidden="true" />
          <input
            ref={input}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Escape" && setQuery("")}
            placeholder="Search chats, @people or contacts"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            className="h-11 w-full rounded-2xl bg-surface-3 pr-10 pl-10 text-[15px] placeholder:text-subtle focus-visible:ring-4 focus-visible:ring-ring/20 focus-visible:outline-none [&::-webkit-search-cancel-button]:hidden"
          />
          {searching && (
            <button
              type="button"
              onClick={() => setQuery("")}
              className="absolute top-1/2 right-2 grid size-7 -translate-y-1/2 place-items-center rounded-full text-subtle hover:bg-surface-2 hover:text-fg"
              aria-label="Clear search"
            >
              <X className="size-4" />
            </button>
          )}
        </label>
      </header>

      {!me.emailVerified && <VerifyBanner />}

      <nav aria-label="Chats" className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-[env(safe-area-inset-bottom)]">
        {searching && chatMatches.length > 0 && (
          <h3 className="px-5 pt-3 pb-1.5 text-xs font-bold tracking-wide text-muted uppercase">Chats</h3>
        )}
        {!searching && !showArchived && archived.length > 0 && (
          <button
            type="button"
            onClick={() => setShowArchived(true)}
            className="mx-2 mt-1 flex w-[calc(100%-1rem)] items-center gap-3 rounded-2xl px-2.5 py-2 text-left hover:bg-surface-2"
          >
            <span className="grid size-[52px] place-items-center rounded-full bg-surface-3 text-muted">
              <Archive className="size-6" aria-hidden="true" />
            </span>
            <span className="flex-1 text-[15px] font-semibold">Archived chats</span>
            {archivedUnread > 0 && (
              <span className="grid h-5 min-w-5 place-items-center rounded-full bg-surface-3 px-1.5 text-[11px] font-bold text-muted">{archivedUnread}</span>
            )}
            <ChevronRight className="size-5 text-subtle" aria-hidden="true" />
          </button>
        )}
        <ul className="flex flex-col gap-0.5 py-1">
          <AnimatePresence initial={false}>
            {chatMatches.map((chat) => (
              <ChatListItem
                key={chat.id}
                chat={chat}
                meId={me.id}
                active={chat.id === activeId}
                typing={Boolean(typing[chat.id])}
              />
            ))}
          </AnimatePresence>
        </ul>

        {searching && <PeopleResults query={query} onOpened={() => setQuery("")} />}
        {searching && <PublicContactResults query={query} heading="Public contacts" />}

        {showArchived && !searching && archived.length === 0 && (
          <p className="px-6 py-10 text-center text-[15px] text-muted">No archived chats. Swipe a chat or right-click it to archive.</p>
        )}

        {listEmpty && (
          <div className="flex flex-col items-center gap-4 px-8 pt-16 text-center">
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: "spring", stiffness: 260, damping: 20, delay: 0.05 }}
              className="grid size-20 place-items-center rounded-[28px] bg-brand text-white shadow-soft"
            >
              <MessageCircleMore className="size-9" aria-hidden="true" />
            </motion.div>
            <div>
              <p className="text-lg font-bold">No chats yet</p>
              <p className="mt-1 text-[15px] text-muted">Search for someone by @username to start a conversation.</p>
            </div>
            <button
              type="button"
              onClick={() => input.current?.focus()}
              className={cn("rounded-2xl bg-brand px-5 py-2.5 text-[15px] font-semibold text-white")}
            >
              Find people
            </button>
          </div>
        )}
      </nav>
    </>
  );
}
