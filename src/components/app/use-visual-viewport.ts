"use client";

import { useEffect } from "react";

/**
 * Keeps the app shell (.app-shell in globals.css) exactly over the visible part
 * of the screen. Android resizes the page for the keyboard
 * (interactive-widget=resizes-content), but iOS doesn't: it shrinks only the
 * visual viewport and slides it over the page, which would leave the composer
 * under the keyboard. So the shell follows the visual viewport's height and
 * offset, and the page itself is locked at the top.
 */
export function useVisualViewport() {
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return; // Old browsers: the CSS 100dvh / 100vh fallback applies.
    const root = document.documentElement;
    let frame = 0;
    const apply = () => {
      frame = 0;
      // Pinch-zoomed in: leave the shell as it is (it would shrink to the zoomed area).
      if (vv.scale > 1.01) return;
      root.style.setProperty("--vv-height", `${Math.round(vv.height)}px`);
      root.style.setProperty("--vv-top", `${Math.round(vv.offsetTop)}px`);
      root.dataset.vv = "";
      // iOS may still scroll the locked page to reveal a focused field: undo it.
      if (window.scrollY !== 0) window.scrollTo(0, 0);
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(apply);
    };
    apply();
    vv.addEventListener("resize", schedule);
    vv.addEventListener("scroll", schedule);
    window.addEventListener("orientationchange", schedule);
    return () => {
      cancelAnimationFrame(frame);
      vv.removeEventListener("resize", schedule);
      vv.removeEventListener("scroll", schedule);
      window.removeEventListener("orientationchange", schedule);
      delete root.dataset.vv;
      root.style.removeProperty("--vv-height");
      root.style.removeProperty("--vv-top");
    };
  }, []);
}
