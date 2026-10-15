"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { MessageCirclePlus } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { useToast } from "@/components/ui/toast";
import { api, ClientApiError } from "@/lib/client/api";
import type { UserSearchResultDTO } from "@/lib/chats/types";

type Result = { query: string; results: UserSearchResultDTO[] };

/** People matching the search box (username exact + prefix), debounced. */
export function PeopleResults({ query, onOpened }: { query: string; onOpened: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const q = query.trim().replace(/^@/, "").toLowerCase();
  const valid = /^[a-z0-9_.]{1,20}$/.test(q);
  const [result, setResult] = useState<Result | null>(null);
  const [opening, setOpening] = useState<string | null>(null);

  useEffect(() => {
    if (!valid) return;
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      api<{ results: UserSearchResultDTO[] }>(`/api/users/search?q=${encodeURIComponent(q)}`, { signal: ctrl.signal })
        .then((r) => setResult({ query: q, results: r.results }))
        .catch(() => {});
    }, 250);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [q, valid]);

  async function open(person: UserSearchResultDTO) {
    if (person.existingChatId) {
      onOpened();
      router.push(`/chats/${person.existingChatId}`);
      return;
    }
    setOpening(person.id);
    try {
      const { chatId } = await api<{ chatId: string }>("/api/chats", { body: { userId: person.id } });
      onOpened();
      router.push(`/chats/${chatId}`);
    } catch (err) {
      toast(err instanceof ClientApiError ? err.message : "Couldn't start the chat.", "error");
    } finally {
      setOpening(null);
    }
  }

  if (!valid) {
    return <p className="px-5 py-3 text-sm text-muted">Usernames use letters, numbers, _ and .</p>;
  }
  const current = result?.query === q ? result.results : null;

  return (
    <section aria-label="People">
      <h3 className="px-5 pt-3 pb-1.5 text-xs font-bold tracking-wide text-muted uppercase">People</h3>
      {current === null ? (
        <div className="flex flex-col gap-2 px-4 py-1" aria-busy="true">
          {[0, 1].map((i) => (
            <div key={i} className="flex items-center gap-3">
              <Skeleton className="size-11 rounded-full" />
              <Skeleton className="h-4 w-32" />
            </div>
          ))}
        </div>
      ) : current.length === 0 ? (
        <p className="px-5 py-2 text-sm text-muted">
          No one found for <strong className="text-fg">@{q}</strong>
          {q.length === 1 ? ". Type at least 2 characters to search by prefix." : "."}
        </p>
      ) : (
        <ul>
          {current.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => open(p)}
                disabled={opening !== null}
                className="mx-2 flex w-[calc(100%-1rem)] items-center gap-3 rounded-2xl px-2.5 py-2 text-left hover:bg-surface-2 disabled:opacity-60"
              >
                <Avatar name={p.displayName} src={p.avatarUrl} size={44} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-semibold">{p.displayName}</span>
                  <span className="block truncate text-sm text-muted">@{p.username}</span>
                </span>
                {opening === p.id ? (
                  <Spinner className="size-5 text-accent" />
                ) : (
                  <MessageCirclePlus className="size-5 text-subtle" aria-hidden="true" />
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
