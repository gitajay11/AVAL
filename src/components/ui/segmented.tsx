"use client";

import { motion } from "motion/react";
import { useId } from "react";
import { cn } from "@/lib/cn";

type Option<T extends string> = { value: T; label: string };

type Props<T extends string> = {
  label: string;
  description?: string;
  value: T;
  options: Option<T>[];
  onChange: (value: T) => void;
  disabled?: boolean;
};

/** Radio group styled as a segmented control, with arrow-key navigation. */
export function Segmented<T extends string>({ label, description, value, options, onChange, disabled }: Props<T>) {
  const id = useId();
  const onKeyDown = (e: React.KeyboardEvent) => {
    const i = options.findIndex((o) => o.value === value);
    const delta = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
    if (!delta) return;
    e.preventDefault();
    const next = options[(i + delta + options.length) % options.length];
    onChange(next.value);
    (e.currentTarget.querySelector(`[data-value="${next.value}"]`) as HTMLElement | null)?.focus();
  };

  return (
    <div className="py-3">
      <p id={`${id}-l`} className="text-[15px] font-medium text-fg">
        {label}
      </p>
      {description && <p className="text-[13px] text-muted">{description}</p>}
      <div
        role="radiogroup"
        aria-labelledby={`${id}-l`}
        onKeyDown={onKeyDown}
        className="mt-2.5 grid auto-cols-fr grid-flow-col rounded-2xl bg-surface-3 p-1"
      >
        {options.map((o) => {
          const active = o.value === value;
          return (
            <button
              key={o.value}
              type="button"
              role="radio"
              aria-checked={active}
              tabIndex={active ? 0 : -1}
              data-value={o.value}
              disabled={disabled}
              onClick={() => onChange(o.value)}
              className={cn(
                "relative h-9 rounded-xl text-sm font-semibold transition-colors",
                active ? "text-fg" : "text-muted hover:text-fg",
              )}
            >
              {active && (
                <motion.span
                  layoutId={`seg-${id}`}
                  transition={{ type: "spring", stiffness: 500, damping: 38 }}
                  className="absolute inset-0 rounded-xl bg-[var(--glass-3)] shadow-[var(--glass-highlight),var(--shadow-sm)]"
                />
              )}
              <span className="relative">{o.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
