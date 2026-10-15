"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/cn";

export type MenuItem = {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  onSelect: () => void;
  danger?: boolean;
  hidden?: boolean;
};

type Props = {
  /** Screen point (or element rect) to anchor to; null = closed. */
  anchor: { x: number; y: number } | null;
  onClose: () => void;
  items: MenuItem[];
  /** Optional content above the items (e.g. a reaction bar). */
  header?: React.ReactNode;
  label: string;
};

const MARGIN = 8;

/**
 * Context menu at a point (right-click / long-press), clamped to the viewport.
 * Arrow keys move between items, Escape or an outside tap closes it.
 */
export function ActionMenu({ anchor, onClose, items, header, label }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const visible = items.filter((i) => !i.hidden);

  useLayoutEffect(() => {
    if (!anchor || !ref.current) return;
    // offset* ignores the entrance scale transform (getBoundingClientRect would not).
    const { offsetWidth: width, offsetHeight: height } = ref.current;
    const left = Math.min(Math.max(MARGIN, anchor.x), window.innerWidth - width - MARGIN);
    const below = anchor.y + height + MARGIN <= window.innerHeight;
    const top = below ? anchor.y : Math.max(MARGIN, anchor.y - height);
    setPos({ left, top });
  }, [anchor]);

  useEffect(() => {
    if (!anchor) return;
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        const buttons = [...(ref.current?.querySelectorAll<HTMLButtonElement>("[role=menuitem]") ?? [])];
        const i = buttons.indexOf(document.activeElement as HTMLButtonElement);
        const next = e.key === "ArrowDown" ? (i + 1) % buttons.length : (i - 1 + buttons.length) % buttons.length;
        buttons[next]?.focus();
      }
    };
    const t = setTimeout(() => ref.current?.querySelector<HTMLElement>("[role=menuitem]")?.focus(), 20);
    document.addEventListener("pointerdown", onDown, true);
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", onClose);
    return () => {
      clearTimeout(t);
      document.removeEventListener("pointerdown", onDown, true);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onClose);
    };
  }, [anchor, onClose]);

  if (typeof document === "undefined") return null;
  return createPortal(
    <AnimatePresence onExitComplete={() => setPos(null)}>
      {anchor && (
        <motion.div
          ref={ref}
          role="menu"
          aria-label={label}
          initial={{ opacity: 0, scale: 0.92 }}
          animate={{ opacity: pos ? 1 : 0, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          transition={{ type: "spring", stiffness: 600, damping: 36 }}
          style={{ left: pos?.left ?? anchor.x, top: pos?.top ?? anchor.y, transformOrigin: "top left" }}
          className="glass fixed z-50 min-w-52 overflow-hidden rounded-[18px] border border-line p-1.5 shadow-float"
          onContextMenu={(e) => e.preventDefault()}
        >
          {header}
          {visible.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              onClick={() => {
                onClose();
                item.onSelect();
              }}
              className={cn(
                "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[15px] font-medium hover:bg-surface-3 focus-visible:bg-surface-3 focus-visible:outline-none",
                item.danger ? "text-danger" : "text-fg",
              )}
            >
              <item.icon className="size-[18px] shrink-0 opacity-80" />
              {item.label}
            </button>
          ))}
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

/**
 * Long-press (touch, 450 ms without moving) and right-click handlers that
 * report the screen point. Returns props to spread onto the target element.
 */
export function useLongPress(onOpen: (point: { x: number; y: number }) => void, enabled = true) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const cancel = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };
  if (!enabled) return {};
  return {
    onContextMenu: (e: React.MouseEvent) => {
      e.preventDefault();
      onOpen({ x: e.clientX, y: e.clientY });
    },
    onPointerDown: (e: React.PointerEvent) => {
      if (e.pointerType !== "touch") return;
      start.current = { x: e.clientX, y: e.clientY };
      cancel();
      timer.current = setTimeout(() => {
        navigator.vibrate?.(12);
        onOpen(start.current!);
      }, 450);
    },
    onPointerMove: (e: React.PointerEvent) => {
      if (start.current && Math.hypot(e.clientX - start.current.x, e.clientY - start.current.y) > 10) cancel();
    },
    onPointerUp: cancel,
    onPointerCancel: cancel,
  };
}
