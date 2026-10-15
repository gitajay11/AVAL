"use client";

import { memo } from "react";
import { motion } from "motion/react";
import { AlertCircle, Check, Clock3 } from "lucide-react";
import { cn } from "@/lib/cn";
import { formatClock } from "@/lib/client/time";
import { isJumboEmoji, type UiMessage } from "@/lib/chats/timeline";
import { MessageText } from "./message-text";

type Props = {
  message: UiMessage;
  mine: boolean;
  groupStart: boolean;
  groupEnd: boolean;
  animate: boolean;
  onRetry: (clientId: string) => void;
};

function Status({ message }: { message: UiMessage }) {
  if (message.status === "sending") return <Clock3 className="size-3" aria-label="Sending" />;
  if (message.status === "failed") return null;
  return <Check className="size-3.5" aria-label="Sent" />;
}

export const MessageBubble = memo(function MessageBubble({ message, mine, groupStart, groupEnd, animate, onRetry }: Props) {
  const jumbo = !message.deleted && isJumboEmoji(message.text);
  const meta = (
    <span
      className={cn(
        "ml-2 inline-flex translate-y-[3px] items-center gap-1 align-bottom text-[11px] leading-none whitespace-nowrap select-none",
        jumbo ? "text-muted" : mine ? "text-white/75" : "text-subtle",
        // Jumbo emoji get the time on its own line; text bubbles float it into the last line.
        jumbo ? "mt-0.5 flex justify-end" : "float-right mt-1.5",
      )}
    >
      {message.editedAt && <span>edited</span>}
      <time dateTime={message.createdAt}>{formatClock(message.createdAt)}</time>
      {mine && <Status message={message} />}
    </span>
  );

  return (
    <div className={cn("flex px-3 sm:px-5", mine ? "justify-end" : "justify-start", groupStart ? "pt-2" : "pt-[3px]")}>
      <motion.div
        initial={animate ? { opacity: 0, y: 12, scale: 0.96, x: mine ? 12 : -12 } : false}
        animate={{ opacity: 1, y: 0, scale: 1, x: 0 }}
        transition={{ type: "spring", stiffness: 520, damping: 34, mass: 0.7 }}
        style={{ transformOrigin: mine ? "bottom right" : "bottom left" }}
        className={cn("flex max-w-[min(82%,560px)] items-end gap-2", mine && "flex-row-reverse")}
      >
        <div
          className={cn(
            "relative min-w-0 text-[15px] leading-[1.4]",
            jumbo
              ? "flex flex-col px-1 text-[44px] leading-[1.15] tracking-[-0.05em]"
              : cn(
                  "rounded-[20px] px-3.5 pt-2 pb-2",
                  mine ? "bg-brand text-white shadow-[0_6px_16px_-10px_rgb(29_78_216/0.7)]" : "border border-line bg-surface text-fg shadow-[var(--shadow-sm)]",
                  groupEnd && (mine ? "rounded-br-[6px]" : "rounded-bl-[6px]"),
                  !groupStart && (mine ? "rounded-tr-[8px]" : "rounded-tl-[8px]"),
                ),
            message.status === "sending" && "opacity-80",
          )}
        >
          {message.deleted ? (
            <span className="italic opacity-75">Message deleted</span>
          ) : (
            <MessageText text={message.text ?? ""} />
          )}
          {meta}
        </div>
        {message.status === "failed" && message.clientId && (
          <button
            type="button"
            onClick={() => onRetry(message.clientId!)}
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
