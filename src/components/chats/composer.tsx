"use client";

import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowUp, Check, FileText, Mic, Paperclip, Pencil, Reply, Smile, Trash2, X } from "lucide-react";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import { ClientApiError } from "@/lib/client/api";
import { prepareFile, type PreparedMedia } from "@/lib/client/media-upload";
import type { MessageDTO } from "@/lib/chats/types";
import { formatBytes } from "@/lib/media/policy";
import { MESSAGE_MAX } from "@/lib/validation/chat";
import { EmojiPicker } from "./emoji-picker";
import { snippetOf } from "./message-snippet";
import { useVoiceRecorder } from "./use-voice-recorder";

// Unsent drafts survive switching chats, in memory only (never stored on the device).
const drafts = new Map<string, string>();

const TYPING_EVERY_MS = 3_000;

export type ComposerSubmit = { text: string; media: PreparedMedia | null };

type Props = {
  chatId: string;
  onSend: (draft: ComposerSubmit) => void;
  onTyping: () => void;
  replyTo: { message: MessageDTO; senderName: string } | null;
  onCancelReply: () => void;
  editing: MessageDTO | null;
  onSubmitEdit: (text: string) => void;
  onCancelEdit: () => void;
};

function Clock({ startedAt }: { startedAt: number }) {
  const [now, setNow] = useState(startedAt);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, []);
  const s = Math.floor((now - startedAt) / 1000);
  return <span className="tabular-nums">{`${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`}</span>;
}

export function Composer({ chatId, onSend, onTyping, replyTo, onCancelReply, editing, onSubmitEdit, onCancelEdit }: Props) {
  const toast = useToast();
  const [text, setText] = useState(() => drafts.get(chatId) ?? "");
  const [media, setMedia] = useState<(PreparedMedia & { preview: string | null }) | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const area = useRef<HTMLTextAreaElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const lastTyping = useRef(0);
  const voice = useVoiceRecorder();
  const recording = voice.state.status === "recording";

  // Grow with content up to ~6 lines.
  useEffect(() => {
    const el = area.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [text]);

  useEffect(() => {
    if (!editing) drafts.set(chatId, text);
  }, [chatId, text, editing]);

  // Entering edit mode loads the message text; leaving it restores the draft.
  const [editingId, setEditingId] = useState<string | null>(null);
  if ((editing?.id ?? null) !== editingId) {
    setEditingId(editing?.id ?? null);
    setText(editing ? (editing.text ?? "") : (drafts.get(chatId) ?? ""));
  }

  useEffect(() => {
    if (editing || replyTo) area.current?.focus();
  }, [editing, replyTo]);

  useEffect(() => {
    if (voice.state.status === "error") {
      toast(voice.state.message, "error");
      voice.dismissError();
    }
  }, [voice, toast]);

  const clearMedia = useCallback(() => {
    setMedia((m) => {
      if (m?.preview) URL.revokeObjectURL(m.preview);
      return null;
    });
  }, []);

  async function attach(file: File) {
    if (editing) return;
    setPreparing(true);
    try {
      const prepared = await prepareFile(file);
      clearMedia();
      setMedia({ ...prepared, preview: prepared.kind === "IMAGE" ? URL.createObjectURL(prepared.blob) : null });
      area.current?.focus();
    } catch (err) {
      toast(err instanceof ClientApiError ? err.message : "Couldn't attach that file.", "error");
    } finally {
      setPreparing(false);
    }
  }

  const trimmed = text.trim();
  const canSend = editing ? trimmed.length > 0 || editing.type !== "TEXT" : (trimmed.length > 0 || media !== null) && text.length <= MESSAGE_MAX;

  function submit() {
    if (!canSend) return;
    if (editing) {
      onSubmitEdit(trimmed);
      return;
    }
    onSend({ text: trimmed, media });
    setText("");
    drafts.delete(chatId);
    setMedia(null); // the preview URL now belongs to the optimistic bubble
    area.current?.focus();
  }

  async function finishVoice() {
    const recorded = await voice.stop();
    if (recorded) onSend({ text: "", media: recorded });
  }

  function onChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setText(e.target.value);
    const now = Date.now();
    if (!editing && e.target.value.trim() && now - lastTyping.current > TYPING_EVERY_MS) {
      lastTyping.current = now;
      onTyping();
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Escape") {
      if (editing) onCancelEdit();
      else if (replyTo) onCancelReply();
      return;
    }
    // Desktop: Enter sends, Shift+Enter adds a line. Touch keyboards: Enter is a newline.
    const touch = window.matchMedia("(pointer: coarse)").matches;
    if (e.key === "Enter" && !e.shiftKey && !touch && !e.nativeEvent.isComposing) {
      e.preventDefault();
      submit();
    }
  }

  function onPaste(e: React.ClipboardEvent) {
    const file = [...e.clipboardData.files][0];
    if (file) {
      e.preventDefault();
      attach(file);
    }
  }

  function insertEmoji(emoji: string) {
    const el = area.current;
    const start = el?.selectionStart ?? text.length;
    const end = el?.selectionEnd ?? text.length;
    setText(text.slice(0, start) + emoji + text.slice(end));
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(start + emoji.length, start + emoji.length);
    });
  }

  const banner = editing
    ? { icon: Pencil, title: "Edit message", body: snippetOf(editing), onClose: onCancelEdit }
    : replyTo
      ? { icon: Reply, title: `Reply to ${replyTo.senderName}`, body: snippetOf(replyTo.message), onClose: onCancelReply }
      : null;

  return (
    <div
      className="relative"
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes("Files")) {
          e.preventDefault();
          setDragOver(true);
        }
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        const file = e.dataTransfer.files[0];
        if (file) attach(file);
      }}
    >
      <AnimatePresence initial={false}>
        {(banner || media) && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ type: "spring", stiffness: 500, damping: 40 }}
            className="overflow-hidden"
          >
            <div className="glass mb-2 flex flex-col gap-2 rounded-[20px] border border-line p-2 shadow-[var(--shadow-sm)]">
              {banner && (
                <div className="flex items-center gap-2.5 pl-2">
                  <banner.icon className="size-[18px] shrink-0 text-accent" aria-hidden="true" />
                  <div className="min-w-0 flex-1 border-l-2 border-accent pl-2.5">
                    <p className="text-[13px] font-semibold text-accent">{banner.title}</p>
                    <p className="truncate text-[13px] text-muted">{banner.body}</p>
                  </div>
                  <button type="button" onClick={banner.onClose} className="grid size-8 place-items-center rounded-full text-muted hover:bg-surface-3" aria-label="Cancel">
                    <X className="size-4" />
                  </button>
                </div>
              )}
              {media && (
                <div className="flex items-center gap-3 pl-1">
                  {media.preview ? (
                    // eslint-disable-next-line @next/next/no-img-element -- local preview of the picked image
                    <img src={media.preview} alt="" className="size-14 rounded-xl object-cover" />
                  ) : (
                    <span className="grid size-14 place-items-center rounded-xl bg-brand text-white">
                      <FileText className="size-6" aria-hidden="true" />
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14px] font-semibold">
                      {media.kind === "IMAGE" ? "Photo" : media.kind === "VIDEO" ? "Video" : (media.fileName ?? "File")}
                    </p>
                    <p className="text-xs text-muted">{formatBytes(media.blob.size)} · add a caption below</p>
                  </div>
                  <button type="button" onClick={clearMedia} className="grid size-8 place-items-center rounded-full text-muted hover:bg-surface-3" aria-label="Remove attachment">
                    <X className="size-4" />
                  </button>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className="relative flex items-end gap-2"
      >
        <EmojiPicker open={emojiOpen} onPick={insertEmoji} onClose={() => setEmojiOpen(false)} />
        <div
          className={cn(
            "flex min-h-12 flex-1 items-end rounded-[24px] border bg-surface shadow-[var(--shadow-sm)] transition-colors",
            dragOver ? "border-accent ring-4 ring-accent/20" : "border-line focus-within:border-ring focus-within:ring-4 focus-within:ring-ring/15",
          )}
        >
          {recording ? (
            <div className="flex h-[54px] flex-1 items-center gap-3 px-4" role="status" aria-live="polite">
              <span className="size-2.5 animate-pulse rounded-full bg-danger" aria-hidden="true" />
              <span className="text-[15px] font-semibold text-fg">
                <Clock startedAt={voice.state.status === "recording" ? voice.state.startedAt : 0} />
              </span>
              <span className="flex h-6 flex-1 items-center gap-[2px] overflow-hidden" aria-hidden="true">
                {(voice.state.status === "recording" ? voice.state.levels : []).map((l, i) => (
                  <span key={i} className="w-[3px] shrink-0 rounded-full bg-accent" style={{ height: `${Math.max(12, l * 100)}%` }} />
                ))}
              </span>
              <span className="sr-only">Recording voice message</span>
            </div>
          ) : (
            <>
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
                onPaste={onPaste}
                placeholder={media ? "Add a caption…" : editing ? "Edit message" : "Message"}
                maxLength={MESSAGE_MAX}
                enterKeyHint="send"
                className="max-h-40 min-h-[46px] flex-1 resize-none bg-transparent py-3 text-[16px] leading-[22px] text-fg placeholder:text-subtle focus:outline-none focus-visible:outline-none"
              />
              {!editing && (
                <button
                  type="button"
                  onClick={() => fileInput.current?.click()}
                  disabled={preparing}
                  aria-label="Attach photo, video or file"
                  className="m-1 grid size-10 shrink-0 place-items-center rounded-full text-subtle hover:bg-surface-3 hover:text-fg disabled:opacity-50"
                >
                  <Paperclip className={cn("size-[21px]", preparing && "animate-pulse")} />
                </button>
              )}
              <input
                ref={fileInput}
                type="file"
                hidden
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  if (f) attach(f);
                }}
              />
            </>
          )}
        </div>

        <AnimatePresence initial={false} mode="popLayout">
          {recording ? (
            <motion.div key="rec" className="flex gap-2" initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.6, opacity: 0 }}>
              <button type="button" onClick={voice.cancel} aria-label="Discard recording" className="grid size-12 place-items-center rounded-full bg-danger-soft text-danger">
                <Trash2 className="size-5" />
              </button>
              <button type="button" onClick={finishVoice} aria-label="Send voice message" className="grid size-12 place-items-center rounded-full bg-brand text-white shadow-[0_8px_20px_-8px_rgb(29_78_216/0.7)]">
                <ArrowUp className="size-6" strokeWidth={2.5} />
              </button>
            </motion.div>
          ) : canSend ? (
            <motion.button
              key="send"
              type="submit"
              aria-label={editing ? "Save edit" : "Send"}
              initial={{ scale: 0.4, opacity: 0, rotate: -30 }}
              animate={{ scale: 1, opacity: 1, rotate: 0 }}
              exit={{ scale: 0.4, opacity: 0 }}
              whileTap={{ scale: 0.9 }}
              transition={{ type: "spring", stiffness: 600, damping: 28 }}
              className="grid size-12 shrink-0 place-items-center rounded-full bg-brand text-white shadow-[0_8px_20px_-8px_rgb(29_78_216/0.7)]"
            >
              {editing ? <Check className="size-6" strokeWidth={2.5} /> : <ArrowUp className="size-6" strokeWidth={2.5} />}
            </motion.button>
          ) : (
            !editing && (
              <motion.button
                key="mic"
                type="button"
                onClick={voice.start}
                aria-label="Record voice message"
                initial={{ scale: 0.4, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.4, opacity: 0 }}
                whileTap={{ scale: 0.9 }}
                transition={{ type: "spring", stiffness: 600, damping: 28 }}
                className="grid size-12 shrink-0 place-items-center rounded-full border border-line bg-surface text-fg shadow-[var(--shadow-sm)]"
              >
                <Mic className="size-[22px]" />
              </motion.button>
            )
          )}
        </AnimatePresence>
      </form>
    </div>
  );
}
