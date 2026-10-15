"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { useRef, useState } from "react";
import { MessageCircleMore, Search, Settings, SquarePen, X } from "lucide-react";
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
  const [query, setQuery] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const activeId = pathname.startsWith("/chats/") ? pathname.split("/")[2] : null;
  const searching = query.trim().length > 0;

  const q = query.trim().replace(/^@/, "").toLowerCase();
  const chatMatches = searching
    ? chats.filter((c) => c.title.toLowerCase().includes(q) || c.peer?.username.toLowerCase().startsWith(q))
    : chats;

  return (
    <>
      <header className="glass sticky top-0 z-10 px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-2">
        <div className="flex items-center gap-3">
          <Link href="/settings" className="rounded-full" aria-label="Open settings">
            <Avatar name={me.displayName} src={me.avatarUrl} size={38} />
          </Link>
          <h1 className="flex flex-1 items-center gap-2 text-xl font-extrabold tracking-tight">
            Chats <ConnectionPill />
          </h1>
          <button
            type="button"
            onClick={() => input.current?.focus()}
            className="grid size-10 place-items-center rounded-xl text-muted hover:bg-surface-3 hover:text-fg"
            aria-label="New chat"
          >
            <SquarePen className="size-5" />
          </button>
          <Link
            href="/settings"
            className="grid size-10 place-items-center rounded-xl text-muted hover:bg-surface-3 hover:text-fg"
            aria-label="Settings"
          >
            <Settings className="size-5" />
          </Link>
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
            placeholder="Search chats or @username"
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

        {!searching && chats.length === 0 && (
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
