"use client";

import { useEffect } from "react";
import { registration } from "@/lib/client/push";

/** Registers /sw.js once the app has loaded (push now; the app-shell cache comes in Phase 6). */
export function ServiceWorker() {
  useEffect(() => {
    const run = () => void registration().catch(() => {});
    if (document.readyState === "complete") run();
    else window.addEventListener("load", run, { once: true });
  }, []);
  return null;
}
