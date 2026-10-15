"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Avatar } from "@/components/ui/avatar";
import { Spinner } from "@/components/ui/spinner";
import { api } from "@/lib/client/api";
import { ClientTime, formatListTime } from "@/lib/client/time";
import type { SearchHit, SearchPage } from "@/lib/search/types";
import { Highlight } from "./chat-search";
import { snippetOf } from "./message-snippet";

/** Messages matching the sidebar search across all my chats (2+ characters). */
export function MessageResults({ query, meId, onOpened }: { query: string; meId: string; onOpened: () => void }) {
  const q = query.trim();
  const [result, setResult] = useState<{ q: string; hits: SearchHit[]; olderCursor: string | null } | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    if (q.length < 2) return;
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      api<SearchPage>(`/api/search?q=${encodeURIComponent(q)}`, { signal: ctrl.signal })
        .then((r) => setResult({ q, ...r }))
        .catch(() => {});
    }, 300);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [q]);

  async function more() {
    if (!result?.olderCursor) return;
    setLoadingMore(true);
    try {
      const r = await api<SearchPage>(`/api/search?q=${encodeURIComponent(result.q)}&before=${result.olderCursor}`);
      setResult((cur) => (cur ? { ...cur, hits: [...cur.hits, ...r.hits], olderCursor: r.olderCursor } : cur));
    } finally {
      setLoadingMore(false);
    }
  }

  if (q.length < 2) return null;
  const current = result?.q === q ? result : null;

  return (
    <section aria-label="Messages">
      <h3 className="px-5 pt-3 pb-1.5 text-xs font-bold tracking-wide text-muted uppercase">Messages</h3>
      {!current ? (
        <div className="flex justify-center py-3 text-subtle">
          <Spinner className="size-5" />
        </div>
      ) : current.hits.length === 0 ? (
        <p className="px-5 py-2 text-sm text-muted">No messages found.</p>
      ) : (
        <ul className="flex flex-col gap-0.5 pb-2">
          {current.hits.map((h) => (
            <li key={h.message.id} className="mx-2">
              <Link href={`/chats/${h.chat.id}?m=${h.message.id}`} onClick={onOpened} className="flex items-center gap-3 rounded-2xl px-2.5 py-2 hover:bg-surface-2">
                <Avatar name={h.chat.title} src={h.chat.avatarUrl} size={44} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline gap-2">
                    <span className="min-w-0 flex-1 truncate text-[15px] font-semibold">{h.chat.title}</span>
                    <span className="shrink-0 text-xs text-subtle">
                      <ClientTime iso={h.message.createdAt} format={formatListTime} />
                    </span>
                  </span>
                  <span className="line-clamp-2 text-sm text-muted">
                    {h.message.senderId === meId ? (
                      <span className="text-fg/80">You: </span>
                    ) : h.chat.type === "GROUP" && h.senderName ? (
                      <span className="text-fg/80">{h.senderName}: </span>
                    ) : null}
                    <Highlight text={h.message.text ?? snippetOf(h.message)} query={current.q} />
                  </span>
                </span>
              </Link>
            </li>
          ))}
          {current.olderCursor && (
            <li className="flex justify-center py-1">
              <button type="button" onClick={more} disabled={loadingMore} className="rounded-xl px-4 py-2 text-sm font-semibold text-accent hover:bg-surface-2">
                {loadingMore ? "Loading…" : "Show older messages"}
              </button>
            </li>
          )}
        </ul>
      )}
    </section>
  );
}
