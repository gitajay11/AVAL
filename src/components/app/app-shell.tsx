"use client";

import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { ChatSidebar } from "@/components/chats/chat-sidebar";
import { ChatsProvider } from "@/components/chats/chat-store";
import { LightboxProvider } from "@/components/chats/media/lightbox";
import { NotificationsProvider } from "@/components/notifications/notifications-provider";
import { RealtimeProvider } from "@/components/realtime/realtime-provider";
import { cn } from "@/lib/cn";
import type { ChatListItemDTO } from "@/lib/chats/types";
import { ServiceWorker } from "./service-worker";
import { UserProvider, type ClientUser } from "./user-context";

/**
 * Two panes on desktop (chat list + content); one pane on mobile, where the
 * list shows on /chats and the content pane slides in everywhere else.
 */
export function AppShell({
  user,
  initialChats,
  children,
}: {
  user: ClientUser;
  initialChats: ChatListItemDTO[];
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const listRoute = pathname === "/chats";

  return (
    <UserProvider user={user}>
      <ServiceWorker />
      <RealtimeProvider userId={user.id}>
        <ChatsProvider meId={user.id} initialChats={initialChats}>
          <NotificationsProvider>
          <LightboxProvider>
          <div className="flex h-dvh overflow-hidden bg-bg">
            <aside
              className={cn(
                "flex w-full flex-col border-line bg-surface md:w-[360px] md:shrink-0 md:border-r lg:w-[400px]",
                !listRoute && "hidden md:flex",
              )}
            >
              <ChatSidebar />
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
          </LightboxProvider>
          </NotificationsProvider>
        </ChatsProvider>
      </RealtimeProvider>
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
            <div className="size-[52px] rounded-full bg-surface-3" />
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
