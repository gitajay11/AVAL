"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useRealtime, useRealtimeEvent } from "@/components/realtime/realtime-provider";
import { useToast } from "@/components/ui/toast";
import { api } from "@/lib/client/api";
import type { NotificationDTO } from "@/lib/contacts/types";

type Ctx = {
  notifications: NotificationDTO[] | null;
  unread: number;
  refresh: () => Promise<void>;
  markAllRead: () => void;
};

const NotificationsContext = createContext<Ctx | null>(null);

export function useNotifications(): Ctx {
  const ctx = useContext(NotificationsContext);
  if (!ctx) throw new Error("useNotifications must be used inside NotificationsProvider");
  return ctx;
}

const POLL_MS = 30_000;

export function describe(n: NotificationDTO): string {
  const name = `“${n.payload.contactName}”`;
  switch (n.type) {
    case "ACCESS_REQUEST":
      return `${n.payload.user?.displayName ?? "Someone"} asked to view ${name}`;
    case "ACCESS_APPROVED":
      return `You can now view ${name}`;
    case "ACCESS_DECLINED":
      return `Your request to view ${name} was declined`;
    case "ACCESS_REVOKED":
      return `Your access to ${name} has ended`;
  }
}

/** In-app notifications (access requests and decisions), kept in memory only. */
export function NotificationsProvider({ children }: { children: React.ReactNode }) {
  const toast = useToast();
  const { status } = useRealtime();
  const [notifications, setNotifications] = useState<NotificationDTO[] | null>(null);
  const [unread, setUnread] = useState(0);

  const refresh = useCallback(
    () =>
      api<{ notifications: NotificationDTO[]; unread: number }>("/api/notifications").then((r) => {
        setNotifications(r.notifications);
        setUnread(r.unread);
      }),
    [],
  );

  // Initial load (state is set in the response callback, not synchronously).
  useEffect(() => {
    api<{ notifications: NotificationDTO[]; unread: number }>("/api/notifications")
      .then((r) => {
        setNotifications(r.notifications);
        setUnread(r.unread);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (status !== "polling") return;
    const t = setInterval(() => document.visibilityState === "visible" && refresh().catch(() => {}), POLL_MS);
    return () => clearInterval(t);
  }, [status, refresh]);

  useRealtimeEvent((e) => {
    if (e.name === "notification.new") {
      setNotifications((list) => [e.data.notification, ...(list ?? [])]);
      setUnread((n) => n + 1);
      toast(describe(e.data.notification));
    }
    if (e.name === "resync") refresh().catch(() => {});
  });

  const markAllRead = useCallback(() => {
    setUnread(0);
    setNotifications((list) => list?.map((n) => (n.readAt ? n : { ...n, readAt: new Date().toISOString() })) ?? null);
    api("/api/notifications/read", { body: {} }).catch(() => {});
  }, []);

  const value = useMemo(() => ({ notifications, unread, refresh, markAllRead }), [notifications, unread, refresh, markAllRead]);
  return <NotificationsContext value={value}>{children}</NotificationsContext>;
}
