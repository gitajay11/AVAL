"use client";

import { animate, AnimatePresence, motion, useMotionValue, useReducedMotion, useTransform } from "motion/react";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { Avatar } from "./avatar";

type Open = { el: HTMLElement; src: string; name: string; /** Shown under the name. */ username?: string | null };
const ViewerContext = createContext<(o: Open) => void>(() => {});

/** The 1080px copy of an avatar served by our media routes (falls back to the small one). */
function fullUrl(src: string): string {
  return src.startsWith("/api/media/") ? `${src}${src.includes("?") ? "&" : "?"}size=full` : src;
}

const MAX_ZOOM = 4;
const DOUBLE_TAP_ZOOM = 2.5;
const CLOSE_DRAG = 120;

/**
 * Full-screen profile photo: zooms out of the avatar that was tapped (and back
 * into it on close), pinch or double-tap to zoom, drag to pan, swipe down to
 * close, over a blurred backdrop. Esc closes; + / − zoom from the keyboard.
 */
export function AvatarViewerProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState<Open | null>(null);
  return (
    <ViewerContext value={setOpen}>
      {children}
      {typeof document !== "undefined" &&
        createPortal(<AnimatePresence>{open && <Viewer key={open.src} {...open} onClose={() => setOpen(null)} />}</AnimatePresence>, document.body)}
    </ViewerContext>
  );
}

export function useAvatarViewer() {
  return useContext(ViewerContext);
}

/** An avatar that opens the viewer when it has a photo. */
export function ViewableAvatar({ name, src, size, className, username }: { name: string; src: string | null; size: number; className?: string; username?: string | null }) {
  const view = useAvatarViewer();
  if (!src) return <Avatar name={name} src={null} size={size} className={className} />;
  return (
    <button type="button" onClick={(e) => view({ el: e.currentTarget, src, name, username })} className="grid rounded-full" aria-label={`View ${name}'s photo`}>
      <Avatar name={name} src={src} size={size} className={className} />
    </button>
  );
}

function Viewer({ el, src, name, username, onClose }: Open & { onClose: () => void }) {
  const reduce = useReducedMotion();
  const [full, setFull] = useState<"loading" | "ready" | "failed">("loading");
  const [vw, setVw] = useState(() => window.innerWidth);
  const [vh, setVh] = useState(() => window.innerHeight);
  const side = Math.min(vw, vh) - 32;
  // Where the avatar sits on the page, relative to the centred photo.
  const from = useCallback(() => {
    const r = el.isConnected ? el.getBoundingClientRect() : null;
    if (!r || !r.width) return { x: 0, y: 40, scale: 0.6, borderRadius: "50%" };
    return { x: r.left + r.width / 2 - vw / 2, y: r.top + r.height / 2 - vh / 2, scale: r.width / side, borderRadius: "50%" };
  }, [el, side, vh, vw]);
  const [origin] = useState(from);

  const zoom = useMotionValue(1);
  const panX = useMotionValue(0);
  const panY = useMotionValue(0);
  const dragY = useMotionValue(0);
  const backdrop = useTransform(dragY, [0, 300], [1, 0.25]);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ dist: number; zoom: number; x: number; y: number; panX: number; panY: number } | null>(null);
  const lastTap = useRef<{ t: number; x: number; y: number } | null>(null);
  const closeBtn = useRef<HTMLButtonElement>(null);


  useEffect(() => {
    closeBtn.current?.focus();
    const previous = document.activeElement as HTMLElement | null;
    const onResize = () => {
      setVw(window.innerWidth);
      setVh(window.innerHeight);
    };
    // Captured on window: ahead of a sheet underneath, which would close itself instead.
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
      if (e.key === "+" || e.key === "=") setZoom(Math.min(MAX_ZOOM, zoom.get() * 1.5));
      if (e.key === "-") setZoom(Math.max(1, zoom.get() / 1.5));
    };
    window.addEventListener("resize", onResize);
    window.addEventListener("keydown", onKey, true);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("keydown", onKey, true);
      document.body.style.overflow = overflow;
      previous?.focus?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const spring = { type: "spring" as const, stiffness: 420, damping: 38 };
  const clampPan = (z: number, x: number, y: number) => {
    const max = (side * (z - 1)) / 2;
    return { x: Math.max(-max, Math.min(max, x)), y: Math.max(-max, Math.min(max, y)) };
  };
  function setZoom(z: number, at?: { x: number; y: number }) {
    // Zoom towards the point (relative to the photo's centre).
    const k = z / zoom.get();
    const target = at ? clampPan(z, (panX.get() - at.x) * k + at.x, (panY.get() - at.y) * k + at.y) : clampPan(z, panX.get() * k, panY.get() * k);
    animate(zoom, z, spring);
    animate(panX, z === 1 ? 0 : target.x, spring);
    animate(panY, z === 1 ? 0 : target.y, spring);
  }

  function local(e: React.PointerEvent) {
    return { x: e.clientX - vw / 2, y: e.clientY - vh / 2 };
  }

  function onDown(e: React.PointerEvent<HTMLDivElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const pts = [...pointers.current.values()];
    const dist = pts.length === 2 ? Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) : 0;
    gesture.current = { dist, zoom: zoom.get(), x: e.clientX, y: e.clientY, panX: panX.get(), panY: panY.get() };
  }

  function onMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!pointers.current.has(e.pointerId) || !gesture.current) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const g = gesture.current;
    const pts = [...pointers.current.values()];
    if (pts.length === 2 && g.dist) {
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      zoom.set(Math.max(0.8, Math.min(MAX_ZOOM, (g.zoom * dist) / g.dist)));
      return;
    }
    const dx = e.clientX - g.x;
    const dy = e.clientY - g.y;
    if (zoom.get() > 1.01) {
      const p = clampPan(zoom.get(), g.panX + dx, g.panY + dy);
      panX.set(p.x);
      panY.set(p.y);
    } else {
      dragY.set(Math.max(0, dy));
    }
  }

  function onUp(e: React.PointerEvent<HTMLDivElement>) {
    const wasPinch = pointers.current.size === 2;
    pointers.current.delete(e.pointerId);
    if (pointers.current.size) return;
    const g = gesture.current;
    gesture.current = null;
    if (wasPinch) {
      if (zoom.get() < 1) setZoom(1);
      return;
    }
    if (dragY.get() > CLOSE_DRAG) return onClose();
    animate(dragY, 0, spring);
    // Double tap / double click toggles zoom at that point.
    const moved = g ? Math.hypot(e.clientX - g.x, e.clientY - g.y) : 99;
    if (moved > 10) return;
    const now = Date.now();
    const prev = lastTap.current;
    if (prev && now - prev.t < 300 && Math.hypot(e.clientX - prev.x, e.clientY - prev.y) < 30) {
      lastTap.current = null;
      setZoom(zoom.get() > 1.01 ? 1 : DOUBLE_TAP_ZOOM, local(e));
    } else {
      lastTap.current = { t: now, x: e.clientX, y: e.clientY };
    }
  }

  return (
    <motion.div className="fixed inset-0 z-[70]" role="dialog" aria-modal="true" aria-label={`${name}'s photo`}>
      <motion.div
        className="absolute inset-0 bg-black/55 backdrop-blur-2xl"
        style={{ opacity: backdrop }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      />
      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-center gap-3 px-4 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <div className="min-w-0 flex-1 drop-shadow">
          <p className="truncate text-[17px] font-semibold text-white">{name}</p>
          {username && <p className="truncate text-[13px] text-white/75">@{username}</p>}
        </div>
        <button
          ref={closeBtn}
          type="button"
          onClick={onClose}
          className="pointer-events-auto grid size-11 place-items-center rounded-full bg-white/15 text-white backdrop-blur hover:bg-white/25"
          aria-label="Close"
        >
          <X className="size-5" />
        </button>
      </div>
      <motion.div
        className="absolute top-1/2 left-1/2 touch-none overflow-hidden select-none"
        style={{ width: side, height: side, marginLeft: -side / 2, marginTop: -side / 2, y: dragY }}
        initial={reduce ? { opacity: 0 } : origin}
        animate={{ x: 0, y: 0, scale: 1, borderRadius: "24px", opacity: 1 }}
        exit={reduce ? { opacity: 0 } : { ...from(), opacity: 1, transition: { type: "spring", stiffness: 500, damping: 42 } }}
        transition={spring}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onWheel={(e) => setZoom(Math.max(1, Math.min(MAX_ZOOM, zoom.get() * (e.deltaY < 0 ? 1.25 : 0.8))), local(e as unknown as React.PointerEvent))}
      >
        {/* The 1080px copy loads straight away; the small avatar (already in the
            cache) holds its place for the zoom-in until the large one paints. */}
        <motion.div className="relative size-full" style={{ scale: zoom, x: panX, y: panY }}>
          {full !== "ready" && (
            // eslint-disable-next-line @next/next/no-img-element -- signed per-viewer media URL
            <img src={src} alt="" aria-hidden="true" draggable={false} className="absolute inset-0 size-full object-contain" />
          )}
          {full !== "failed" && (
            // eslint-disable-next-line @next/next/no-img-element -- signed per-viewer media URL
            <img
              src={fullUrl(src)}
              alt={name}
              draggable={false}
              onLoad={() => setFull("ready")}
              onError={() => setFull("failed")}
              className="relative size-full object-contain"
            />
          )}
        </motion.div>
      </motion.div>
    </motion.div>
  );
}
