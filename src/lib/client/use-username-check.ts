"use client";

import { useEffect, useState } from "react";
import { usernameProblem } from "@/lib/validation/auth";
import { api } from "./api";

export type UsernameState =
  | { status: "idle" }
  | { status: "invalid"; reason: string }
  | { status: "checking" }
  | { status: "available" }
  | { status: "taken"; reason: string }
  | { status: "error" };

type ServerResult = { name: string; state: UsernameState };

/** Live availability: validates locally first, then asks the server (debounced, cancellable). */
export function useUsernameCheck(value: string, delay = 350): UsernameState {
  const name = value.trim().toLowerCase();
  const problem = name ? usernameProblem(name) : null;
  const [result, setResult] = useState<ServerResult | null>(null);

  useEffect(() => {
    if (!name || problem) return;
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      try {
        const res = await api<{ available: boolean; reason?: string }>(
          `/api/auth/username-available?u=${encodeURIComponent(name)}`,
          { signal: ctrl.signal },
        );
        setResult({
          name,
          state: res.available ? { status: "available" } : { status: "taken", reason: res.reason ?? "Unavailable" },
        });
      } catch (err) {
        if ((err as Error).name !== "AbortError") setResult({ name, state: { status: "error" } });
      }
    }, delay);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [name, problem, delay]);

  if (!name) return { status: "idle" };
  if (problem) return { status: "invalid", reason: problem };
  // A result for an older value is stale: still checking the current one.
  return result?.name === name ? result.state : { status: "checking" };
}
