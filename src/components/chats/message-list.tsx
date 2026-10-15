"use client";

import { forwardRef, memo } from "react";
import { Virtuoso, type VirtuosoHandle } from "react-virtuoso";
import { Spinner } from "@/components/ui/spinner";
import { ClientTime, formatDay } from "@/lib/client/time";
import type { TimelineItem, UiMessage } from "@/lib/chats/timeline";
import { scrollBehavior } from "@/lib/client/motion";
import { CHAT_HEADER_HEIGHT } from "./chat-header";
import { MessageBubble, type Receipt } from "./message-bubble";

type ListContext = {
  loadingOlder: boolean;
  loadingNewer: boolean;
  reachedStart: boolean;
  footerHeight: number;
  headerExtra: number;
};

function Header({ context }: { context?: ListContext }) {
  return (
    <div style={{ paddingTop: `calc(${CHAT_HEADER_HEIGHT + (context?.headerExtra ?? 0)}px + env(safe-area-inset-top))` }}>
      <div className="flex h-12 items-center justify-center">
        {context?.loadingOlder ? (
          <Spinner className="size-5 text-subtle" />
        ) : context?.reachedStart ? (
          <span className="glass-1 rounded-full px-3 py-1 text-xs font-medium text-muted">
            This is the start of your conversation
          </span>
        ) : null}
      </div>
    </div>
  );
}

function Footer({ context }: { context?: ListContext }) {
  return (
    <div style={{ height: (context?.footerHeight ?? 80) + 8 }} className="flex justify-center pt-2">
      {context?.loadingNewer && <Spinner className="size-5 text-subtle" />}
    </div>
  );
}

const DaySeparator = memo(function DaySeparator({ iso }: { iso: string }) {
  return (
    <div className="sticky top-0 flex justify-center py-2">
      <span className="glass-1 rounded-full px-3 py-1 text-xs font-semibold text-muted">
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
  highlightedId: string | null;
  headerExtra: number;
  receiptFor: (m: UiMessage) => Receipt;
  shouldAnimate: (key: string) => boolean;
  onStartReached: () => void;
  onEndReached: () => void;
  loadingNewer: boolean;
  onAtBottomChange: (atBottom: boolean) => void;
};

/**
 * Virtualized conversation (only visible rows are in the DOM). Older pages are
 * prepended by lowering `firstItemIndex`, which keeps the scroll position fixed.
 */
export const MessageList = forwardRef<VirtuosoHandle, Props>(function MessageList(
  { items, firstItemIndex, initialIndex, meId, loadingOlder, reachedStart, footerHeight, highlightedId, headerExtra, receiptFor, shouldAnimate, onStartReached, onEndReached, loadingNewer, onAtBottomChange },
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
      followOutput={(atBottom) => (atBottom ? scrollBehavior() : false)}
      atBottomThreshold={96}
      atBottomStateChange={onAtBottomChange}
      startReached={onStartReached}
      endReached={onEndReached}
      increaseViewportBy={{ top: 800, bottom: 400 }}
      context={{ loadingOlder, loadingNewer, reachedStart, footerHeight, headerExtra }}
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
            receipt={receiptFor(item.message)}
            highlighted={item.message.id === highlightedId}
          />
        );
      }}
    />
  );
});
