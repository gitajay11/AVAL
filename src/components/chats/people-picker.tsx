"use client";

import { useEffect, useState } from "react";
import { Check, Search, X } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { cn } from "@/lib/cn";
import { api } from "@/lib/client/api";
import type { UserSearchResultDTO } from "@/lib/chats/types";

export type PickedPerson = Pick<UserSearchResultDTO, "id" | "username" | "displayName" | "avatarUrl">;

/** Search people by @username and pick several (chips above the list). */
export function PeoplePicker({
  picked,
  onChange,
  exclude = [],
}: {
  picked: PickedPerson[];
  onChange: (p: PickedPerson[]) => void;
  exclude?: string[];
}) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<{ q: string; items: UserSearchResultDTO[] } | null>(null);
  const query = q.trim().replace(/^@/, "").toLowerCase();
  const valid = /^[a-z0-9_.]{1,20}$/.test(query);

  useEffect(() => {
    if (!valid) return;
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      api<{ results: UserSearchResultDTO[] }>(`/api/users/search?q=${encodeURIComponent(query)}`, { signal: ctrl.signal })
        .then((r) => setResults({ q: query, items: r.results }))
        .catch(() => {});
    }, 250);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [query, valid]);

  const toggle = (p: PickedPerson) =>
    onChange(picked.some((x) => x.id === p.id) ? picked.filter((x) => x.id !== p.id) : [...picked, p]);
  const items = valid && results?.q === query ? results.items.filter((r) => !exclude.includes(r.id)) : [];

  return (
    <div className="flex flex-col gap-2">
      {picked.length > 0 && (
        <ul className="flex flex-wrap gap-1.5" aria-label="Selected">
          {picked.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => toggle(p)}
                className="inline-flex items-center gap-1.5 rounded-full bg-accent-soft py-1 pr-2 pl-1 text-sm font-medium text-fg"
                aria-label={`Remove ${p.displayName}`}
              >
                <Avatar name={p.displayName} src={p.avatarUrl} size={22} />
                {p.displayName}
                <X className="size-3.5" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <label className="relative block">
        <span className="sr-only">Search people</span>
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-subtle" aria-hidden="true" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search @username"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          className="h-10 w-full rounded-xl bg-surface-3 pr-3 pl-9 text-[15px] placeholder:text-subtle focus-visible:ring-4 focus-visible:ring-ring/20 focus-visible:outline-none"
        />
      </label>
      <ul className="-mx-2 flex max-h-[32dvh] flex-col overflow-y-auto">
        {items.map((r) => {
          const on = picked.some((p) => p.id === r.id);
          return (
            <li key={r.id}>
              <button
                type="button"
                role="checkbox"
                aria-checked={on}
                onClick={() => toggle(r)}
                className="flex w-full items-center gap-3 rounded-2xl px-2 py-2 text-left hover:bg-surface-2"
              >
                <Avatar name={r.displayName} src={r.avatarUrl} size={40} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-semibold">{r.displayName}</span>
                  <span className="block truncate text-[13px] text-muted">@{r.username}</span>
                </span>
                <span className={cn("grid size-6 place-items-center rounded-full border-2", on ? "border-transparent bg-brand text-white" : "border-line-strong")}>
                  {on && <Check className="size-4" strokeWidth={3} />}
                </span>
              </button>
            </li>
          );
        })}
        {valid && results?.q === query && items.length === 0 && <li className="px-2 py-3 text-sm text-muted">No one found.</li>}
      </ul>
    </div>
  );
}
