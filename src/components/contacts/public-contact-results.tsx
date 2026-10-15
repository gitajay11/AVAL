"use client";

import { useEffect, useState } from "react";
import { Avatar } from "@/components/ui/avatar";
import { api } from "@/lib/client/api";
import type { PublicContactDTO } from "@/lib/contacts/types";
import { PublicContactSheet } from "./public-contact-sheet";

/** Public contacts matching `query` (2+ chars, name prefix). Tap one to request access. */
export function PublicContactResults({ query, heading }: { query: string; heading?: string }) {
  const q = query.trim().replace(/^@/, "").toLowerCase();
  const [results, setResults] = useState<{ q: string; items: PublicContactDTO[] } | null>(null);
  const [open, setOpen] = useState<PublicContactDTO | null>(null);

  useEffect(() => {
    if (q.length < 2) return;
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      api<{ results: PublicContactDTO[] }>(`/api/contacts/search?q=${encodeURIComponent(q)}`, { signal: ctrl.signal })
        .then((r) => setResults({ q, items: r.results }))
        .catch(() => {});
    }, 250);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [q]);

  const items = q.length >= 2 && results?.q === q ? results.items : null;
  if (!items || (heading && items.length === 0)) return null;

  return (
    <section aria-label="Public contacts">
      {heading && <h3 className="px-5 pt-3 pb-1.5 text-xs font-bold tracking-wide text-muted uppercase">{heading}</h3>}
      <ul className="flex flex-col gap-0.5">
        {items.length === 0 && <li className="px-2 py-3 text-sm text-muted">No public contacts match.</li>}
        {items.map((c) => (
          <li key={c.id}>
            <button
              type="button"
              onClick={() => setOpen(c)}
              className="mx-2 flex w-[calc(100%-1rem)] items-center gap-3 rounded-2xl px-2.5 py-2 text-left hover:bg-surface-2"
            >
              <Avatar name={c.name} src={c.avatarUrl} size={44} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px] font-semibold">{c.name}</span>
                <span className="block truncate text-[13px] text-muted">
                  {c.request === "approved" ? "Shared with you" : c.request === "pending" ? "Request sent" : "Public contact"}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>
      <PublicContactSheet
        contact={open}
        onClose={() => setOpen(null)}
        onChange={(c) => {
          setOpen(c);
          setResults((r) => (r ? { ...r, items: r.items.map((x) => (x.id === c.id ? c : x)) } : r));
        }}
      />
    </section>
  );
}
