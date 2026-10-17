"use client";

import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { ChevronLeft, Star, StarOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { api } from "@/lib/client/api";
import { ClientTime, formatListTime } from "@/lib/client/time";
import type { StarredItem } from "@/lib/chats/starred";
import { snippetOf } from "./message-snippet";
import { MessageText } from "./message-text";
import { FloatingBar } from "@/components/ui/floating-bar";

/** My starred messages across all chats, newest saved first. */
export function SavedView({ initial, initialCursor }: { initial: StarredItem[]; initialCursor: string | null }) {
  const toast = useToast();
  const [items, setItems] = useState(initial);
  const [cursor, setCursor] = useState(initialCursor);
  const [loading, setLoading] = useState(false);

  async function more() {
    if (!cursor) return;
    setLoading(true);
    try {
      const r = await api<{ items: StarredItem[]; olderCursor: string | null }>(`/api/me/starred?before=${cursor}`);
      setItems((cur) => [...cur, ...r.items]);
      setCursor(r.olderCursor);
    } finally {
      setLoading(false);
    }
  }

  async function unstar(id: string) {
    setItems((cur) => cur.filter((i) => i.message.id !== id));
    await api(`/api/messages/${id}/star`, { method: "DELETE" }).catch(() => toast("Couldn't remove it.", "error"));
  }

  return (
    <div className="h-full overflow-y-auto">
      <FloatingBar className="flex items-center gap-2 px-2 py-2">
        <Link href="/chats" className="grid size-10 place-items-center rounded-xl text-fg hover:bg-surface-3 md:hidden" aria-label="Back to chats">
          <ChevronLeft className="size-6" />
        </Link>
        <h1 className="floating-title px-1 text-xl font-extrabold tracking-tight">Starred messages</h1>
      </FloatingBar>
      <div className="mx-auto flex max-w-2xl flex-col gap-3 px-4 py-5 pb-[max(2rem,env(safe-area-inset-bottom))]">
        {items.length === 0 && (
          <div className="flex flex-col items-center gap-3 pt-16 text-center">
            <span className="grid size-16 place-items-center rounded-[22px] bg-brand text-white">
              <Star className="size-7" aria-hidden="true" />
            </span>
            <p className="text-lg font-bold">Nothing starred yet</p>
            <p className="max-w-xs text-[15px] text-muted">Long-press or right-click a message and choose Star to keep it here.</p>
          </div>
        )}
        <AnimatePresence initial={false}>
          {items.map((i) => (
            <motion.article
              key={i.message.id}
              layout
              exit={{ opacity: 0, height: 0 }}
              className="glass-1 rounded-[20px] p-4"
            >
              <div className="mb-1.5 flex items-center gap-2 text-sm">
                <Link href={`/chats/${i.chat.id}`} className="font-semibold text-accent hover:underline">
                  {i.chat.title}
                </Link>
                <span className="text-subtle">
                  · <ClientTime iso={i.message.createdAt} format={formatListTime} />
                </span>
                <button type="button" onClick={() => unstar(i.message.id)} className="ml-auto grid size-8 place-items-center rounded-full text-subtle hover:bg-surface-3" aria-label="Unstar">
                  <StarOff className="size-4" />
                </button>
              </div>
              {i.message.text ? <MessageText text={i.message.text} className="text-[15px]" /> : <p className="text-[15px] text-muted">{snippetOf(i.message)}</p>}
            </motion.article>
          ))}
        </AnimatePresence>
        {cursor && (
          <Button variant="secondary" loading={loading} onClick={more}>
            Load more
          </Button>
        )}
      </div>
    </div>
  );
}
