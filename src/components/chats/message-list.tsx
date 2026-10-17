"use client";

import { useVirtualizer } from "@tanstack/react-virtual";
import { forwardRef, memo, useCallback, useImperativeHandle, useLayoutEffect, useRef, useState } from "react";
import { Spinner } from "@/components/ui/spinner";
import { ClientTime, formatDay } from "@/lib/client/time";
import type { TimelineItem, UiMessage } from "@/lib/chats/timeline";
import { scrollBehavior } from "@/lib/client/motion";
import { CHAT_HEADER_HEIGHT } from "./chat-header";
import { MessageBubble, type Receipt } from "./message-bubble";

const DaySeparator = memo(function DaySeparator({ iso }: { iso: string }) {
  return (
    <div className="flex justify-center py-2">
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

/** Rough first-render height; every row is measured right after it mounts. */
function estimate(item: TimelineItem | undefined): number {
  if (!item) return 56;
  if (item.kind !== "message") return 44;
  const m = item.message;
  let h = 48;
  if (m.text) h += Math.max(0, Math.ceil(m.text.length / 34) - 1) * 21;
  if (m.attachments.length) h += m.attachments[0].kind === "IMAGE" || m.attachments[0].kind === "VIDEO" ? 240 : 56;
  if (m.replyTo) h += 44;
  if (m.linkPreview) h += 90;
  if (m.reactions.length) h += 30;
  if (item.groupStart) h += 6;
  return h;
}

export type MessageListHandle = {
  scrollToIndex: (opts: { index: number | "LAST"; align?: "start" | "center" | "end"; behavior?: "smooth" | "auto" }) => void;
};

type Props = {
  items: TimelineItem[];
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

const AT_BOTTOM_PX = 96;
const LOAD_OLDER_PX = 600;
const LOAD_NEWER_PX = 400;
/** Messages rendered on the server (and in the first client render) before virtualising. */
const SSR_TAIL = 14;

/**
 * Virtualized conversation (only rows near the viewport are in the DOM).
 *
 * Opens on its first frame at the latest message (or at `initialIndex` for a
 * jump/unread position): the window is computed from an estimated offset before
 * anything is measured, then pinned before paint. `anchorTo: "end"` keeps the
 * view put when older pages are prepended or rows resize, and follows new
 * messages while you're at the bottom.
 */
export const MessageList = forwardRef<MessageListHandle, Props>(function MessageList(
  { items, initialIndex, meId, loadingOlder, reachedStart, footerHeight, highlightedId, headerExtra, receiptFor, shouldAnimate, onStartReached, onEndReached, loadingNewer, onAtBottomChange },
  ref,
) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [margin, setMargin] = useState(CHAT_HEADER_HEIGHT + headerExtra + 48);
  const openAtBottom = initialIndex >= items.length - 1;

  const itemsRef = useRef(items);
  itemsRef.current = items;

  // TanStack Virtual keeps its own mutable state, so the React Compiler skips this component.
  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: (i) => estimate(itemsRef.current[i]),
    getItemKey: (i) => itemsRef.current[i]?.key ?? i,
    overscan: 8,
    scrollMargin: margin,
    anchorTo: "end",
    followOnAppend: scrollBehavior(),
    scrollEndThreshold: AT_BOTTOM_PX,
    // First render happens before the scroller exists: assume the window size
    // and start where the list should open, so the right rows render at once.
    initialRect: typeof window === "undefined" ? undefined : { width: window.innerWidth, height: window.innerHeight },
    initialOffset: () => {
      let before = 0;
      const stop = openAtBottom ? items.length : initialIndex;
      for (let i = 0; i < stop; i++) before += estimate(items[i]);
      const viewport = typeof window === "undefined" ? 800 : window.innerHeight;
      return Math.max(0, margin + before - (openAtBottom ? viewport - footerHeight : 0));
    },
  });

  // Header + spacer height above the rows (the floating chat header, safe area, start-of-chat note).
  useLayoutEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const update = () => setMargin(el.offsetTop);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el.parentElement!);
    return () => ro.disconnect();
  }, []);

  // The row range depends on the viewport, which the server can't know. Until
  // the first client commit, server and client both render a plain tail of the
  // conversation in normal flow (it sits at the bottom, so it shows before any
  // JavaScript runs); the virtual rows take over in a layout effect, before paint.
  const [mounted, setMounted] = useState(false);
  useLayoutEffect(() => setMounted(true), []);

  // Pin the starting position before the first paint of the virtual rows.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el || !mounted) return;
    if (openAtBottom) el.scrollTop = el.scrollHeight;
    else virtualizer.scrollToIndex(initialIndex, { align: "start" });
    // Once: later changes are handled by anchoring and following.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted]);

  const atBottom = useRef(true);
  const nearTop = useRef(false);
  const nearBottom = useRef(false);
  const lastCount = useRef(items.length);

  const check = useCallback(
    (fromItemsChange: boolean) => {
      const el = scrollRef.current;
      if (!el) return;
      const fromEnd = el.scrollHeight - el.scrollTop - el.clientHeight;
      const bottom = fromEnd <= AT_BOTTOM_PX;
      if (bottom !== atBottom.current) {
        atBottom.current = bottom;
        onAtBottomChange(bottom);
      }
      // Fire on entering the zone, and again after a page lands while still in it.
      const top = el.scrollTop <= LOAD_OLDER_PX;
      if (top && (!nearTop.current || fromItemsChange)) onStartReached();
      nearTop.current = top;
      const end = fromEnd <= LOAD_NEWER_PX;
      if (end && (!nearBottom.current || fromItemsChange)) onEndReached();
      nearBottom.current = end;
    },
    [onAtBottomChange, onStartReached, onEndReached],
  );

  useLayoutEffect(() => {
    if (items.length === lastCount.current) return;
    lastCount.current = items.length;
    requestAnimationFrame(() => check(true));
  }, [items.length, check]);

  useImperativeHandle(
    ref,
    () => ({
      scrollToIndex: ({ index, align = "start", behavior }) => {
        const el = scrollRef.current;
        if (!el) return;
        if (index === "LAST") el.scrollTo({ top: el.scrollHeight, behavior: behavior ?? "auto" });
        else virtualizer.scrollToIndex(index, { align, behavior: behavior ?? "auto" });
      },
    }),
    [virtualizer],
  );

  const rows = mounted ? virtualizer.getVirtualItems() : [];
  const tailStart = openAtBottom ? Math.max(0, items.length - SSR_TAIL) : initialIndex;
  const tail = mounted ? [] : items.slice(tailStart, tailStart + SSR_TAIL);

  const renderItem = (item: TimelineItem) =>
    item.kind === "day" ? (
      <DaySeparator iso={item.iso} />
    ) : item.kind === "unread" ? (
      <UnreadDivider />
    ) : (
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

  return (
    <div
      ref={scrollRef}
      data-message-scroller=""
      onScroll={() => check(false)}
      className="chat-fade h-full overflow-y-auto overscroll-contain [overflow-anchor:none]"
    >
      <div className="flex min-h-full flex-col">
        {/* Short conversations sit at the bottom, like a chat. */}
        <div className="flex-1" />
        <div style={{ paddingTop: `calc(${CHAT_HEADER_HEIGHT + headerExtra}px + env(safe-area-inset-top))` }}>
          <div className="flex h-12 items-center justify-center">
            {loadingOlder ? (
              <Spinner className="size-5 text-subtle" />
            ) : reachedStart && (mounted || tailStart === 0) ? (
              <span className="glass-1 rounded-full px-3 py-1 text-xs font-medium text-muted">This is the start of your conversation</span>
            ) : null}
          </div>
        </div>
        <div ref={listRef} className="relative w-full" style={mounted ? { height: virtualizer.getTotalSize() } : undefined}>
          {tail.map((item) => (
            <div key={item.key}>{renderItem(item)}</div>
          ))}
          {rows.map((row) => {
            const item = items[row.index];
            if (!item) return null;
            return (
              <div
                key={row.key}
                data-index={row.index}
                ref={virtualizer.measureElement}
                className="absolute top-0 left-0 w-full"
                style={{ transform: `translateY(${row.start - virtualizer.options.scrollMargin}px)` }}
              >
                {renderItem(item)}
              </div>
            );
          })}
        </div>
        <div style={{ height: footerHeight + 8 }} className="flex justify-center pt-2">
          {loadingNewer && <Spinner className="size-5 text-subtle" />}
        </div>
      </div>
    </div>
  );
});
