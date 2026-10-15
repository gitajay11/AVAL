"use client";

import { useEffect, useState } from "react";
import { useRealtimeEvent } from "@/components/realtime/realtime-provider";
import { api } from "@/lib/client/api";
import type { PresenceDTO } from "@/lib/chats/types";

const REFRESH_MS = 30_000;

/** A user's online/last-seen as the server allows us to see it. Live via events, refreshed every 30s. */
export function usePresence(userId: string | null): PresenceDTO | null {
  const [state, setState] = useState<{ userId: string; presence: PresenceDTO } | null>(null);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    const load = () => {
      if (document.visibilityState !== "visible") return;
      api<{ presence: PresenceDTO }>(`/api/users/${userId}/presence`)
        .then((r) => !cancelled && setState({ userId, presence: r.presence }))
        .catch(() => {});
    };
    load();
    const t = setInterval(load, REFRESH_MS);
    document.addEventListener("visibilitychange", load);
    return () => {
      cancelled = true;
      clearInterval(t);
      document.removeEventListener("visibilitychange", load);
    };
  }, [userId]);

  useRealtimeEvent((e) => {
    if (e.name === "presence" && e.data.userId === userId) setState({ userId, presence: e.data.presence });
  });

  return state && state.userId === userId ? state.presence : null;
}
