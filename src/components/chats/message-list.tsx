"use client";

import { forwardRef, memo } from "react";
import { Virtuoso, type VirtuosoHandle } from "react-virtuoso";
import { Spinner } from "@/components/ui/spinner";
import { ClientTime, formatDay } from "@/lib/client/time";
import type { TimelineItem } from "@/lib/chats/timeline";
import { CHAT_HEADER_HEIGHT } from "./chat-header";
import { MessageBubble } from "./message-bubble";

type ListContext = {
  loadingOlder: boolean;
  reachedStart: boolean;
  footerHeight: number;
};

function Header({ context }: { context?: ListContext }) {
  return (
    <div style={{ paddingTop: `calc(${CHAT_HEADER_HEIGHT}px + env(safe-area-inset-top))` }}>
      <div className="flex h-12 items-center justify-center">
        {context?.loadingOlder ? (
          <Spinner className="size-5 text-subtle" />
        ) : context?.reachedStart ? (
          <span className="rounded-full bg-surface/80 px-3 py-1 text-xs font-medium text-muted shadow-[var(--shadow-sm)]">
            This is the start of your conversation
          </span>
        ) : null}
      </div>
    </div>
  );
}

function Footer({ context }: { context?: ListContext }) {
  return <div style={{ height: (context?.footerHeight ?? 80) + 8 }} />;
}

const DaySeparator = memo(function DaySeparator({ iso }: { iso: string }) {
  return (
    <div className="sticky top-0 flex justify-center py-2">
      <span className="glass rounded-full border border-line px-3 py-1 text-xs font-semibold text-muted shadow-[var(--shadow-sm)]">
        <ClientTime iso={iso} format={formatDay} />
      </span>
    </div>
  );
});

function UnreadDivider() {
  return (
    <div className="my-2 flex items-center gap-3 px-6" role="separator">
      <span className="h-px flex-1 bg-accent/40" />
      <span className="text-xs font-bold tracking-wide text-accent uppercase">Unread messages</span>
      <span className="h-px flex-1 bg-accent/40" />
    </div>
  );
}

type Props = {
  items: TimelineItem[];
  firstItemIndex: number;
  initialIndex: number;
  meId: string;
  loadingOlder: boolean;
  reachedStart: boolean;
  footerHeight: number;
  shouldAnimate: (key: string) => boolean;
  onStartReached: () => void;
  onAtBottomChange: (atBottom: boolean) => void;
  onRetry: (clientId: string) => void;
};

/**
 * Virtualized conversation (only visible rows are in the DOM). Older pages are
 * prepended by lowering `firstItemIndex`, which keeps the scroll position fixed.
 */
export const MessageList = forwardRef<VirtuosoHandle, Props>(function MessageList(
  { items, firstItemIndex, initialIndex, meId, loadingOlder, reachedStart, footerHeight, shouldAnimate, onStartReached, onAtBottomChange, onRetry },
  ref,
) {
  return (
    <Virtuoso<TimelineItem, ListContext>
      ref={ref}
      className="h-full overscroll-contain"
      data={items}
      firstItemIndex={firstItemIndex}
      initialTopMostItemIndex={{ index: initialIndex, align: initialIndex === items.length - 1 ? "end" : "start" }}
      alignToBottom
      computeItemKey={(_, item) => item.key}
      followOutput={(atBottom) => (atBottom ? "smooth" : false)}
      atBottomThreshold={96}
      atBottomStateChange={onAtBottomChange}
      startReached={onStartReached}
      increaseViewportBy={{ top: 800, bottom: 400 }}
      context={{ loadingOlder, reachedStart, footerHeight }}
      components={{ Header, Footer }}
      itemContent={(_, item) => {
        if (item.kind === "day") return <DaySeparator iso={item.iso} />;
        if (item.kind === "unread") return <UnreadDivider />;
        return (
          <MessageBubble
            message={item.message}
            mine={item.message.senderId === meId}
            groupStart={item.groupStart}
            groupEnd={item.groupEnd}
            animate={shouldAnimate(item.key)}
            onRetry={onRetry}
          />
        );
      }}
    />
  );
});
