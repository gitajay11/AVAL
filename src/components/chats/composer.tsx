"use client";

import dynamic from "next/dynamic";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { ArrowUp, Camera, Check, ChevronLeft, ChevronUp, FileText, Images, Lock, Mic, Music, Paperclip, Pencil, Reply, Smile, Trash2, X } from "lucide-react";
import { Sheet } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import { ClientApiError } from "@/lib/client/api";
import { cropToCanvas, type CropArea } from "@/lib/client/crop";
import { encodeImage, prepareFile, type PreparedMedia } from "@/lib/client/media-upload";
import type { MessageDTO } from "@/lib/chats/types";
import { formatBytes } from "@/lib/media/policy";
import { MESSAGE_MAX } from "@/lib/validation/limits";
import { snippetOf } from "./message-snippet";
import { useVoiceRecorder } from "./use-voice-recorder";
import { useMountOnce } from "@/components/ui/idle-link";

const EmojiPicker = dynamic(() => import("./emoji-picker").then((m) => m.EmojiPicker), { ssr: false });
// Only loaded once something is picked.
const AttachmentGrid = dynamic(() => import("./attachment-grid").then((m) => m.AttachmentGrid), { ssr: false });
// Only loaded once someone crops a photo.
const ImageCropper = dynamic(() => import("@/components/ui/image-cropper").then((m) => m.ImageCropper), { ssr: false });

// Unsent drafts survive switching chats, in memory only (never stored on the device).
const drafts = new Map<string, string>();

const TYPING_EVERY_MS = 3_000;
const MAX_ITEMS = 10;
/** Voice: drag this far left to cancel, this far up to lock; a press shorter than TAP_MS locks too. */
const CANCEL_PX = 110;
const LOCK_PX = 72;
const TAP_MS = 300;

const MEDIA_ASPECTS = [
  { label: "Original", value: "original" as const },
  { label: "1:1", value: 1 },
  { label: "4:5", value: 4 / 5 },
  { label: "16:9", value: 16 / 9 },
];

export type ComposerSubmit = { text: string; media: PreparedMedia[] };

export type Picked = {
  id: string;
  /** The original, so a second crop starts from the full picture. */
  file: File;
  prepared: PreparedMedia;
  preview: string | null;
};

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

/** Elapsed recording time; 0:00 while the microphone is still starting. */
function Clock({ startedAt }: { startedAt: number | null }) {
  const [now, setNow] = useState(startedAt ?? 0);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, []);
  const s = startedAt === null ? 0 : Math.max(0, Math.floor((now - startedAt) / 1000));
  return <span className="tabular-nums">{`${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`}</span>;
}

const ATTACH_OPTIONS = [
  { key: "gallery", label: "Gallery", icon: Images, accept: "image/*,video/*", multiple: true, capture: undefined },
  { key: "camera", label: "Camera", icon: Camera, accept: "image/*", multiple: false, capture: "environment" as const },
  { key: "document", label: "Document", icon: FileText, accept: undefined, multiple: true, capture: undefined },
  { key: "audio", label: "Audio", icon: Music, accept: "audio/*", multiple: true, capture: undefined },
] as const;

export function Composer({ chatId, onSend, onTyping, replyTo, onCancelReply, editing, onSubmitEdit, onCancelEdit }: Props) {
  const toast = useToast();
  const [text, setText] = useState(() => drafts.get(chatId) ?? "");
  const [items, setItems] = useState<Picked[]>([]);
  const [preparing, setPreparing] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [attachOpen, setAttachOpen] = useState(false);
  const [cropping, setCropping] = useState<{ id: string; url: string; natural: { width: number; height: number } } | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const area = useRef<HTMLTextAreaElement>(null);
  const inputs = useRef<Record<string, HTMLInputElement | null>>({});
  const lastTyping = useRef(0);
  const voice = useVoiceRecorder();
  const emojiMounted = useMountOnce(emojiOpen);
  // "hold": finger/mouse still down; "locked": hands-free with cancel + send.
  const [voiceMode, setVoiceMode] = useState<"hold" | "locked" | null>(null);
  const [drag, setDrag] = useState({ x: 0, y: 0 });
  const press = useRef<{ x: number; y: number; at: number; pointerId: number; lockedAtDown: boolean } | null>(null);

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

  // Previews still picked when the chat closes are released.
  const itemsRef = useRef(items);
  useLayoutEffect(() => {
    itemsRef.current = items;
  });
  useEffect(() => () => itemsRef.current.forEach((i) => i.preview && URL.revokeObjectURL(i.preview)), []);

  /** Start the microphone; leave voice mode if it doesn't start (blocked, unsupported, cancelled). */
  function startVoice(mode: "hold" | "locked") {
    setVoiceMode(mode);
    setDrag({ x: 0, y: 0 });
    voice.start().then((ok) => {
      if (ok) return;
      press.current = null;
      setVoiceMode(null);
    });
  }

  const removeItem = useCallback((id: string) => {
    setItems((list) => {
      const gone = list.find((i) => i.id === id);
      if (gone?.preview) URL.revokeObjectURL(gone.preview);
      return list.filter((i) => i.id !== id);
    });
  }, []);

  async function attach(files: File[]) {
    if (editing || !files.length) return;
    const room = MAX_ITEMS - items.length;
    if (room <= 0) return toast(`Up to ${MAX_ITEMS} items at a time.`, "error");
    if (files.length > room) toast(`Only the first ${room} were added (up to ${MAX_ITEMS} at a time).`);
    setPreparing(true);
    try {
      const added: Picked[] = [];
      for (const file of files.slice(0, room)) {
        try {
          const prepared = await prepareFile(file);
          const preview = prepared.kind === "IMAGE" || prepared.kind === "VIDEO" ? URL.createObjectURL(prepared.blob) : null;
          added.push({ id: crypto.randomUUID(), file, prepared, preview });
        } catch (err) {
          toast(err instanceof ClientApiError ? err.message : `Couldn't attach ${file.name}.`, "error");
        }
      }
      setItems((list) => [...list, ...added]);
      area.current?.focus();
    } finally {
      setPreparing(false);
    }
  }

  async function startCrop(item: Picked) {
    const url = URL.createObjectURL(item.file);
    const bitmap = await createImageBitmap(item.file, { imageOrientation: "from-image" }).catch(() => null);
    const natural = bitmap ? { width: bitmap.width, height: bitmap.height } : { width: item.prepared.width ?? 4, height: item.prepared.height ?? 3 };
    bitmap?.close();
    setCropping({ id: item.id, url, natural });
  }

  function endCrop() {
    if (cropping) URL.revokeObjectURL(cropping.url);
    setCropping(null);
  }

  async function applyCrop(cropArea: CropArea, rotation: number) {
    const target = cropping && items.find((i) => i.id === cropping.id);
    endCrop();
    if (!target) return;
    try {
      const canvas = await cropToCanvas(target.file, cropArea, rotation, 1920);
      const prepared = await encodeImage(canvas, target.prepared.contentType, target.file.name);
      const preview = URL.createObjectURL(prepared.blob);
      setItems((list) =>
        list.map((i) => {
          if (i.id !== target.id) return i;
          if (i.preview) URL.revokeObjectURL(i.preview);
          return { ...i, prepared, preview };
        }),
      );
    } catch {
      toast("Couldn't crop that image.", "error");
    }
  }

  function move(id: string, by: -1 | 1) {
    setItems((list) => {
      const i = list.findIndex((x) => x.id === id);
      const j = i + by;
      if (i < 0 || j < 0 || j >= list.length) return list;
      const next = [...list];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }

  const trimmed = text.trim();
  const canSend = editing ? trimmed.length > 0 || editing.type !== "TEXT" : (trimmed.length > 0 || items.length > 0) && text.length <= MESSAGE_MAX;

  function submit() {
    if (!canSend) return;
    if (editing) {
      onSubmitEdit(trimmed);
      return;
    }
    onSend({ text: trimmed, media: items.map((i) => i.prepared) });
    setText("");
    drafts.delete(chatId);
    // The previews now belong to the optimistic bubbles (they release them).
    for (const i of items) if (i.preview) setTimeout(() => URL.revokeObjectURL(i.preview!), 60_000);
    setItems([]);
    area.current?.focus();
  }

  // ── Voice ──
  async function finishVoice() {
    setVoiceMode(null);
    setDrag({ x: 0, y: 0 });
    const recorded = await voice.stop();
    if (recorded) onSend({ text: "", media: [recorded] });
  }

  function cancelVoice() {
    press.current = null;
    setVoiceMode(null);
    setDrag({ x: 0, y: 0 });
    voice.cancel();
  }

  function onMicDown(e: React.PointerEvent<HTMLButtonElement>) {
    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    press.current = { x: e.clientX, y: e.clientY, at: Date.now(), pointerId: e.pointerId, lockedAtDown: voiceMode === "locked" };
    if (voiceMode === "locked") return; // this press sends on release
    startVoice("hold");
  }

  function onMicMove(e: React.PointerEvent<HTMLButtonElement>) {
    const p = press.current;
    if (!p || p.pointerId !== e.pointerId || voiceMode !== "hold") return;
    const x = Math.min(0, e.clientX - p.x);
    const y = Math.min(0, e.clientY - p.y);
    if (-x > CANCEL_PX) return cancelVoice();
    if (-y > LOCK_PX) {
      setVoiceMode("locked");
      setDrag({ x: 0, y: 0 });
      return;
    }
    setDrag({ x, y });
  }

  function onMicUp(e: React.PointerEvent<HTMLButtonElement>) {
    const p = press.current;
    press.current = null;
    if (!p || p.pointerId !== e.pointerId) return;
    if (p.lockedAtDown) return void finishVoice();
    if (voiceMode !== "hold") return; // locked by sliding up: keep recording
    if (Date.now() - p.at < TAP_MS) {
      // A tap: hands-free recording.
      setVoiceMode("locked");
      setDrag({ x: 0, y: 0 });
      return;
    }
    finishVoice();
  }

  // ── Text ──
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
    const files = [...e.clipboardData.files];
    if (files.length) {
      e.preventDefault();
      attach(files);
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

  const inVoice = voiceMode !== null;
  const levels = voice.state.status === "recording" ? voice.state.levels : [];
  const showSend = canSend && !inVoice;
  const cancelProgress = Math.min(1, -drag.x / CANCEL_PX);

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
        attach([...e.dataTransfer.files]);
      }}
    >
      <AnimatePresence initial={false}>
        {(banner || items.length > 0) && !inVoice && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ type: "spring", stiffness: 500, damping: 40 }}
            className="overflow-hidden"
          >
            <div className="glass-2 mb-2 flex flex-col gap-2 rounded-[20px] p-2">
              {banner && (
                <div className="flex items-center gap-2.5 pl-2">
                  <banner.icon className="size-[18px] shrink-0 text-accent" aria-hidden="true" />
                  <div className="min-w-0 flex-1 border-l-2 border-accent pl-2.5">
                    <p className="text-[13px] font-semibold text-accent">{banner.title}</p>
                    <p className="truncate text-[13px] text-muted">{banner.body}</p>
                  </div>
                  <button type="button" onClick={banner.onClose} className="grid size-8 shrink-0 place-items-center rounded-full text-muted hover:bg-surface-3" aria-label="Cancel">
                    <X className="size-4" />
                  </button>
                </div>
              )}
              {items.length > 0 && (
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between px-1.5">
                    <p className="text-[13px] font-semibold text-muted">
                      {items.length === 1 ? "1 item" : `${items.length} items`} · {formatBytes(items.reduce((n, i) => n + i.prepared.blob.size, 0))}
                    </p>
                    {items.length > 1 && <p className="text-xs text-subtle">Drag to reorder</p>}
                  </div>
                  <AttachmentGrid items={items} onReorder={setItems} onMove={move} onRemove={removeItem} onCrop={startCrop} />
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <form
        method="post"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className="relative flex min-w-0 items-end gap-2"
      >
        {emojiMounted && <EmojiPicker open={emojiOpen} onPick={insertEmoji} onClose={() => setEmojiOpen(false)} />}
        {inVoice ? (
          // The recording bar takes the input's place. Everything in it may shrink
          // (min-width: 0); the send button beside it never does.
          <div className="glass-2 flex h-[54px] min-w-0 flex-1 items-center gap-2 rounded-[24px] pr-3 pl-1.5" role="status" aria-live="polite">
            {voiceMode === "locked" ? (
              <button type="button" onClick={cancelVoice} aria-label="Discard recording" className="grid size-10 shrink-0 place-items-center rounded-full text-danger hover:bg-danger-soft">
                <Trash2 className="size-5" />
              </button>
            ) : (
              <span className="grid size-10 shrink-0 place-items-center" aria-hidden="true">
                <span className="size-2.5 animate-pulse rounded-full bg-danger" />
              </span>
            )}
            <span className="shrink-0 text-[15px] font-semibold text-fg">
              <Clock startedAt={voice.state.status === "recording" ? voice.state.startedAt : null} />
            </span>
            <span className="flex h-7 min-w-0 flex-1 items-center justify-end gap-[2px] overflow-hidden" aria-hidden="true">
              {levels.map((l, i) => (
                <span key={i} className="w-[3px] shrink-0 rounded-full bg-accent" style={{ height: `${Math.max(12, l * 100)}%` }} />
              ))}
            </span>
            {voiceMode === "hold" && (
              <span
                className="flex shrink-0 items-center gap-0.5 text-[13px] font-medium whitespace-nowrap text-muted"
                style={{ transform: `translateX(${drag.x * 0.6}px)`, opacity: 1 - cancelProgress * 0.7 }}
                aria-hidden="true"
              >
                <ChevronLeft className="size-4" /> Slide to cancel
              </span>
            )}
            <span className="sr-only">{voiceMode === "locked" ? "Recording. Tap send to send, or discard." : "Recording. Release to send, slide left to cancel, slide up to lock."}</span>
          </div>
        ) : (
          <div
            className={cn(
              "glass-2 glass-focus-within flex min-h-12 min-w-0 flex-1 items-end rounded-[24px] transition-shadow",
              dragOver && "ring-4 ring-mint/40",
            )}
          >
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
              placeholder={items.length ? "Add a caption…" : editing ? "Edit message" : "Message"}
              maxLength={MESSAGE_MAX}
              enterKeyHint="send"
              className="max-h-40 min-h-[46px] min-w-0 flex-1 resize-none bg-transparent py-3 text-[16px] leading-[22px] text-fg placeholder:text-subtle focus:outline-none focus-visible:outline-none"
            />
            {!editing && (
              <button
                type="button"
                onClick={() => setAttachOpen(true)}
                disabled={preparing}
                aria-label="Attach"
                aria-haspopup="dialog"
                className="m-1 grid size-10 shrink-0 place-items-center rounded-full text-subtle hover:bg-surface-3 hover:text-fg disabled:opacity-50"
              >
                <Paperclip className={cn("size-[21px]", preparing && "animate-pulse")} />
              </button>
            )}
          </div>
        )}

        <div className="relative shrink-0">
          {/* Lock hint above the mic while holding. */}
          <AnimatePresence>
            {voiceMode === "hold" && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: Math.max(-LOCK_PX, drag.y) * 0.5 }}
                exit={{ opacity: 0, y: 10 }}
                className="glass-2 pointer-events-none absolute bottom-[60px] left-1/2 flex w-10 -translate-x-1/2 flex-col items-center gap-1 rounded-full py-2.5 text-muted"
                aria-hidden="true"
              >
                <Lock className="size-4" />
                <ChevronUp className="size-4 animate-bounce" />
              </motion.div>
            )}
          </AnimatePresence>
          <AnimatePresence initial={false} mode="popLayout">
            {showSend ? (
              <motion.button
                key="send"
                type="submit"
                aria-label={editing ? "Save edit" : "Send"}
                initial={{ scale: 0.4, opacity: 0, rotate: -30 }}
                animate={{ scale: 1, opacity: 1, rotate: 0 }}
                exit={{ scale: 0.4, opacity: 0 }}
                whileTap={{ scale: 0.9 }}
                transition={{ type: "spring", stiffness: 600, damping: 28 }}
                className="glass-primary grid size-12 shrink-0 place-items-center rounded-full"
              >
                {editing ? <Check className="size-6" strokeWidth={2.5} /> : <ArrowUp className="size-6" strokeWidth={2.5} />}
              </motion.button>
            ) : (
              !editing && (
                // One element from idle through recording, so the pointer stays captured.
                <motion.button
                  key="mic"
                  type="button"
                  onPointerDown={onMicDown}
                  onPointerMove={onMicMove}
                  onPointerUp={onMicUp}
                  onPointerCancel={cancelVoice}
                  onClick={(e) => {
                    if (e.detail !== 0) return; // pointer presses are handled above
                    // Keyboard: Enter/Space starts hands-free recording, again sends.
                    if (voiceMode === "locked") finishVoice();
                    else if (!inVoice) startVoice("locked");
                  }}
                  onKeyDown={(e) => e.key === "Escape" && inVoice && cancelVoice()}
                  onContextMenu={(e) => e.preventDefault()}
                  aria-label={voiceMode === "locked" ? "Send voice message" : voiceMode === "hold" ? "Release to send" : "Record voice message (hold, or tap for hands-free)"}
                  initial={{ scale: 0.4, opacity: 0 }}
                  animate={{ scale: voiceMode === "hold" ? 1.18 : 1, opacity: 1, x: voiceMode === "hold" ? drag.x * 0.25 : 0 }}
                  exit={{ scale: 0.4, opacity: 0 }}
                  transition={{ type: "spring", stiffness: 600, damping: 28 }}
                  className={cn(
                    "grid size-12 shrink-0 touch-none place-items-center rounded-full select-none",
                    inVoice ? "glass-primary" : "glass-2 glass-focus text-fg",
                  )}
                >
                  {voiceMode === "locked" ? <ArrowUp className="size-6" strokeWidth={2.5} /> : <Mic className="size-[22px]" />}
                </motion.button>
              )
            )}
          </AnimatePresence>
        </div>
      </form>

      <Sheet open={attachOpen} onClose={() => setAttachOpen(false)} title="Attach">
        <div className="grid grid-cols-4 gap-2 pt-1">
          {ATTACH_OPTIONS.map((o) => (
            <button
              key={o.key}
              type="button"
              onClick={() => {
                inputs.current[o.key]?.click();
                setAttachOpen(false);
              }}
              className="glass-1 glass-sheen flex flex-col items-center gap-2 rounded-2xl px-1 py-3.5 text-[13px] font-semibold transition-transform active:scale-[0.97]"
            >
              <span className="glass-primary grid size-12 place-items-center rounded-2xl">
                <o.icon className="size-[22px]" aria-hidden="true" />
              </span>
              {o.label}
            </button>
          ))}
        </div>
        <p className="mt-3 text-center text-xs text-muted">Up to {MAX_ITEMS} at a time · photos are compressed before sending</p>
      </Sheet>
      {ATTACH_OPTIONS.map((o) => (
        <input
          key={o.key}
          ref={(el) => {
            inputs.current[o.key] = el;
          }}
          type="file"
          hidden
          accept={o.accept}
          multiple={o.multiple}
          capture={o.capture}
          onChange={(e) => {
            const files = [...(e.target.files ?? [])];
            e.target.value = "";
            attach(files);
          }}
        />
      ))}

      {cropping && (
        <ImageCropper
          src={cropping.url}
          title="Crop"
          aspects={MEDIA_ASPECTS}
          natural={cropping.natural}
          saveLabel="Done"
          onCancel={endCrop}
          onSave={applyCrop}
        />
      )}
    </div>
  );
}
