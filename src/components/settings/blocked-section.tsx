"use client";

import { useEffect, useState } from "react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { api } from "@/lib/client/api";
import { Section } from "./section";

type Blocked = { id: string; username: string; displayName: string; avatarUrl: string | null };

/** People I've blocked, with Unblock. */
export function BlockedSection() {
  const toast = useToast();
  const [list, setList] = useState<Blocked[] | null>(null);

  useEffect(() => {
    api<{ blocked: Blocked[] }>("/api/me/blocks")
      .then((r) => setList(r.blocked))
      .catch(() => setList([]));
  }, []);

  async function unblock(u: Blocked) {
    setList((l) => l?.filter((x) => x.id !== u.id) ?? null);
    try {
      await api(`/api/users/${u.id}/block`, { method: "DELETE" });
      toast(`${u.displayName} unblocked`);
    } catch {
      setList((l) => (l ? [u, ...l] : l));
      toast("Couldn't unblock.", "error");
    }
  }

  return (
    <Section id="blocked" title="Blocked" description="Blocked people can't message you, react, or see your status and photo.">
      {list === null ? (
        <Skeleton className="my-3 h-12" />
      ) : list.length === 0 ? (
        <p className="py-3 text-[15px] text-muted">You haven&apos;t blocked anyone.</p>
      ) : (
        <ul className="divide-y divide-line">
          {list.map((u) => (
            <li key={u.id} className="flex items-center gap-3 py-2.5">
              <Avatar name={u.displayName} src={u.avatarUrl} size={40} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[15px] font-medium">{u.displayName}</p>
                <p className="truncate text-[13px] text-muted">@{u.username}</p>
              </div>
              <Button variant="secondary" size="sm" onClick={() => unblock(u)}>
                Unblock
              </Button>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}
