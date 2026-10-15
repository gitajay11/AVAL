"use client";

import { useSyncExternalStore } from "react";

// Hooks for showing times. Components render nothing for times on the server and
// fill them in on hydration, so there is never a mismatch.

export { dayKey, formatClock, formatDay, formatLastSeen, formatListTime } from "@/lib/dates";

// A minute-resolution clock shared by every relative time on screen.
let minute = 0;
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | undefined;

function subscribe(cb: () => void) {
  listeners.add(cb);
  timer ??= setInterval(() => {
    minute = Math.floor(Date.now() / 60000);
    listeners.forEach((l) => l());
  }, 15_000);
  return () => {
    listeners.delete(cb);
    if (listeners.size === 0 && timer) {
      clearInterval(timer);
      timer = undefined;
    }
  };
}

/** Re-renders the caller once a minute. Returns null during server render. */
export function useMinute(): number | null {
  return useSyncExternalStore(
    subscribe,
    () => minute || (minute = Math.floor(Date.now() / 60000)),
    () => null,
  );
}

/** A formatted time that only exists on the client. */
export function ClientTime({ iso, format }: { iso: string; format: (iso: string) => string }) {
  const tick = useMinute();
  if (tick === null) return null;
  return <time dateTime={iso}>{format(iso)}</time>;
}
