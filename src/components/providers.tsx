"use client";

import { MotionConfig } from "motion/react";
import { UpdateBar } from "./app/pwa-banners";
import { PwaProvider } from "./app/pwa";
import { ThemeWatcher } from "./theme";
import { ToastProvider } from "./ui/toast";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    // reducedMotion="user": springs and slides collapse to fades when the OS asks.
    <MotionConfig reducedMotion="user">
      <ToastProvider>
        <PwaProvider>
          <ThemeWatcher />
          {children}
          <UpdateBar />
        </PwaProvider>
      </ToastProvider>
    </MotionConfig>
  );
}
