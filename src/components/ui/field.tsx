"use client";

import { AnimatePresence, motion } from "motion/react";
import { forwardRef, useId, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/cn";

const control =
  "w-full rounded-2xl border border-line-strong bg-surface px-4 text-[15px] text-fg placeholder:text-subtle " +
  "transition-[border-color,box-shadow] duration-150 hover:border-subtle/50 " +
  "focus-visible:border-ring focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring/20 " +
  "aria-[invalid=true]:border-danger aria-[invalid=true]:focus-visible:ring-danger/15 disabled:opacity-60";

type FieldShellProps = {
  id: string;
  label: string;
  hint?: React.ReactNode;
  error?: string;
  status?: React.ReactNode; // e.g. live availability, shown instead of hint
  children: React.ReactNode;
  optional?: boolean;
};

function FieldShell({ id, label, hint, error, status, optional, children }: FieldShellProps) {
  const message = error ?? status ?? hint;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="flex items-baseline justify-between text-sm font-semibold text-fg">
        {label}
        {optional && <span className="text-xs font-medium text-subtle">Optional</span>}
      </label>
      {children}
      <AnimatePresence initial={false} mode="wait">
        {message && (
          <motion.p
            key={error ? `e:${error}` : "m"}
            id={`${id}-msg`}
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className={cn("text-[13px] leading-5", error ? "text-danger" : "text-muted")}
            role={error ? "alert" : undefined}
          >
            {message}
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}

type InputProps = React.InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  hint?: React.ReactNode;
  error?: string;
  status?: React.ReactNode;
  optional?: boolean;
  leading?: React.ReactNode;
  trailing?: React.ReactNode;
};

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, hint, error, status, optional, leading, trailing, className, id: idProp, type, ...props },
  ref,
) {
  const autoId = useId();
  const id = idProp ?? autoId;
  const [reveal, setReveal] = useState(false);
  const isPassword = type === "password";
  const hasMessage = Boolean(error ?? status ?? hint);
  return (
    <FieldShell id={id} label={label} hint={hint} error={error} status={status} optional={optional}>
      <div className="relative">
        {leading && <span className="pointer-events-none absolute inset-y-0 left-4 flex items-center text-subtle">{leading}</span>}
        <input
          ref={ref}
          id={id}
          type={isPassword && reveal ? "text" : type}
          aria-invalid={error ? true : undefined}
          aria-describedby={hasMessage ? `${id}-msg` : undefined}
          className={cn(control, "h-12", leading && "pl-10", (trailing || isPassword) && "pr-12", className)}
          {...props}
        />
        {isPassword ? (
          <button
            type="button"
            onClick={() => setReveal((r) => !r)}
            className="absolute inset-y-0 right-1.5 my-auto grid size-9 place-items-center rounded-xl text-subtle hover:bg-surface-3 hover:text-fg"
            aria-label={reveal ? "Hide password" : "Show password"}
          >
            {reveal ? <EyeOff className="size-[18px]" /> : <Eye className="size-[18px]" />}
          </button>
        ) : (
          trailing && <span className="absolute inset-y-0 right-4 flex items-center">{trailing}</span>
        )}
      </div>
    </FieldShell>
  );
});

type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label: string;
  hint?: React.ReactNode;
  error?: string;
  optional?: boolean;
};

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { label, hint, error, optional, className, id: idProp, ...props },
  ref,
) {
  const autoId = useId();
  const id = idProp ?? autoId;
  return (
    <FieldShell id={id} label={label} hint={hint} error={error} optional={optional}>
      <textarea
        ref={ref}
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={error || hint ? `${id}-msg` : undefined}
        className={cn(control, "min-h-24 resize-none py-3 leading-6", className)}
        {...props}
      />
    </FieldShell>
  );
});
