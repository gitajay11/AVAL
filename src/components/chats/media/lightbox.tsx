"use client";

import { AnimatePresence, motion } from "motion/react";
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Download, X } from "lucide-react";

type Item = { src: string; alt: string; downloadUrl: string | null };

const LightboxContext = createContext<(item: Item) => void>(() => {});

export function useLightbox() {
  return useContext(LightboxContext);
}

/** Full-screen image viewer. Esc, tap outside or the close button dismisses it. */
export function LightboxProvider({ children }: { children: React.ReactNode }) {
  const [item, setItem] = useState<Item | null>(null);
  const close = useCallback(() => setItem(null), []);

  useEffect(() => {
    if (!item) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [item, close]);

  return (
    <LightboxContext value={setItem}>
      {children}
      {typeof document !== "undefined" &&
        createPortal(
          <AnimatePresence>
            {item && (
              <motion.div
                role="dialog"
                aria-modal="true"
                aria-label={item.alt}
                className="fixed inset-0 z-[60] flex items-center justify-center bg-black/90 p-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))]"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={close}
              >
                <div className="absolute top-[max(0.75rem,env(safe-area-inset-top))] right-3 flex gap-2">
                  {item.downloadUrl && (
                    <a
                      href={item.downloadUrl}
                      onClick={(e) => e.stopPropagation()}
                      className="grid size-11 place-items-center rounded-full bg-white/10 text-white hover:bg-white/20"
                      aria-label="Download"
                    >
                      <Download className="size-5" />
                    </a>
                  )}
                  <button
                    type="button"
                    onClick={close}
                    autoFocus
                    className="grid size-11 place-items-center rounded-full bg-white/10 text-white hover:bg-white/20"
                    aria-label="Close"
                  >
                    <X className="size-5" />
                  </button>
                </div>
                <motion.img
                  src={item.src}
                  alt={item.alt}
                  initial={{ scale: 0.92, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.95, opacity: 0 }}
                  transition={{ type: "spring", stiffness: 380, damping: 32 }}
                  className="max-h-full max-w-full rounded-lg object-contain shadow-2xl"
                  onClick={(e) => e.stopPropagation()}
                />
              </motion.div>
            )}
          </AnimatePresence>,
          document.body,
        )}
    </LightboxContext>
  );
}
