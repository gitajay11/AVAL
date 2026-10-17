"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { ChatListItemDTO } from "@/lib/chats/types";
import { ChatListItem } from "./chat-list-item";

const ROW = 70; // estimated row height incl. the 6px gap

/** The chat list once it's long (chat-sidebar.tsx): only the visible rows are rendered. */
export function VirtualChatList({ chats, meId, activeId, typing, scroller }: {
  chats: ChatListItemDTO[];
  meId: string;
  activeId: string | null;
  typing: Record<string, unknown>;
  scroller: React.RefObject<HTMLDivElement | null>;
}) {
  const list = useRef<HTMLUListElement>(null);
  const [margin, setMargin] = useState(0);
  useLayoutEffect(() => {
    const el = list.current;
    if (!el) return;
    const update = () => setMargin(el.offsetTop);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el.parentElement!);
    return () => ro.disconnect();
  }, []);
  // TanStack Virtual keeps its own mutable state, so the React Compiler skips this component.
  // eslint-disable-next-line react-hooks/incompatible-library
  const v = useVirtualizer({
    count: chats.length,
    getScrollElement: () => scroller.current,
    estimateSize: () => ROW,
    getItemKey: (i) => chats[i].id,
    overscan: 6,
    gap: 6,
    scrollMargin: margin,
  });
  return (
    <ul ref={list} className="relative my-1.5" style={{ height: v.getTotalSize() }}>
      {v.getVirtualItems().map((row) => {
        const chat = chats[row.index];
        return (
          <ChatListItem
            key={chat.id}
            prefetchContent={row.index < 6}
            chat={chat}
            meId={meId}
            active={chat.id === activeId}
            typing={Boolean(typing[chat.id])}
            virtual={{ index: row.index, start: row.start - margin, measure: v.measureElement }}
          />
        );
      })}
    </ul>
  );
}
