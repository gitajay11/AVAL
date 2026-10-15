"use client";

import { api } from "./api";

/**
 * End this session (or all of them), wipe any Cache Storage the service worker
 * holds, and hard-reload to /login so no in-memory state survives.
 */
export async function signOut(everywhere = false) {
  try {
    await api(everywhere ? "/api/auth/logout-all" : "/api/auth/logout", { method: "POST" });
  } finally {
    if ("caches" in window) {
      const keys = await caches.keys().catch(() => []);
      await Promise.all(keys.map((k) => caches.delete(k)));
    }
    window.location.replace("/login");
  }
}
