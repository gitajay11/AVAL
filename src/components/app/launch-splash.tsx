"use client";

import { useEffect } from "react";

/** The splash stays at least this long, so it reads as a launch screen, not a flicker. */
const MIN_MS = 1500;
/** Matches the .splash fade-out transition in globals.css. */
const FADE_MS = 300;

// In memory only (never stored): once this page load has dismissed the splash,
// nothing brings it back. In-app navigation keeps this module alive, and
// returning from the background resumes the same page.
let dismissed = false;

/**
 * Dismisses the launch splash rendered in app/layout.tsx: when the page has
 * loaded (the session and chat list come with the first HTML) and at least
 * MIN_MS have passed since the launch, it fades out over FADE_MS.
 */
export function LaunchSplash() {
  useEffect(() => {
    const el = document.getElementById("aval-splash");
    if (!el || dismissed) return;
    let cancelled = false;
    const loaded = new Promise<void>((resolve) => {
      if (document.readyState === "complete") resolve();
      else window.addEventListener("load", () => resolve(), { once: true });
    });
    // performance.now() counts from the start of the launch (the navigation).
    const minimum = new Promise<void>((resolve) => setTimeout(resolve, Math.max(0, MIN_MS - performance.now())));
    Promise.all([loaded, minimum]).then(() => {
      if (cancelled || dismissed) return;
      // After the next frame, so the app beneath has painted before it shows.
      requestAnimationFrame(() => {
        dismissed = true;
        el.classList.add("is-hiding");
        setTimeout(() => el.classList.add("is-gone"), FADE_MS);
      });
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return null;
}
