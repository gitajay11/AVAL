"use client";

import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowUp, Smile } from "lucide-react";
import { MESSAGE_MAX } from "@/lib/validation/chat";
import { EmojiPicker } from "./emoji-picker";

// Unsent drafts survive switching chats, in memory only (never stored on the device).
const drafts = new Map<string, string>();

const TYPING_EVERY_MS = 3_000;

type Props = {
  chatId: string;
  onSend: (text: string) => void;
  onTyping: () => void;
};

export function Composer({ chatId, onSend, onTyping }: Props) {
  const [text, setText] = useState(() => drafts.get(chatId) ?? "");
  const [emojiOpen, setEmojiOpen] = useState(false);
  const area = useRef<HTMLTextAreaElement>(null);
  const lastTyping = useRef(0);

  // Grow with content up to ~6 lines.
  useEffect(() => {
    const el = area.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [text]);

  useEffect(() => {
    drafts.set(chatId, text);
  }, [chatId, text]);

  const canSend = text.trim().length > 0 && text.length <= MESSAGE_MAX;

  const submit = useCallback(() => {
    if (!canSend) return;
    onSend(text.trim());
    setText("");
    drafts.delete(chatId);
    area.current?.focus();
  }, [canSend, chatId, onSend, text]);

  function onChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setText(e.target.value);
    const now = Date.now();
    if (e.target.value.trim() && now - lastTyping.current > TYPING_EVERY_MS) {
      lastTyping.current = now;
      onTyping();
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    // Desktop: Enter sends, Shift+Enter adds a line. Touch keyboards: Enter is a newline.
    const touch = window.matchMedia("(pointer: coarse)").matches;
    if (e.key === "Enter" && !e.shiftKey && !touch && !e.nativeEvent.isComposing) {
      e.preventDefault();
      submit();
    }
  }

  function insertEmoji(emoji: string) {
    const el = area.current;
    const start = el?.selectionStart ?? text.length;
    const end = el?.selectionEnd ?? text.length;
    const next = text.slice(0, start) + emoji + text.slice(end);
    setText(next);
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(start + emoji.length, start + emoji.length);
    });
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="relative flex items-end gap-2"
    >
      <EmojiPicker open={emojiOpen} onPick={insertEmoji} onClose={() => setEmojiOpen(false)} />
      <div className="flex min-h-12 flex-1 items-end rounded-[24px] border border-line bg-surface shadow-[var(--shadow-sm)] focus-within:border-ring focus-within:ring-4 focus-within:ring-ring/15">
        <button
          type="button"
          data-emoji-toggle
          onClick={() => setEmojiOpen((o) => !o)}
          aria-label="Emoji"
          aria-expanded={emojiOpen}
          className="m-1 grid size-10 shrink-0 place-items-center rounded-full text-subtle hover:bg-surface-3 hover:text-fg"
        >
          <Smile className="size-[22px]" />
        </button>
        <label htmlFor={`composer-${chatId}`} className="sr-only">
          Message
        </label>
        <textarea
          id={`composer-${chatId}`}
          ref={area}
          rows={1}
          value={text}
          onChange={onChange}
          onKeyDown={onKeyDown}
          placeholder="Message"
          maxLength={MESSAGE_MAX}
          enterKeyHint="send"
          className="max-h-40 min-h-[46px] flex-1 resize-none bg-transparent py-3 pr-4 text-[16px] leading-[22px] text-fg placeholder:text-subtle focus:outline-none focus-visible:outline-none"
        />
      </div>
      <AnimatePresence initial={false}>
        {canSend && (
          <motion.button
            type="submit"
            aria-label="Send"
            initial={{ scale: 0.4, opacity: 0, rotate: -30 }}
            animate={{ scale: 1, opacity: 1, rotate: 0 }}
            exit={{ scale: 0.4, opacity: 0 }}
            whileTap={{ scale: 0.9 }}
            transition={{ type: "spring", stiffness: 600, damping: 28 }}
            className="grid size-12 shrink-0 place-items-center rounded-full bg-brand text-white shadow-[0_8px_20px_-8px_rgb(29_78_216/0.7)]"
          >
            <ArrowUp className="size-6" strokeWidth={2.5} />
          </motion.button>
        )}
      </AnimatePresence>
    </form>
  );
}
