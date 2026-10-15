"use client";

import { createContext, use, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { registration } from "@/lib/client/push";

/** Chromium's install prompt event (not in the DOM typings). */
type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

declare global {
  interface Window {
    /** Set by the inline head script when the prompt fires before React hydrates. */
    __avalInstall?: InstallPromptEvent;
  }
}

/** Runs in <head>: keep Chrome's own mini-infobar away and hold the event for our UI. */
export const installScript = `window.addEventListener("beforeinstallprompt",function(e){e.preventDefault();window.__avalInstall=e;});`;

export const BUILD_ID = process.env.NEXT_PUBLIC_BUILD_ID ?? "dev";
const DISMISS_COOKIE = "aval-install";
const UPDATE_CHECK_MS = 30 * 60_000;

type InstallMode = "prompt" | "ios" | "installed" | "unavailable";

type Pwa = {
  /** How (or whether) this browser can install the app right now. */
  install: InstallMode;
  /** Shows the browser's install dialog (mode "prompt"). Resolves true if accepted. */
  promptInstall: () => Promise<boolean>;
  /** The install banner was dismissed on this device. */
  dismissed: boolean;
  dismiss: () => void;
  /** A newer build is live than the one this tab is running. */
  updateReady: boolean;
  checkForUpdate: () => Promise<boolean>;
};

const PwaContext = createContext<Pwa | null>(null);

export function usePwa() {
  const ctx = use(PwaContext);
  if (!ctx) throw new Error("usePwa outside PwaProvider");
  return ctx;
}

const standaloneQuery = () => window.matchMedia("(display-mode: standalone)");
const isStandalone = () => standaloneQuery().matches || (navigator as { standalone?: boolean }).standalone === true;
const subscribeStandalone = (cb: () => void) => {
  const q = standaloneQuery();
  q.addEventListener("change", cb);
  return () => q.removeEventListener("change", cb);
};
// iPadOS reports itself as a Mac; touch support tells them apart.
const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.userAgent.includes("Mac") && navigator.maxTouchPoints > 1);
const noop = () => () => {};

/**
 * Registers the service worker, holds the install prompt, and notices new
 * deploys. Nothing here is stored except a "banner dismissed" cookie.
 */
export function PwaProvider({ children }: { children: React.ReactNode }) {
  const standalone = useSyncExternalStore(subscribeStandalone, isStandalone, () => false);
  const ios = useSyncExternalStore(noop, isIOS, () => false);
  const [prompt, setPrompt] = useState<InstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(() => typeof document !== "undefined" && document.cookie.includes(`${DISMISS_COOKIE}=dismissed`));
  const [updateReady, setUpdateReady] = useState(false);
  const lastCheck = useRef(0);

  useEffect(() => {
    const take = (e: Event) => {
      e.preventDefault();
      setPrompt(e as InstallPromptEvent);
    };
    const installed = () => {
      setPrompt(null);
      window.__avalInstall = undefined;
    };
    // An event caught before hydration by the head script.
    queueMicrotask(() => window.__avalInstall && setPrompt(window.__avalInstall));
    window.addEventListener("beforeinstallprompt", take);
    window.addEventListener("appinstalled", installed);
    return () => {
      window.removeEventListener("beforeinstallprompt", take);
      window.removeEventListener("appinstalled", installed);
    };
  }, []);

  const checkForUpdate = useCallback(async () => {
    lastCheck.current = Date.now();
    try {
      const res = await fetch("/api/version", { cache: "no-store" });
      const { version } = (await res.json()) as { version: string };
      const newer = version !== BUILD_ID;
      setUpdateReady(newer);
      return newer;
    } catch {
      return false;
    }
  }, []);

  useEffect(() => {
    const register = () => void registration().catch(() => {});
    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });

    if (BUILD_ID === "dev") return;
    const onVisible = () => {
      if (document.visibilityState === "visible" && Date.now() - lastCheck.current > UPDATE_CHECK_MS) void checkForUpdate();
    };
    const timer = setInterval(onVisible, UPDATE_CHECK_MS);
    document.addEventListener("visibilitychange", onVisible);
    lastCheck.current = Date.now();
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("load", register);
    };
  }, [checkForUpdate]);

  const promptInstall = useCallback(async () => {
    if (!prompt) return false;
    await prompt.prompt();
    const { outcome } = await prompt.userChoice;
    // A prompt event can only be used once.
    setPrompt(null);
    window.__avalInstall = undefined;
    return outcome === "accepted";
  }, [prompt]);

  const dismiss = useCallback(() => {
    const secure = location.protocol === "https:" ? "; Secure" : "";
    document.cookie = `${DISMISS_COOKIE}=dismissed; Max-Age=${60 * 60 * 24 * 90}; Path=/; SameSite=Lax${secure}`;
    setDismissed(true);
  }, []);

  const install: InstallMode = standalone ? "installed" : prompt ? "prompt" : ios ? "ios" : "unavailable";

  const value = useMemo<Pwa>(
    () => ({ install, promptInstall, dismissed, dismiss, updateReady, checkForUpdate }),
    [install, promptInstall, dismissed, dismiss, updateReady, checkForUpdate],
  );
  return <PwaContext value={value}>{children}</PwaContext>;
}
