"use client";

import { motion, type HTMLMotionProps } from "motion/react";
import { forwardRef } from "react";
import { cn } from "@/lib/cn";
import { Spinner } from "./spinner";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "outline";
type Size = "sm" | "md" | "lg" | "icon";

const variants: Record<Variant, string> = {
  primary: "bg-brand text-white shadow-[0_8px_20px_-8px_rgb(29_78_216/0.6)] hover:brightness-110",
  secondary: "bg-surface-3 text-fg hover:bg-line-strong/60",
  ghost: "text-fg hover:bg-surface-3",
  outline: "border border-line-strong text-fg hover:bg-surface-2",
  danger: "bg-danger-soft text-danger hover:bg-danger/15",
};

const sizes: Record<Size, string> = {
  sm: "h-9 px-3.5 text-sm rounded-xl gap-1.5",
  md: "h-11 px-5 text-[15px] rounded-2xl gap-2",
  lg: "h-12 px-6 text-base rounded-2xl gap-2",
  icon: "h-10 w-10 rounded-xl",
};

export type ButtonProps = Omit<HTMLMotionProps<"button">, "children"> & {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  children?: React.ReactNode;
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", size = "md", loading = false, disabled, className, children, type = "button", ...props },
  ref,
) {
  return (
    <motion.button
      ref={ref}
      type={type}
      whileTap={disabled || loading ? undefined : { scale: 0.97 }}
      transition={{ type: "spring", stiffness: 600, damping: 30 }}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        "relative inline-flex select-none items-center justify-center font-semibold transition-[background,filter,color,opacity] duration-150",
        "disabled:cursor-not-allowed disabled:opacity-55",
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    >
      {loading && (
        <span className="absolute inset-0 grid place-items-center">
          <Spinner className="size-5" />
        </span>
      )}
      <span className={cn("inline-flex items-center gap-[inherit]", loading && "invisible")}>{children}</span>
    </motion.button>
  );
});
