"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "@/lib/cn";

type Props = {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  /** "sheet" slides up from the bottom on phones; "dialog" is always centered. */
  variant?: "sheet" | "dialog";
  className?: string;
};

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), textarea:not([disabled]), select, [tabindex]:not([tabindex="-1"])';

/**
 * Modal surface: bottom sheet on phones, centered card on larger screens.
 * Escape and backdrop close it, focus is trapped inside and restored on close.
 */
export function Sheet({ open, onClose, title, description, children, variant = "sheet", className }: Props) {
  const id = useId();
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const t = setTimeout(() => (panel.current?.querySelector<HTMLElement>(FOCUSABLE) ?? panel.current)?.focus(), 30);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
      if (e.key === "Tab" && panel.current) {
        const items = [...panel.current.querySelectorAll<HTMLElement>(FOCUSABLE)];
        if (!items.length) return;
        const first = items[0];
        const last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey, true);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      clearTimeout(t);
      document.removeEventListener("keydown", onKey, true);
      document.body.style.overflow = overflow;
      previous?.focus?.();
    };
  }, [open, onClose]);

  if (typeof document === "undefined") return null;
  return createPortal(
    <AnimatePresence>
      {open && (
        <div className={cn("fixed inset-0 z-50 flex justify-center", variant === "sheet" ? "items-end sm:items-center" : "items-center p-4")}>
          <motion.div
            className="absolute inset-0 bg-black/45 backdrop-blur-[2px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            ref={panel}
            role="dialog"
            aria-modal="true"
            aria-labelledby={`${id}-t`}
            aria-describedby={description ? `${id}-d` : undefined}
            tabIndex={-1}
            initial={variant === "sheet" ? { y: "100%", opacity: 0.6 } : { scale: 0.95, opacity: 0 }}
            animate={{ y: 0, scale: 1, opacity: 1 }}
            exit={variant === "sheet" ? { y: "100%", opacity: 0.6 } : { scale: 0.97, opacity: 0 }}
            transition={{ type: "spring", stiffness: 420, damping: 38 }}
            className={cn(
              "relative z-10 flex max-h-[88dvh] w-full flex-col overflow-hidden border border-line bg-surface shadow-float focus:outline-none",
              variant === "sheet"
                ? "rounded-t-[24px] pb-[env(safe-area-inset-bottom)] sm:max-w-md sm:rounded-[24px] sm:pb-0"
                : "max-w-sm rounded-[24px]",
              className,
            )}
          >
            {variant === "sheet" && <div className="mx-auto mt-2 h-1.5 w-10 rounded-full bg-line-strong sm:hidden" aria-hidden="true" />}
            <div className="flex items-start gap-3 px-5 pt-4 pb-2">
              <div className="min-w-0 flex-1">
                <h2 id={`${id}-t`} className="text-lg font-bold">
                  {title}
                </h2>
                {description && (
                  <p id={`${id}-d`} className="mt-0.5 text-sm text-muted">
                    {description}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={onClose}
                className="-mr-2 grid size-9 shrink-0 place-items-center rounded-xl text-muted hover:bg-surface-3 hover:text-fg"
                aria-label="Close"
              >
                <X className="size-5" />
              </button>
            </div>
            <div className="min-h-0 overflow-y-auto px-5 pb-5">{children}</div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
