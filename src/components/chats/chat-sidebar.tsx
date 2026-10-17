"use client";

import dynamic from "next/dynamic";
import { IdleLink as Link } from "@/components/ui/idle-link";
import { usePathname, useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { useRef, useState, useTransition } from "react";
import { Archive, Bell, BookUser, ChevronLeft, ChevronRight, MessageCircleMore, RefreshCw, Search, SquarePen, Star, UserRound, UsersRound, X } from "lucide-react";
import { useNotifications } from "@/components/notifications/notifications-provider";
import { useUser } from "@/components/app/user-context";
import { InstallBanner } from "@/components/app/pwa-banners";
import { VerifyBanner } from "@/components/app/verify-banner";
import { useRealtime } from "@/components/realtime/realtime-provider";
import { ActionMenu } from "@/components/ui/action-menu";
import { Avatar } from "@/components/ui/avatar";
import { FloatingBar } from "@/components/ui/floating-bar";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import { useChats } from "./chat-store";
import { ChatListItem } from "./chat-list-item";
import { useMountOnce } from "@/components/ui/idle-link";

// Only needed once someone starts a group: fetched after the list is up.
const NewGroupSheet = dynamic(() => import("./new-group").then((m) => m.NewGroupSheet), { ssr: false });
// Search results load on the first search.
const PeopleResults = dynamic(() => import("./people-results").then((m) => m.PeopleResults), { ssr: false });
const PublicContactResults = dynamic(() => import("@/components/contacts/public-contact-results").then((m) => m.PublicContactResults), { ssr: false });
const MessageResults = dynamic(() => import("./message-results").then((m) => m.MessageResults), { ssr: false });

function ConnectionPill() {
  const { status } = useRealtime();
  if (status !== "reconnecting") return null;
  return (
    <span className="rounded-full bg-surface-3 px-2 py-0.5 text-xs font-semibold text-muted" role="status">
      Connecting…
    </span>
  );
}

/** The spin lasts at least this long, so a quick refresh still reads as one. */
const REFRESH_MIN_MS = 600;

/**
 * Pulls everything fresh from the server in place: the chat list, the
 * notifications and the page's server data. No full reload, so the launch
 * splash doesn't replay and nothing on screen is lost.
 */
function RefreshButton() {
  const router = useRouter();
  const toast = useToast();
  const { refresh: refreshChats } = useChats();
  const { refresh: refreshNotifications } = useNotifications();
  const [loading, setLoading] = useState(false);
  const [refreshing, startTransition] = useTransition();
  const busy = loading || refreshing;

  async function onClick() {
    if (busy) return;
    setLoading(true);
    const minimum = new Promise((resolve) => setTimeout(resolve, REFRESH_MIN_MS));
    try {
      await Promise.all([refreshChats(), refreshNotifications(), minimum]);
      startTransition(() => router.refresh());
    } catch {
      await minimum;
      toast("Couldn't refresh. Check your connection.", "error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      type="button"
      onClick={onClick}
      aria-busy={busy}
      className="grid size-9 place-items-center rounded-xl text-muted hover:bg-surface-3 hover:text-fg sm:size-10"
      aria-label={busy ? "Refreshing" : "Refresh"}
    >
      <RefreshCw className={cn("size-5", busy && "motion-safe:animate-spin")} />
    </button>
  );
}

/** Past this many rows the list is virtualised (shorter lists keep their add/remove animations). */
const VIRTUALIZE_AT = 60;

// Only long lists are virtualised; the virtualiser loads when one is.
const VirtualChatList = dynamic(() => import("./virtual-chat-list").then((m) => m.VirtualChatList));

export function ChatSidebar() {
  const me = useUser();
  const pathname = usePathname();
  const { chats, typing } = useChats();
  const { unread: unreadNotifications } = useNotifications();
  const [query, setQuery] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [compose, setCompose] = useState<{ x: number; y: number } | null>(null);
  const [newGroup, setNewGroup] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const newGroupMounted = useMountOnce(newGroup);
  const scroller = useRef<HTMLDivElement>(null);
  const activeId = pathname.startsWith("/chats/") ? pathname.split("/")[2] : null;
  const searching = query.trim().length > 0;
  // The section you're in shows as a glowing gradient-glass capsule.
  const navProps = (href: string, base: string) => {
    const active = pathname === href || pathname.startsWith(`${href}/`);
    return {
      "aria-current": active ? ("page" as const) : undefined,
      className: cn(base, active && "glass-primary text-white hover:bg-transparent hover:text-white"),
    };
  };

  const q = query.trim().replace(/^@/, "").toLowerCase();
  const archived = chats.filter((c) => c.archived);
  const archivedUnread = archived.filter((c) => c.unread > 0 || c.markedUnread).length;
  const chatMatches = searching
    ? chats.filter((c) => c.title.toLowerCase().includes(q) || c.peer?.username.toLowerCase().startsWith(q))
    : chats.filter((c) => c.archived === showArchived);
  const listEmpty = !searching && !showArchived && chats.length === 0;

  return (
    // One scroller: the list slides under the floating bar (and its glass blurs it).
    <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-[env(safe-area-inset-bottom)]">
      <FloatingBar className="px-3 pt-2.5 pb-3">
        <div className="flex items-center gap-1 sm:gap-2">
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
          <h1 className="floating-title flex min-w-0 flex-1 items-center gap-2 text-xl font-extrabold tracking-tight">
            {showArchived ? "Archived" : "Chats"} <ConnectionPill />
          </h1>
          <RefreshButton />
          <Link
            href="/notifications"
            {...navProps("/notifications", "relative grid size-9 place-items-center rounded-xl text-muted hover:bg-surface-3 hover:text-fg sm:size-10")}
            aria-label={unreadNotifications ? `Notifications, ${unreadNotifications > 9 ? "9+" : unreadNotifications} new` : "Notifications"}
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
            {...navProps("/contacts", "grid size-9 place-items-center rounded-xl text-muted hover:bg-surface-3 hover:text-fg sm:size-10")}
            aria-label="Contacts"
          >
            <BookUser className="size-5" />
          </Link>
          <Link
            href="/saved"
            {...navProps("/saved", "grid size-9 place-items-center rounded-xl text-muted hover:bg-surface-3 hover:text-fg sm:size-10")}
            aria-label="Starred messages"
          >
            <Star className="size-5" />
          </Link>
          <button
            type="button"
            onClick={(e) => {
              const r = e.currentTarget.getBoundingClientRect();
              setCompose({ x: r.right - 200, y: r.bottom + 4 });
            }}
            className="grid size-9 place-items-center rounded-xl text-muted hover:bg-surface-3 hover:text-fg sm:size-10"
            aria-label="New chat"
            aria-haspopup="menu"
          >
            <SquarePen className="size-5" />
          </button>
        </div>
        <ActionMenu
          anchor={compose}
          onClose={() => setCompose(null)}
          label="New"
          items={[
            { label: "New message", icon: UserRound, onSelect: () => input.current?.focus() },
            { label: "New group", icon: UsersRound, onSelect: () => setNewGroup(true) },
          ]}
        />
        {newGroupMounted && <NewGroupSheet open={newGroup} onClose={() => setNewGroup(false)} />}
        <label className="relative mt-3 block">
          <span className="sr-only">Search chats and people</span>
          <Search className="pointer-events-none absolute top-1/2 left-3.5 size-[18px] -translate-y-1/2 text-subtle" aria-hidden="true" />
          <input
            ref={input}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Escape" && setQuery("")}
            placeholder="Search chats, @people or messages"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            className="h-11 w-full rounded-2xl glass-input pr-10 pl-10 text-[15px] placeholder:text-subtle [&::-webkit-search-cancel-button]:hidden"
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
      </FloatingBar>

      {!me.emailVerified && <VerifyBanner />}
      {!searching && !showArchived && <InstallBanner />}

      <nav aria-label="Chats" className="pt-1">
        {searching && chatMatches.length > 0 && (
          <h3 className="px-5 pt-3 pb-1.5 text-xs font-bold tracking-wide text-fg/80 uppercase">Chats</h3>
        )}
        {!searching && !showArchived && archived.length > 0 && (
          <button
            type="button"
            onClick={() => setShowArchived(true)}
            className="glass-1 glass-sheen mx-2 mt-1 flex w-[calc(100%-1rem)] items-center gap-3 rounded-2xl px-2.5 py-2 text-left transition-transform active:scale-[0.97]"
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
        {chatMatches.length > VIRTUALIZE_AT ? (
          <VirtualChatList chats={chatMatches} meId={me.id} activeId={activeId} typing={typing} scroller={scroller} />
        ) : (
        <ul className="flex flex-col gap-1.5 py-1.5">
          <AnimatePresence initial={false}>
            {chatMatches.map((chat, i) => (
              <ChatListItem
                key={chat.id}
                prefetchContent={i < 6}
                chat={chat}
                meId={me.id}
                active={chat.id === activeId}
                typing={Boolean(typing[chat.id])}
              />
            ))}
          </AnimatePresence>
        </ul>
        )}

        {searching && <PeopleResults query={query} onOpened={() => setQuery("")} />}
        {searching && <PublicContactResults query={query} heading="Public contacts" />}
        {searching && <MessageResults query={query} meId={me.id} onOpened={() => setQuery("")} />}

        {showArchived && !searching && archived.length === 0 && (
          <p className="glass-1 mx-4 mt-4 rounded-2xl px-6 py-8 text-center text-[15px] text-muted">No archived chats. Swipe a chat or right-click it to archive.</p>
        )}

        {listEmpty && (
          <div className="glass-1 mx-4 mt-6 flex flex-col items-center gap-4 rounded-3xl px-6 py-8 text-center">
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
              className="glass-primary rounded-2xl px-5 py-2.5 text-[15px] font-semibold transition-transform active:scale-[0.97]"
            >
              Find people
            </button>
          </div>
        )}
      </nav>
    </div>
  );
}
