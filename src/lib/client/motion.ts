"use client";

/** "smooth", unless the OS asks for reduced motion (CSS and Motion handle the rest; this covers JS scrolling). */
export function scrollBehavior(): "smooth" | "auto" {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
}
