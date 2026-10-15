"use client";

import { api } from "./api";
import { disablePush } from "./push";

/**
 * End this session (or all of them), unsubscribe this device from push, wipe any
 * Cache Storage the service worker holds, and hard-reload to /login so no
 * in-memory state survives.
 */
export async function signOut(everywhere = false) {
  try {
    // Stop this device's notifications before the session ends (needs the cookie).
    await disablePush().catch(() => {});
    await api(everywhere ? "/api/auth/logout-all" : "/api/auth/logout", { method: "POST" });
  } finally {
    if ("caches" in window) {
      const keys = await caches.keys().catch(() => []);
      await Promise.all(keys.map((k) => caches.delete(k)));
    }
    window.location.replace("/login");
  }
}
