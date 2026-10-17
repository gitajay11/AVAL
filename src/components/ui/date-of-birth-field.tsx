"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import { DayPicker } from "react-day-picker";
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight, X } from "lucide-react";
import { Sheet } from "@/components/ui/sheet";
import { cn } from "@/lib/cn";
import { MIN_AGE_YEARS } from "@/lib/validation/limits";

const FIRST_YEAR = 1900;

/** "YYYY-MM-DD" ⇄ a local date (no time zone shifts). */
function parse(v: string): Date | undefined {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : undefined;
}
function format(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** The latest allowed birthday: exactly MIN_AGE_YEARS ago. */
function latestBirthday(): Date {
  const t = new Date();
  return new Date(t.getFullYear() - MIN_AGE_YEARS, t.getMonth(), t.getDate());
}

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

function Calendar({ selected, onPick }: { selected: Date | undefined; onPick: (d: Date) => void }) {
  const reduce = useReducedMotion();
  const [latest] = useState(latestBirthday);
  const [month, setMonth] = useState(() => {
    const d = selected ?? latest;
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [dir, setDir] = useState(0);
  const [years, setYears] = useState(false);
  const yearList = useRef<HTMLDivElement>(null);
  const first = new Date(FIRST_YEAR, 0, 1);
  const last = new Date(latest.getFullYear(), latest.getMonth(), 1);

  const go = (by: number) => {
    const next = new Date(month.getFullYear(), month.getMonth() + by, 1);
    if (next < first || next > last) return;
    setDir(by);
    setMonth(next);
  };

  // The year grid opens scrolled to the shown year.
  useEffect(() => {
    if (!years) return;
    yearList.current?.querySelector<HTMLElement>("[aria-pressed=true]")?.scrollIntoView({ block: "center" });
  }, [years]);

  const title = month.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  const navBtn = "grid size-10 place-items-center rounded-2xl text-fg hover:bg-surface-3 disabled:opacity-30";

  return (
    <div className="select-none">
      <div className="mb-2 flex items-center gap-1">
        <button
          type="button"
          onClick={() => setYears((y) => !y)}
          aria-expanded={years}
          className="flex min-w-0 flex-1 items-center gap-1 rounded-2xl px-2.5 py-2 text-left text-[16px] font-bold hover:bg-surface-3"
        >
          <span className="truncate" aria-live="polite">
            {title}
          </span>
          <ChevronDown className={cn("size-4 shrink-0 transition-transform", years && "rotate-180")} aria-hidden="true" />
          <span className="sr-only">{years ? "Show days" : "Choose a year"}</span>
        </button>
        {!years && (
          <>
            <button type="button" onClick={() => go(-1)} disabled={month <= first} className={navBtn} aria-label="Previous month">
              <ChevronLeft className="size-5" />
            </button>
            <button type="button" onClick={() => go(1)} disabled={month >= last} className={navBtn} aria-label="Next month">
              <ChevronRight className="size-5" />
            </button>
          </>
        )}
      </div>

      {years ? (
        <div ref={yearList} className="grid max-h-[288px] grid-cols-4 gap-1.5 overflow-y-auto overscroll-contain p-0.5" role="group" aria-label="Years">
          {Array.from({ length: latest.getFullYear() - FIRST_YEAR + 1 }, (_, i) => latest.getFullYear() - i).map((y) => {
            const on = y === month.getFullYear();
            return (
              <button
                key={y}
                type="button"
                aria-pressed={on}
                onClick={() => {
                  // Keep the month, but never past the latest allowed one.
                  const next = new Date(y, month.getMonth(), 1);
                  setDir(0);
                  setMonth(next > last ? last : next);
                  setYears(false);
                }}
                className={cn("h-11 rounded-full text-[15px] font-semibold tabular-nums", on ? "glass-primary" : "hover:bg-surface-3")}
              >
                {y}
              </button>
            );
          })}
        </div>
      ) : (
        <div className="relative overflow-hidden">
          <AnimatePresence mode="popLayout" initial={false} custom={dir}>
            <motion.div
              key={month.getTime()}
              custom={dir}
              initial={reduce ? { opacity: 0 } : { x: dir * 48, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={reduce ? { opacity: 0 } : { x: dir * -48, opacity: 0 }}
              transition={{ type: "spring", stiffness: 520, damping: 40 }}
            >
              <DayPicker
                mode="single"
                month={month}
                onMonthChange={(m) => {
                  setDir(m > month ? 1 : -1);
                  setMonth(m);
                }}
                selected={selected}
                onSelect={(d) => d && onPick(d)}
                required
                startMonth={first}
                endMonth={last}
                disabled={[{ after: latest }, { before: first }]}
                hideNavigation
                showOutsideDays
                fixedWeeks
                autoFocus
                classNames={{
                  root: "w-full",
                  months: "w-full",
                  month: "w-full",
                  month_caption: "sr-only",
                  month_grid: "w-full border-separate border-spacing-y-1",
                  weekdays: "",
                  weekday: "pb-1 text-center text-xs font-semibold text-subtle",
                  week: "",
                  day: "p-0 text-center",
                  day_button:
                    "mx-auto grid size-10 place-items-center rounded-full text-[15px] font-medium tabular-nums transition-transform hover:bg-surface-3 active:scale-90 disabled:pointer-events-none",
                  selected: "[&>button]:glass-primary [&>button]:font-bold [&>button]:hover:bg-transparent",
                  today: "[&>button]:ring-2 [&>button]:ring-accent/60",
                  outside: "[&>button]:text-subtle/60",
                  disabled: "[&>button]:text-subtle/40",
                  hidden: "invisible",
                }}
              />
            </motion.div>
          </AnimatePresence>
        </div>
      )}
      <p className="mt-2 px-1 text-center text-xs text-muted">You must be at least {MIN_AGE_YEARS}.</p>
    </div>
  );
}
