"use client";

import { motion } from "motion/react";

/** Glass card with a gentle spring entrance, shared by every auth screen. */
export function AuthCard({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 14, scale: 0.985 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: "spring", stiffness: 260, damping: 26 }}
    >
      <section className="glass-2 rounded-[24px] p-6 sm:p-8">
        <h1 className="text-2xl font-extrabold tracking-tight text-fg">{title}</h1>
        {subtitle && <p className="mt-1.5 text-[15px] text-muted">{subtitle}</p>}
        <div className="mt-6">{children}</div>
      </section>
      {footer && <div className="mt-5 text-center text-[15px] text-muted">{footer}</div>}
    </motion.div>
  );
}

export function FormError({ message }: { message?: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="rounded-2xl bg-danger-soft px-4 py-3 text-sm font-medium text-danger">
      {message}
    </p>
  );
}
