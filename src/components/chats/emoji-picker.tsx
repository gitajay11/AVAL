"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef } from "react";

const EMOJI = [
  "😀", "😂", "🥹", "😊", "😍", "🥰", "😘", "😉", "😎", "🤩", "🤗", "🤔", "🫡", "🙃", "😅", "😭",
  "😢", "😡", "🥺", "😴", "🤯", "😱", "🤝", "👍", "👎", "👏", "🙌", "🙏", "💪", "👋", "✌️", "🤞",
  "👀", "🫶", "❤️", "🧡", "💛", "💚", "💙", "💜", "🖤", "💔", "✨", "🔥", "🎉", "🎂", "🎁", "🌟",
  "☀️", "🌙", "⭐", "🌈", "☕", "🍕", "🍔", "🍿", "🍻", "⚽", "🎵", "📌", "✅", "❌", "💯", "🚀",
];

/** Small built-in emoji palette. The OS emoji keyboard works in the composer too. */
export function EmojiPicker({ open, onPick, onClose }: { open: boolean; onPick: (e: string) => void; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node) && !(e.target as HTMLElement).closest("[data-emoji-toggle]")) onClose();
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          ref={ref}
          role="dialog"
          aria-label="Emoji"
          initial={{ opacity: 0, y: 8, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 6, scale: 0.98 }}
          transition={{ type: "spring", stiffness: 520, damping: 36 }}
          style={{ transformOrigin: "bottom left" }}
          className="glass absolute bottom-full left-2 mb-2 w-[min(340px,calc(100vw-1rem))] rounded-[20px] border border-line p-2 shadow-float"
        >
          <div className="grid grid-cols-8 gap-0.5">
            {EMOJI.map((e) => (
              <button
                key={e}
                type="button"
                onClick={() => onPick(e)}
                className="grid aspect-square place-items-center rounded-xl text-[22px] transition-transform hover:scale-110 hover:bg-surface-3 active:scale-95"
              >
                {e}
              </button>
            ))}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
