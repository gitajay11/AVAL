"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Bell, ChevronLeft } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import { api, ClientApiError } from "@/lib/client/api";
import { ClientTime, formatListTime } from "@/lib/client/time";
import type { NotificationDTO } from "@/lib/contacts/types";
import { describe, useNotifications } from "./notifications-provider";

/** One request row with inline Approve / Decline for the owner. */
function RequestActions({ n }: { n: NotificationDTO }) {
  const toast = useToast();
  const [state, setState] = useState<"idle" | "busy" | "approved" | "declined" | "gone">("idle");

  async function decide(decision: "approve" | "decline") {
    setState("busy");
    try {
      await api(`/api/contacts/${n.payload.contactId}/requests/${n.payload.requestId}`, { body: { decision } });
      setState(decision === "approve" ? "approved" : "declined");
    } catch (err) {
      // Already decided elsewhere, cancelled, or the contact went private.
      setState("gone");
      if (err instanceof ClientApiError && err.status !== 404) toast(err.message, "error");
    }
  }

  if (state === "approved") return <p className="text-sm font-semibold text-accent">Approved</p>;
  if (state === "declined") return <p className="text-sm text-muted">Declined</p>;
  if (state === "gone") return <p className="text-sm text-muted">No longer pending</p>;
  return (
    <div className="flex gap-2">
      <Button size="sm" loading={state === "busy"} onClick={() => decide("approve")}>
        Approve
      </Button>
      <Button size="sm" variant="secondary" disabled={state === "busy"} onClick={() => decide("decline")}>
        Decline
      </Button>
    </div>
  );
}

export function NotificationsView() {
  const { notifications, markAllRead } = useNotifications();
  // Opening the page marks everything as read (after showing what was new).
  const [unreadIds] = useState(() => new Set(notifications?.filter((n) => !n.readAt).map((n) => n.id)));
  useEffect(() => {
    markAllRead();
  }, [markAllRead]);

  return (
    <div className="h-full overflow-y-auto">
      <header className="glass sticky top-0 z-10 flex items-center gap-2 border-b border-line px-3 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3">
        <Link href="/chats" className="grid size-10 place-items-center rounded-xl hover:bg-surface-3 md:hidden" aria-label="Back to chats">
          <ChevronLeft className="size-6" />
        </Link>
        <h1 className="px-1 text-xl font-extrabold tracking-tight">Notifications</h1>
      </header>
      <div className="mx-auto flex max-w-2xl flex-col gap-2 px-4 py-5 pb-[max(2rem,env(safe-area-inset-bottom))]">
        {notifications === null ? (
          [0, 1, 2].map((i) => <Skeleton key={i} className="h-20 rounded-[20px]" />)
        ) : notifications.length === 0 ? (
          <div className="flex flex-col items-center gap-3 pt-16 text-center">
            <span className="grid size-16 place-items-center rounded-[22px] bg-brand text-white">
              <Bell className="size-7" aria-hidden="true" />
            </span>
            <p className="text-lg font-bold">You&apos;re all caught up</p>
            <p className="max-w-xs text-[15px] text-muted">Requests to view your public contacts, and replies to yours, show up here.</p>
          </div>
        ) : (
          notifications.map((n) => (
            <article
              key={n.id}
              className={cn(
                "flex gap-3 rounded-[20px] border border-line bg-surface p-4 shadow-[var(--shadow-sm)]",
                unreadIds?.has(n.id) && "border-accent/40 bg-accent-soft",
              )}
            >
              <Avatar name={n.payload.user?.displayName ?? n.payload.contactName} size={44} />
              <div className="min-w-0 flex-1">
                <p className="text-[15px] leading-snug">
                  {describe(n)}
                  {n.type === "ACCESS_REQUEST" && n.payload.user && <span className="text-muted"> · @{n.payload.user.username}</span>}
                </p>
                {n.payload.note && <p className="mt-1 rounded-xl bg-surface-2 px-3 py-2 text-sm italic">“{n.payload.note}”</p>}
                <p className="mt-1 text-xs text-subtle">
                  <ClientTime iso={n.createdAt} format={formatListTime} />
                </p>
                <div className="mt-2.5">
                  {n.type === "ACCESS_REQUEST" &&
                    (n.actionable && n.payload.requestId ? <RequestActions n={n} /> : <p className="text-sm text-muted">No longer pending</p>)}
                  {n.type === "ACCESS_APPROVED" && n.payload.chatId && (
                    <Link href={`/chats/${n.payload.chatId}`} className="text-sm font-semibold text-accent hover:underline">
                      Open {n.payload.contactName}
                    </Link>
                  )}
                  {n.type === "ACCESS_REQUEST" && n.actionable && (
                    <Link href={`/contacts/${n.payload.contactId}`} className="ml-0 block pt-2 text-sm font-semibold text-accent hover:underline">
                      Manage access
                    </Link>
                  )}
                </div>
              </div>
            </article>
          ))
        )}
      </div>
    </div>
  );
}
