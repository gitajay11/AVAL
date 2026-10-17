"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { DayPicker } from "react-day-picker";
import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/cn";
import { MIN_AGE_YEARS } from "@/lib/validation/limits";

const FIRST_YEAR = 1900;

/** The latest allowed birthday: exactly MIN_AGE_YEARS ago. */
function latestBirthday(): Date {
  const t = new Date();
  return new Date(t.getFullYear() - MIN_AGE_YEARS, t.getMonth(), t.getDate());
}

/** Month view with a year grid (components/ui/date-of-birth-field.tsx opens it). */
export function Calendar({ selected, onPick }: { selected: Date | undefined; onPick: (d: Date) => void }) {
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
