"use client";

import Link from "next/link";
import { forwardRef, useState, useSyncExternalStore } from "react";

// Prefetching links fetch other screens' code and data as soon as they're on
// screen, which competes with the page that is still loading. Hold prefetches
// until the page has loaded and the main thread is idle (plus a moment), then
// let every link prefetch as it normally would.
const SETTLE_MS = 1000;
let settled = false;
let armed = false;
const listeners = new Set<() => void>();

function arm() {
  if (armed) return;
  armed = true;
  const done = () => {
    settled = true;
    listeners.forEach((l) => l());
  };
  const afterLoad = () =>
    setTimeout(() => {
      if ("requestIdleCallback" in window) requestIdleCallback(done, { timeout: 3000 });
      else done();
    }, SETTLE_MS);
  if (document.readyState === "complete") afterLoad();
  else window.addEventListener("load", afterLoad, { once: true });
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  arm();
  return () => listeners.delete(cb);
}

/** False until the page has loaded and gone idle (always false on the server). */
export function usePageSettled(): boolean {
  return useSyncExternalStore(subscribe, () => settled, () => false);
}

/** next/link that starts prefetching only once the page has settled. */
export const IdleLink = forwardRef<HTMLAnchorElement, React.ComponentProps<typeof Link>>(function IdleLink({ prefetch, ...props }, ref) {
  const ready = usePageSettled();
  return <Link ref={ref} {...props} prefetch={ready ? prefetch : false} />;
});

/**
 * True from the first time `open` is true, and from then on: mount a lazily
 * loaded panel when it's first needed and keep it, so closing still animates.
 */
export function useMountOnce(open: boolean): boolean {
  const [ever, setEver] = useState(open);
  if (open && !ever) setEver(true);
  return ever || open;
}
