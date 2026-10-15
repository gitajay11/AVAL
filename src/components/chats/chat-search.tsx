"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { ArrowLeft, Search, X } from "lucide-react";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/cn";
import { api } from "@/lib/client/api";
import { ClientTime, formatListTime } from "@/lib/client/time";
import type { SearchHit, SearchPage } from "@/lib/search/types";
import { snippetOf } from "./message-snippet";

/** Wrap search terms in <mark> (plain text only; nothing is parsed as HTML). */
export function Highlight({ text, query }: { text: string; query: string }) {
  const terms = (query.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []).filter(Boolean);
  if (!terms.length) return <>{text}</>;
  const lower = text.toLowerCase();
  const parts: React.ReactNode[] = [];
  let i = 0;
  while (i < text.length) {
    let hit: { at: number; len: number } | null = null;
    for (const t of terms) {
      const at = lower.indexOf(t, i);
      if (at !== -1 && (!hit || at < hit.at)) hit = { at, len: t.length };
    }
    if (!hit) {
      parts.push(text.slice(i));
      break;
    }
    if (hit.at > i) parts.push(text.slice(i, hit.at));
    parts.push(
      <mark key={hit.at} className="rounded bg-accent-soft px-0.5 text-fg">
        {text.slice(hit.at, hit.at + hit.len)}
      </mark>,
    );
    i = hit.at + hit.len;
  }
  return <>{parts}</>;
}

/** Search panel over the conversation. Picking a result jumps to it. */
export function ChatSearch({
  open,
  chatId,
  nameOf,
  onClose,
  onPick,
}: {
  open: boolean;
  chatId: string;
  nameOf: (id: string | null) => string;
  onClose: () => void;
  onPick: (messageId: string) => void;
}) {
  const [q, setQ] = useState("");
  const [result, setResult] = useState<{ q: string; hits: SearchHit[]; olderCursor: string | null } | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const query = q.trim();

  useEffect(() => {
    if (!open || query.length < 2) return;
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      api<SearchPage>(`/api/chats/${chatId}/search?q=${encodeURIComponent(query)}`, { signal: ctrl.signal })
        .then((r) => setResult({ q: query, ...r }))
        .catch(() => {});
    }, 250);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [chatId, open, query]);

  async function more() {
    if (!result?.olderCursor) return;
    setLoadingMore(true);
    try {
      const r = await api<SearchPage>(`/api/chats/${chatId}/search?q=${encodeURIComponent(result.q)}&before=${result.olderCursor}`);
      setResult((cur) => (cur ? { ...cur, hits: [...cur.hits, ...r.hits], olderCursor: r.olderCursor } : cur));
    } finally {
      setLoadingMore(false);
    }
  }

  const current = query.length >= 2 && result?.q === query ? result : null;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="absolute inset-0 z-30 flex flex-col bg-bg/95 backdrop-blur-sm"
          role="dialog"
          aria-label="Search in chat"
          onKeyDown={(e) => e.key === "Escape" && onClose()}
        >
          <div className="glass flex items-center gap-2 border-b border-line px-2 pt-[max(0.5rem,env(safe-area-inset-top))] pb-2 sm:px-4">
            <button type="button" onClick={onClose} className="grid size-10 place-items-center rounded-xl hover:bg-surface-3" aria-label="Close search">
              <ArrowLeft className="size-5" />
            </button>
            <label className="relative flex-1">
              <span className="sr-only">Search messages</span>
              <Search className="pointer-events-none absolute top-1/2 left-3.5 size-[18px] -translate-y-1/2 text-subtle" aria-hidden="true" />
              <input
                autoFocus
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search messages"
                className="h-11 w-full rounded-2xl bg-surface-3 pr-10 pl-10 text-[15px] placeholder:text-subtle focus-visible:ring-4 focus-visible:ring-ring/20 focus-visible:outline-none"
              />
              {q && (
                <button type="button" onClick={() => setQ("")} className="absolute top-1/2 right-2 grid size-7 -translate-y-1/2 place-items-center rounded-full text-subtle hover:bg-surface-2" aria-label="Clear">
                  <X className="size-4" />
                </button>
              )}
            </label>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2 sm:px-4">
            {query.length < 2 ? (
              <p className="px-3 py-6 text-center text-sm text-muted">Type at least 2 characters.</p>
            ) : !current ? (
              <div className="flex justify-center py-6 text-subtle">
                <Spinner className="size-5" />
              </div>
            ) : current.hits.length === 0 ? (
              <p className="px-3 py-6 text-center text-sm text-muted">No messages found.</p>
            ) : (
              <ul className="mx-auto flex max-w-2xl flex-col gap-1">
                <li className="px-3 pb-1 text-xs font-bold tracking-wide text-muted uppercase">
                  {current.hits.length}
                  {current.olderCursor ? "+" : ""} {current.hits.length === 1 && !current.olderCursor ? "result" : "results"}
                </li>
                {current.hits.map((h) => (
                  <li key={h.message.id}>
                    <button
                      type="button"
                      onClick={() => onPick(h.message.id)}
                      className={cn("w-full rounded-2xl px-3 py-2.5 text-left hover:bg-surface-2")}
                    >
                      <span className="flex items-baseline gap-2 text-[13px]">
                        <span className="min-w-0 flex-1 truncate font-semibold">{nameOf(h.message.senderId)}</span>
                        <span className="shrink-0 text-subtle">
                          <ClientTime iso={h.message.createdAt} format={formatListTime} />
                        </span>
                      </span>
                      <span className="line-clamp-2 text-[15px] text-fg">
                        <Highlight text={h.message.text ?? snippetOf(h.message)} query={current.q} />
                      </span>
                    </button>
                  </li>
                ))}
                {current.olderCursor && (
                  <li className="flex justify-center py-2">
                    <button type="button" onClick={more} disabled={loadingMore} className="rounded-xl px-4 py-2 text-sm font-semibold text-accent hover:bg-surface-2">
                      {loadingMore ? "Loading…" : "Show older results"}
                    </button>
                  </li>
                )}
              </ul>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
