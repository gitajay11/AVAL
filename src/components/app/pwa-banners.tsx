"use client";

import { AnimatePresence, motion } from "motion/react";
import { useOffline } from "next/offline";
import { useState } from "react";
import { Download, RefreshCw, Share, SquarePlus, WifiOff, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LogoMark } from "@/components/ui/logo";
import { Sheet } from "@/components/ui/sheet";
import { usePwa } from "./pwa";

/** Safari on iPhone/iPad has no install prompt: show the two taps instead. */
export function IosInstallSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Sheet open={open} onClose={onClose} title="Install Aval" description="Add Aval to your Home Screen for a full-screen app with notifications.">
      <ol className="flex flex-col gap-3 pt-1 text-[15px]">
        <li className="flex items-center gap-3 rounded-2xl bg-surface-2 p-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-surface-3 text-primary">
            <Share className="size-5" aria-hidden="true" />
          </span>
          <span>
            Tap <strong>Share</strong> in Safari&apos;s toolbar.
          </span>
        </li>
        <li className="flex items-center gap-3 rounded-2xl bg-surface-2 p-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-surface-3 text-primary">
            <SquarePlus className="size-5" aria-hidden="true" />
          </span>
          <span>
            Choose <strong>Add to Home Screen</strong>, then <strong>Add</strong>.
          </span>
        </li>
      </ol>
      <p className="mt-4 text-sm text-muted">Open Aval from the new icon. Turn on notifications in Settings there.</p>
      <Button className="mt-5 w-full" onClick={onClose}>
        Got it
      </Button>
    </Sheet>
  );
}

/** Card at the top of the chat list, until installed or dismissed. */
export function InstallBanner() {
  const { install, promptInstall, dismissed, dismiss } = usePwa();
  const [iosOpen, setIosOpen] = useState(false);
  const show = !dismissed && (install === "prompt" || install === "ios");

  return (
    <>
      <AnimatePresence initial={false}>
        {show && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ type: "spring", stiffness: 400, damping: 38 }}
            className="overflow-hidden"
          >
            <div className="glass-1 mx-3 mt-2 mb-1 flex items-center gap-3 rounded-2xl p-3">
              <LogoMark className="size-10 shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-[15px] font-semibold">Install Aval</p>
                <p className="text-[13px] text-muted">Full screen, quicker to open, with notifications.</p>
              </div>
              <Button size="sm" onClick={() => (install === "ios" ? setIosOpen(true) : void promptInstall())}>
                <Download className="size-4" aria-hidden="true" /> Install
              </Button>
              <button type="button" onClick={dismiss} className="grid size-8 shrink-0 place-items-center rounded-full text-subtle hover:bg-surface-3 hover:text-fg" aria-label="Dismiss">
                <X className="size-4" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      <IosInstallSheet open={iosOpen} onClose={() => setIosOpen(false)} />
    </>
  );
}

/** "New version" pill. Reloading picks up the new build and its service worker. */
export function UpdateBar() {
  const { updateReady } = usePwa();
  return (
    <AnimatePresence>
      {updateReady && (
        <motion.div
          role="status"
          initial={{ y: 24, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 24, opacity: 0 }}
          transition={{ type: "spring", stiffness: 420, damping: 34 }}
          className="glass-3 fixed inset-x-0 bottom-[max(1rem,env(safe-area-inset-bottom))] z-50 mx-auto flex w-fit max-w-[calc(100%-2rem)] items-center gap-3 rounded-2xl py-2 pr-2 pl-4 text-sm"
        >
          <span className="font-medium">A new version of Aval is ready.</span>
          <Button size="sm" onClick={() => location.reload()}>
            <RefreshCw className="size-4" aria-hidden="true" /> Reload
          </Button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** Shown while the network is down (Next's connectivity detection). */
export function OfflineBar() {
  const offline = useOffline();
  return (
    <AnimatePresence>
      {offline && (
        <motion.div
          role="status"
          initial={{ y: -16, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -16, opacity: 0 }}
          transition={{ type: "spring", stiffness: 420, damping: 34 }}
          className="pointer-events-none fixed inset-x-0 top-[max(0.5rem,env(safe-area-inset-top))] z-50 mx-auto flex w-fit items-center gap-2 rounded-full bg-fg px-3.5 py-1.5 text-[13px] font-semibold text-bg shadow-float"
        >
          <WifiOff className="size-4" aria-hidden="true" />
          Offline. Messages send when you&apos;re back.
        </motion.div>
      )}
    </AnimatePresence>
  );
}
