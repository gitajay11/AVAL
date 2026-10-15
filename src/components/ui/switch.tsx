"use client";

import { motion } from "motion/react";
import { useId } from "react";
import { cn } from "@/lib/cn";

type Props = {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  description?: string;
  disabled?: boolean;
};

/** Accessible on/off switch row. */
export function Switch({ checked, onChange, label, description, disabled }: Props) {
  const id = useId();
  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <div className="min-w-0">
        <label htmlFor={id} className="block text-[15px] font-medium text-fg">
          {label}
        </label>
        {description && (
          <p id={`${id}-d`} className="text-[13px] text-muted">
            {description}
          </p>
        )}
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-describedby={description ? `${id}-d` : undefined}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative h-7 w-12 shrink-0 rounded-full p-0.5 transition-colors duration-200 disabled:opacity-50",
          checked ? "bg-brand" : "bg-surface-3 ring-1 ring-line-strong ring-inset",
        )}
      >
        <motion.span
          layout
          transition={{ type: "spring", stiffness: 700, damping: 35 }}
          className={cn("block size-6 rounded-full bg-white shadow-md", checked && "ml-auto")}
        />
      </button>
    </div>
  );
}
