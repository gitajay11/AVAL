"use client";

import { useEffect, useRef } from "react";

// The colourful layer the glass sits on: a deep base with four large, soft
// blobs (jade, ocean, mint) drifting slowly, plus a faint grain so frosted
// surfaces read as glass rather than flat tints. Pure CSS (globals.css):
// transforms only, static under reduced motion, hidden under reduced transparency.
//
// The drift pauses while anything scrolls: moving blobs make every blurred
// surface above them re-render each frame, which measurably costs scrolling
// smoothness on slower phones (about 30 vs 45 fps at 4× CPU throttling).

type Blob = { color: string; opacity: string; style: React.CSSProperties };

// Centres inside the viewport, so colour shows behind the list, the chat and the
// headers (not just in the corners).
const BLOBS: Blob[] = [
  { color: "var(--jade)", opacity: "var(--blob-jade)", style: { top: "-18vmax", left: "-22vmax" } },
  { color: "var(--ocean)", opacity: "var(--blob-ocean)", style: { top: "10vh", right: "-30vmax" } },
  { color: "var(--mint)", opacity: "var(--blob-mint)", style: { bottom: "-28vmax", left: "5vw" } },
  { color: "var(--jade)", opacity: "var(--blob-mint)", style: { top: "35vh", left: "-35vmax" } },
];

const RESUME_AFTER_MS = 300;

export function Backdrop() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    // Scroll doesn't bubble, but a capturing listener on the document sees every scroller.
    const onScroll = () => {
      if (!el.dataset.paused) el.dataset.paused = "";
      clearTimeout(timer);
      timer = setTimeout(() => delete el.dataset.paused, RESUME_AFTER_MS);
    };
    document.addEventListener("scroll", onScroll, { capture: true, passive: true });
    return () => {
      document.removeEventListener("scroll", onScroll, { capture: true });
      clearTimeout(timer);
    };
  }, []);

  return (
    <>
      <div ref={ref} className="aval-backdrop" aria-hidden="true">
        {BLOBS.map((b, i) => (
          <div
            key={i}
            className="aval-blob"
            style={{ ...b.style, "--blob-color": b.color, "--blob-opacity": b.opacity } as React.CSSProperties}
          />
        ))}
      </div>
      <div className="aval-grain" aria-hidden="true" />
    </>
  );
}
