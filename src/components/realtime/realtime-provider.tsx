"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import type { RealtimeEvent } from "@/lib/chats/types";

/**
 * One Ably connection per tab, subscribed to the user's own `user:{id}` channel.
 * When real-time isn't available (not configured, or blocked by the network),
 * the app falls back to polling. Consumers don't care which: they subscribe to
 * events here, and refetch on "resync".
 */

export type ClientEvent = RealtimeEvent | { name: "resync"; data: null };
type Listener = (event: ClientEvent) => void;
export type RealtimeStatus = "connecting" | "live" | "reconnecting" | "polling";

type Ctx = { status: RealtimeStatus; subscribe: (l: Listener) => () => void };

const RealtimeContext = createContext<Ctx>({ status: "connecting", subscribe: () => () => {} });

export function useRealtime() {
  return useContext(RealtimeContext);
}

/** Subscribe to real-time events for the lifetime of the component. */
export function useRealtimeEvent(listener: Listener) {
  const { subscribe } = useRealtime();
  const ref = useRef(listener);
  useEffect(() => {
    ref.current = listener;
  });
  useEffect(() => subscribe((e) => ref.current(e)), [subscribe]);
}

const PING_MS = 60_000;
const PING_MIN_GAP_MS = 30_000;
let lastPing = 0;

function usePresenceHeartbeat() {
  useEffect(() => {
    const ping = () => {
      // Throttled across remounts and rapid focus changes (the server keeps 30s anyway).
      if (document.visibilityState !== "visible" || Date.now() - lastPing < PING_MIN_GAP_MS) return;
      lastPing = Date.now();
      fetch("/api/presence/ping", { method: "POST", credentials: "same-origin" }).catch(() => {});
    };
    ping();
    const t = setInterval(ping, PING_MS);
    document.addEventListener("visibilitychange", ping);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", ping);
    };
  }, []);
}

export function RealtimeProvider({ userId, children }: { userId: string; children: React.ReactNode }) {
  const [status, setStatus] = useState<RealtimeStatus>("connecting");
  const listeners = useRef(new Set<Listener>());

  const emit = useCallback((e: ClientEvent) => listeners.current.forEach((l) => l(e)), []);
  const subscribe = useCallback((l: Listener) => {
    listeners.current.add(l);
    return () => listeners.current.delete(l);
  }, []);

  usePresenceHeartbeat();

  useEffect(() => {
    let cancelled = false;
    let close: (() => void) | undefined;

    (async () => {
      // Probe first: if the server has no Ably key, skip loading the SDK at all.
      const probe = await fetch("/api/realtime/token", { credentials: "same-origin" }).catch(() => null);
      if (cancelled) return;
      if (!probe?.ok) {
        setStatus("polling");
        return;
      }
      const first = await probe.json();
      const Ably = await import("ably");
      if (cancelled) return;

      let usedFirst = false;
      const client = new Ably.Realtime({
        clientId: userId,
        closeOnUnload: true,
        authCallback: async (_params, cb) => {
          if (!usedFirst) {
            usedFirst = true;
            return cb(null, first);
          }
          try {
            const res = await fetch("/api/realtime/token", { credentials: "same-origin" });
            if (!res.ok) throw new Error(`token ${res.status}`);
            cb(null, await res.json());
          } catch (err) {
            cb(String(err), null);
          }
        },
      });

      let wasLive = false;
      client.connection.on((change) => {
        if (change.current === "connected") {
          setStatus("live");
          // After a gap, events may have been missed: let consumers refetch.
          if (wasLive) emit({ name: "resync", data: null });
          wasLive = true;
        } else if (change.current === "disconnected" || change.current === "connecting") {
          if (wasLive) setStatus("reconnecting");
        } else if (change.current === "suspended" || change.current === "failed") {
          setStatus("polling");
        }
      });

      const channel = client.channels.get(`user:${userId}`);
      channel.subscribe((msg) => emit({ name: msg.name, data: msg.data } as ClientEvent));
      channel.presence.enter().catch(() => {});
      close = () => client.close();
    })();

    return () => {
      cancelled = true;
      close?.();
    };
  }, [userId, emit]);

  // The connection state on <html data-realtime>, for the end-to-end tests (e2e/) to wait on.
  useEffect(() => {
    document.documentElement.dataset.realtime = status;
  }, [status]);

  return <RealtimeContext value={{ status, subscribe }}>{children}</RealtimeContext>;
}
