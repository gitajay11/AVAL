"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { MessageCircleMore, Search, Settings } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { cn } from "@/lib/cn";
import { UserProvider, type ClientUser } from "./user-context";
import { VerifyBanner } from "./verify-banner";

/**
 * Two panes on desktop (chat list + content); one pane on mobile, where the
 * list shows on /chats and the content pane slides in everywhere else.
 */
export function AppShell({ user, children }: { user: ClientUser; children: React.ReactNode }) {
  const pathname = usePathname();
  const listRoute = pathname === "/chats";

  return (
    <UserProvider user={user}>
      <div className="flex h-dvh overflow-hidden bg-bg">
        <aside
          className={cn(
            "flex w-full flex-col border-line bg-surface md:w-[360px] md:shrink-0 md:border-r lg:w-[400px]",
            !listRoute && "hidden md:flex",
          )}
        >
          <header className="glass sticky top-0 z-10 flex items-center gap-3 px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3">
            <Link href="/settings" className="rounded-full" aria-label="Open settings">
              <Avatar name={user.displayName} src={user.avatarUrl} size={38} />
            </Link>
            <h1 className="flex-1 text-xl font-extrabold tracking-tight">Chats</h1>
            <Link
              href="/settings"
              className="grid size-10 place-items-center rounded-xl text-muted hover:bg-surface-3 hover:text-fg"
              aria-label="Settings"
            >
              <Settings className="size-5" />
            </Link>
          </header>

          {!user.emailVerified && <VerifyBanner />}

          <div className="px-3 pb-2">
            <label className="relative block">
              <span className="sr-only">Search</span>
              <Search className="pointer-events-none absolute top-1/2 left-3.5 size-[18px] -translate-y-1/2 text-subtle" aria-hidden="true" />
              <input
                type="search"
                disabled
                placeholder="Search people and chats"
                className="h-11 w-full rounded-2xl bg-surface-3 pr-4 pl-10 text-[15px] placeholder:text-subtle disabled:cursor-not-allowed"
              />
            </label>
          </div>

          <div className="flex flex-1 flex-col items-center justify-center gap-4 px-8 pb-[env(safe-area-inset-bottom)] text-center">
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
              <p className="mt-1 text-[15px] text-muted">People search and messaging arrive with the next update.</p>
            </div>
          </div>
        </aside>

        <main className={cn("relative min-w-0 flex-1", listRoute && "hidden md:block")}>
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.div
              key={pathname}
              initial={{ opacity: 0, x: 24 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0 }}
              transition={{ type: "spring", stiffness: 380, damping: 36 }}
              className="h-full"
            >
              {children}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
    </UserProvider>
  );
}

export function AppShellSkeleton() {
  return (
    <div className="flex h-dvh bg-bg" aria-busy="true" aria-label="Loading">
      <aside className="flex w-full flex-col gap-3 bg-surface p-4 md:w-[360px] md:border-r md:border-line lg:w-[400px]">
        <div className="flex items-center gap-3">
          <div className="size-[38px] rounded-full bg-surface-3" />
          <div className="h-5 w-24 rounded-lg bg-surface-3" />
        </div>
        <div className="h-11 rounded-2xl bg-surface-3" />
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="flex items-center gap-3 py-1.5">
            <div className="size-12 rounded-full bg-surface-3" />
            <div className="flex flex-1 flex-col gap-2">
              <div className="h-4 w-1/2 rounded-md bg-surface-3" />
              <div className="h-3.5 w-3/4 rounded-md bg-surface-3" />
            </div>
          </div>
        ))}
      </aside>
      <main className="hidden flex-1 md:block" />
    </div>
  );
}
