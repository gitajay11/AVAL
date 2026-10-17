"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { cn } from "@/lib/cn";

/**
 * Floating glass header: inset from the screen edges, rounded, gradient
 * hairline, soft shadow. Sticks to the top of its scroll container and shrinks
 * slightly (transform only) once the content scrolls under it.
 */
export const FloatingBar = forwardRef<HTMLElement, React.HTMLAttributes<HTMLElement>>(function FloatingBar(
  { className, children, ...rest },
  ref,
) {
  const el = useRef<HTMLElement>(null);
  useImperativeHandle(ref, () => el.current as HTMLElement);
  const [compact, setCompact] = useState(false);

  useEffect(() => {
    let scroller = el.current?.parentElement ?? null;
    while (scroller && !/(auto|scroll)/.test(getComputedStyle(scroller).overflowY)) scroller = scroller.parentElement;
    if (!scroller) return;
    const s = scroller;
    const onScroll = () => setCompact(s.scrollTop > 6);
    s.addEventListener("scroll", onScroll, { passive: true });
    return () => s.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      ref={el}
      data-compact={compact || undefined}
      className={cn("floating-bar glass-2 sticky top-[max(0.5rem,env(safe-area-inset-top))] z-10 mx-2 mt-[max(0.5rem,env(safe-area-inset-top))] rounded-[22px] sm:mx-3", className)}
      {...rest}
    >
      {children}
    </header>
  );
});
