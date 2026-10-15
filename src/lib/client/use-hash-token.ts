"use client";

import { useEffect, useState } from "react";

// Captured once per page load, at module level, so a remount (StrictMode, Fast
// Refresh, an error boundary retry) still sees the token after the URL is cleaned.
let captured: string | null | undefined;

function captureToken(): string | null {
  if (captured === undefined) {
    captured = new URLSearchParams(location.hash.slice(1)).get("token");
    if (captured) history.replaceState(history.state, "", location.pathname);
  }
  return captured;
}

/**
 * Email links carry the token in the URL fragment (#token=…), which browsers never
 * send to servers or put in Referer headers. Read it once, then drop it from the URL.
 * Returns undefined until mounted, then the token or null.
 */
export function useHashToken(): string | null | undefined {
  const [token, setToken] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time read of browser-only state
    setToken(captureToken());
  }, []);
  return token;
}

const inflight = new Map<string, Promise<unknown>>();

/** Run a single-use-token request at most once per page load, even across remounts. */
export function once<T>(key: string, run: () => Promise<T>): Promise<T> {
  if (!inflight.has(key)) inflight.set(key, run());
  return inflight.get(key) as Promise<T>;
}
