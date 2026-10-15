"use client";

import { useEffect, useSyncExternalStore } from "react";
import { THEME_COOKIE } from "@/lib/auth/cookie";

export type ThemePref = "system" | "light" | "dark";

/**
 * Runs before first paint (inlined in <head>): resolves the saved preference
 * (a UI-only cookie) or the OS setting into data-theme, so there's no flash.
 */
export const themeScript = `(function(){try{var m=document.cookie.match(/(?:^|; )${THEME_COOKIE}=(light|dark|system)/);var p=m?m[1]:"system";var d=p==="dark"||(p==="system"&&matchMedia("(prefers-color-scheme: dark)").matches);var r=document.documentElement;r.dataset.theme=d?"dark":"light";r.dataset.themePref=p;}catch(e){}})();`;

const listeners = new Set<() => void>();

function apply(pref: ThemePref) {
  const dark = pref === "dark" || (pref === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
  const root = document.documentElement;
  root.dataset.theme = dark ? "dark" : "light";
  root.dataset.themePref = pref;
  listeners.forEach((l) => l());
}

export function setThemePref(pref: ThemePref) {
  document.cookie = `${THEME_COOKIE}=${pref}; Path=/; Max-Age=31536000; SameSite=Lax${location.protocol === "https:" ? "; Secure" : ""}`;
  apply(pref);
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function useThemePref(): ThemePref {
  return useSyncExternalStore(
    subscribe,
    () => (document.documentElement.dataset.themePref as ThemePref) ?? "system",
    () => "system",
  );
}

/** Keeps "system" in sync when the OS switches between light and dark. */
export function ThemeWatcher() {
  useEffect(() => {
    const mq = matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      if ((document.documentElement.dataset.themePref ?? "system") === "system") apply("system");
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return null;
}
