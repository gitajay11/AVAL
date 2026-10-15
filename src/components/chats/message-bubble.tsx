"use client";

import { memo, useSyncExternalStore } from "react";
import { animate, motion, useMotionValue, useTransform } from "motion/react";
import { AlertCircle, Check, CheckCheck, Clock3, Forward, Pin, Reply, Star } from "lucide-react";
import { useLongPress } from "@/components/ui/action-menu";
import { cn } from "@/lib/cn";
import { formatClock } from "@/lib/client/time";
import { isJumboEmoji, type UiMessage } from "@/lib/chats/timeline";
import { useChatActions } from "./chat-actions";
import { Attachments, LinkPreviewCard } from "./media/attachments";
import { snippetOf } from "./message-snippet";
import { MessageText } from "./message-text";

/** "none": journals (personal contacts) have nobody to deliver to. */
export type Receipt = "sending" | "failed" | "sent" | "delivered" | "read" | "none";

type Props = {
  message: UiMessage;
  mine: boolean;
  groupStart: boolean;
  groupEnd: boolean;
  animate: boolean;
  receipt: Receipt;
  highlighted: boolean;
};

function Ticks({ receipt, onBrand }: { receipt: Receipt; onBrand: boolean }) {
  if (receipt === "sending") return <Clock3 className="size-3" aria-label="Sending" />;
  if (receipt === "failed" || receipt === "none") return null;
  if (receipt === "sent") return <Check className="size-3.5" aria-label="Sent" />;
  return (
    <CheckCheck
      className={cn("size-3.5", receipt === "read" && (onBrand ? "text-[#a7f3d0]" : "text-accent"))}
      aria-label={receipt === "read" ? "Read" : "Delivered"}
    />
  );
}

const coarse = () => window.matchMedia("(pointer: coarse)").matches;
const useTouch = () => useSyncExternalStore(() => () => {}, coarse, () => false);

const SWIPE_TRIGGER = 64;

export const MessageBubble = memo(function MessageBubble({ message, mine, groupStart, groupEnd, animate: animateIn, receipt, highlighted }: Props) {
  const actions = useChatActions();
  const touch = useTouch();
  const x = useMotionValue(0);
  const replyIconOpacity = useTransform(x, [-SWIPE_TRIGGER, -16, 0], [1, 0, 0]);
  const interactive = !actions.readOnly && !message.deleted && message.status === "sent";
  const longPress = useLongPress((point) => actions.openMenu(message, point), interactive);

  const jumbo = !message.deleted && !message.attachments.length && isJumboEmoji(message.text);
  const media = message.attachments.find((a) => a.kind === "IMAGE" || a.kind === "VIDEO");
  const mediaOnly = media && !message.text && !message.replyTo && !message.forwardedFromName;
  const uploading = message.upload !== undefined && message.status === "sending";

  const meta = (
    <span
      className={cn(
        "ml-2 inline-flex translate-y-[3px] items-center gap-1 align-bottom text-[11px] leading-none whitespace-nowrap select-none",
        mediaOnly
          ? "absolute right-2 bottom-2 translate-y-0 rounded-full bg-black/45 px-1.5 py-1 text-white"
          : jumbo
            ? "mt-0.5 flex justify-end text-muted"
            : cn("float-right mt-1.5", mine ? "text-white/75" : "text-subtle"),
      )}
    >
      {message.starred && <Star className="size-3" fill="currentColor" aria-label="Starred" />}
      {message.pinnedAt && <Pin className="size-3 rotate-45" aria-label="Pinned" />}
      {message.editedAt && !message.deleted && <span>edited</span>}
      <time dateTime={message.createdAt}>{formatClock(message.createdAt)}</time>
      {mine && <Ticks receipt={receipt} onBrand={!jumbo && !mediaOnly} />}
    </span>
  );

  const reactions = message.reactions.length > 0 && (
    <div className={cn("mt-1.5 flex flex-wrap gap-1", jumbo && "justify-end")}>
      {message.reactions.map((r) => {
        const reacted = r.userIds.includes(actions.meId);
        return (
          <motion.button
            key={r.emoji}
            type="button"
            layout
            initial={{ scale: 0.6 }}
            animate={{ scale: 1 }}
            whileTap={{ scale: 0.85 }}
            onClick={() => actions.toggleReaction(message, r.emoji)}
            disabled={actions.readOnly}
            aria-pressed={reacted}
            aria-label={`${r.emoji} ${r.userIds.length}${reacted ? ", including you" : ""}`}
            className={cn(
              "inline-flex h-7 items-center gap-1 rounded-full px-2 text-[14px] font-semibold transition-colors",
              mine
                ? reacted
                  ? "bg-white text-[#0f3d6e]"
                  : "bg-white/18 text-white"
                : reacted
                  ? "bg-brand text-white"
                  : "bg-surface-3 text-fg",
            )}
          >
            <span>{r.emoji}</span>
            {r.userIds.length > 1 && <span className="text-xs">{r.userIds.length}</span>}
          </motion.button>
        );
      })}
    </div>
  );

  return (
    <div
      className={cn("relative flex px-3 sm:px-5", mine ? "justify-end" : "justify-start", groupStart ? "pt-2" : "pt-[3px]")}
      data-message-id={message.id}
    >
      {touch && interactive && (
        <motion.span
          style={{ opacity: replyIconOpacity }}
          className="pointer-events-none absolute top-1/2 right-4 grid size-8 -translate-y-1/2 place-items-center rounded-full bg-surface-3 text-accent"
          aria-hidden="true"
        >
          <Reply className="size-4" />
        </motion.span>
      )}
      <motion.div
        initial={animateIn ? { opacity: 0, y: 12, scale: 0.96, x: mine ? 12 : -12 } : false}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: "spring", stiffness: 520, damping: 34, mass: 0.7 }}
        style={{ transformOrigin: mine ? "bottom right" : "bottom left", x, touchAction: "pan-y" }}
        drag={touch && interactive ? "x" : false}
        dragDirectionLock
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={{ left: 0.45, right: 0 }}
        onDragEnd={() => {
          if (x.get() < -SWIPE_TRIGGER) {
            navigator.vibrate?.(8);
            actions.reply(message);
          }
          animate(x, 0, { type: "spring", stiffness: 600, damping: 40 });
        }}
        className={cn("flex max-w-[min(82%,560px)] items-end gap-2", mine && "flex-row-reverse")}
        {...longPress}
      >
        <div
          className={cn(
            "relative min-w-0 text-[15px] leading-[1.4] transition-shadow duration-500",
            jumbo
              ? "flex flex-col px-1 text-[44px] leading-[1.15] tracking-[-0.05em]"
              : cn(
                  "rounded-[20px]",
                  mediaOnly ? "overflow-hidden p-1" : "px-3.5 pt-2 pb-2",
                  mine ? "bg-brand text-white shadow-[0_6px_16px_-10px_rgb(29_78_216/0.7)]" : "border border-line bg-surface text-fg shadow-[var(--shadow-sm)]",
                  groupEnd && (mine ? "rounded-br-[6px]" : "rounded-bl-[6px]"),
                  !groupStart && (mine ? "rounded-tr-[8px]" : "rounded-tl-[8px]"),
                ),
            highlighted && "ring-4 ring-accent/60",
            message.status === "sending" && !uploading && "opacity-80",
          )}
        >
          {message.forwardedFromName && !message.deleted && (
            <p className={cn("mb-1 flex items-center gap-1 text-[13px] font-semibold", mine ? "text-white/85" : "text-accent")}>
              <Forward className="size-3.5" aria-hidden="true" /> Forwarded from {message.forwardedFromName}
            </p>
          )}
          {message.replyTo && !message.deleted && (
            <button
              type="button"
              onClick={() => actions.jumpTo(message.replyTo!.id)}
              className={cn(
                "mb-1.5 block w-full max-w-[300px] rounded-[10px] border-l-[3px] px-2.5 py-1 text-left",
                mine ? "border-white/80 bg-white/14" : "border-accent bg-accent-soft",
              )}
            >
              <span className={cn("block truncate text-[13px] font-semibold", mine ? "text-white" : "text-accent")}>
                {actions.nameOf(message.replyTo.senderId)}
              </span>
              <span className={cn("block truncate text-[13px]", mine ? "text-white/80" : "text-muted")}>{snippetOf(message.replyTo)}</span>
            </button>
          )}
          {message.deleted ? (
            <span className="italic opacity-75">Message deleted</span>
          ) : (
            <>
              {message.attachments.length > 0 && (
                <div className={cn("relative", message.text && "mb-1.5")}>
                  <Attachments attachments={message.attachments} mine={mine} canDownload={!actions.readOnly} />
                  {uploading && (
                    <span className="absolute inset-0 grid place-items-center rounded-[14px] bg-black/35">
                      <svg viewBox="0 0 36 36" className="size-12 -rotate-90" aria-label={`Uploading ${Math.round((message.upload ?? 0) * 100)}%`}>
                        <circle cx="18" cy="18" r="15" fill="none" stroke="rgb(255 255 255 / 0.3)" strokeWidth="3" />
                        <circle
                          cx="18"
                          cy="18"
                          r="15"
                          fill="none"
                          stroke="white"
                          strokeWidth="3"
                          strokeLinecap="round"
                          strokeDasharray={`${(message.upload ?? 0) * 94.2} 94.2`}
                        />
                      </svg>
                    </span>
                  )}
                </div>
              )}
              {message.text && <MessageText text={message.text} />}
              {message.linkPreview && <LinkPreviewCard preview={message.linkPreview} mine={mine} />}
            </>
          )}
          {!jumbo && reactions}
          {meta}
        </div>
        {jumbo && reactions}
        {message.status === "failed" && message.clientId && (
          <button
            type="button"
            onClick={() => actions.retry(message.clientId!)}
            className="mb-1 grid size-7 shrink-0 place-items-center rounded-full text-danger hover:bg-danger-soft"
            aria-label="Not sent. Tap to retry"
            title="Not sent. Tap to retry"
          >
            <AlertCircle className="size-5" />
          </button>
        )}
      </motion.div>
    </div>
  );
});
