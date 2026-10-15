"use client";

import { MotionConfig } from "motion/react";
import { ThemeWatcher } from "./theme";
import { ToastProvider } from "./ui/toast";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    // reducedMotion="user": springs and slides collapse to fades when the OS asks.
    <MotionConfig reducedMotion="user">
      <ToastProvider>
        <ThemeWatcher />
        {children}
      </ToastProvider>
    </MotionConfig>
  );
}
