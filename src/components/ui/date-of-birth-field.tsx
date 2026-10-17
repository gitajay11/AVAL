"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import dynamic from "next/dynamic";
import { CalendarDays, X } from "lucide-react";
import { Sheet } from "@/components/ui/sheet";
import { cn } from "@/lib/cn";


/** "YYYY-MM-DD" ⇄ a local date (no time zone shifts). */
function parse(v: string): Date | undefined {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : undefined;
}
function format(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}


// The day grid (react-day-picker and date-fns) loads when the picker opens.
const Calendar = dynamic(() => import("./date-of-birth-calendar").then((m) => m.Calendar), {
  ssr: false,
  loading: () => <div className="h-[372px]" aria-busy="true" />,
});

const wide = (cb: () => void) => {
  const mq = window.matchMedia("(min-width: 640px)");
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
};

type Props = {
  label: string;
  value: string;
  onChange: (v: string) => void;
  error?: string;
  optional?: boolean;
};

/**
 * Date of birth: a glass calendar in a popover (desktop) or bottom sheet
 * (phones). Tap the month title for a year grid; dates that would make you
 * younger than MIN_AGE_YEARS are disabled. Arrow keys move between days.
 */
export function DateOfBirthField({ label, value, onChange, error, optional }: Props) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const isWide = useSyncExternalStore(wide, () => window.matchMedia("(min-width: 640px)").matches, () => false);
  const selected = parse(value);
  const wrap = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);

  // Popover: close on outside press and Escape, give focus back to the trigger.
  useEffect(() => {
    if (!open || !isWide) return;
    const onDown = (e: PointerEvent) => !wrap.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      setOpen(false);
      trigger.current?.focus();
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [open, isWide]);

  const pick = (d: Date) => {
    onChange(format(d));
    setOpen(false);
    trigger.current?.focus();
  };
  const shown = selected?.toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" });

  return (
    <div className="flex flex-col gap-1.5" ref={wrap}>
      <span id={`${id}-l`} className="flex items-baseline justify-between text-sm font-semibold text-fg">
        {label}
        {optional && <span className="text-xs font-medium text-subtle">Optional</span>}
      </span>
      <div className="relative">
        <button
          ref={trigger}
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-labelledby={`${id}-l ${id}-v`}
          aria-describedby={error ? `${id}-e` : undefined}
          className={cn(
            "glass-input flex h-12 w-full items-center gap-2.5 rounded-2xl pr-11 pl-4 text-left text-[15px]",
            error && "border-danger",
          )}
        >
          <CalendarDays className="size-[18px] shrink-0 text-subtle" aria-hidden="true" />
          <span id={`${id}-v`} className={cn("min-w-0 flex-1 truncate", !shown && "text-subtle")}>
            {shown ?? "Select a date"}
          </span>
        </button>
        {value && (
          <button
            type="button"
            onClick={() => onChange("")}
            className="absolute top-1/2 right-2 grid size-8 -translate-y-1/2 place-items-center rounded-full text-subtle hover:bg-surface-3 hover:text-fg"
            aria-label="Clear date of birth"
          >
            <X className="size-4" />
          </button>
        )}
        <AnimatePresence>
          {open && isWide && (
            <motion.div
              role="dialog"
              aria-label={label}
              initial={{ opacity: 0, y: -6, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -6, scale: 0.98 }}
              transition={{ type: "spring", stiffness: 520, damping: 36 }}
              className="glass-3 absolute top-[calc(100%+8px)] left-0 z-30 w-[320px] origin-top-left rounded-[24px] p-3"
            >
              <Calendar selected={selected} onPick={pick} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      {error && (
        <p id={`${id}-e`} className="text-[13px] leading-5 text-danger" role="alert">
          {error}
        </p>
      )}
      {!isWide && (
        <Sheet open={open} onClose={() => setOpen(false)} title={label}>
          <div className="mx-auto max-w-[340px] pb-1">
            <Calendar selected={selected} onPick={pick} />
          </div>
        </Sheet>
      )}
    </div>
  );
}
