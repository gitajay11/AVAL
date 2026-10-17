"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { BookUser, ChevronLeft, Eye, Globe, Lock, Plus, Search, Users } from "lucide-react";
import { useRealtimeEvent } from "@/components/realtime/realtime-provider";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/field";
import { Segmented } from "@/components/ui/segmented";
import { Sheet } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import { api, ClientApiError } from "@/lib/client/api";
import type { MyContactDTO, SharedContactDTO } from "@/lib/contacts/types";
import { PublicContactResults } from "./public-contact-results";
import { FloatingBar } from "@/components/ui/floating-bar";
import { UsernameField, useUsernameField } from "@/components/ui/username-field";

type Tab = "mine" | "shared";

const VISIBILITY = [
  { value: "PRIVATE" as const, label: "Private" },
  { value: "PUBLIC" as const, label: "Public" },
];

function CreateContactSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const [form, setForm] = useState({ name: "", username: "", note: "", visibility: "PRIVATE" as "PRIVATE" | "PUBLIC" });
  const [fields, setFields] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const handle = useUsernameField(form.username);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (handle.blocked && (handle.state.status === "taken" || handle.state.status === "invalid")) {
      setFields({ username: handle.state.reason });
      return;
    }
    setSaving(true);
    setFields({});
    try {
      const { contact } = await api<{ contact: MyContactDTO }>("/api/contacts", { body: { ...form, note: form.note || undefined } });
      toast(`${contact.name} created`);
      onClose();
      router.push(`/contacts/${contact.id}`);
      router.refresh();
    } catch (err) {
      if (err instanceof ClientApiError) {
        setFields(err.fields);
        if (!Object.keys(err.fields).length) toast(err.message, "error");
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title="New personal contact" description="Not a real account: a person you write to, like a journal.">
      <form method="post" onSubmit={create} className="flex flex-col gap-4 pt-2" noValidate>
        <Input label="Name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} error={fields.name} maxLength={64} autoFocus />
        <UsernameField
          value={form.username}
          onChange={(username) => setForm((f) => ({ ...f, username }))}
          error={fields.username}
          hint="Shared with people's usernames, so it's unique. Public contacts can be found by it."
        />
        <Textarea label="Note" optional value={form.note} onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} error={fields.note} maxLength={500} rows={2} />
        <Segmented
          label="Visibility"
          description={form.visibility === "PRIVATE" ? "Only you can see it. It never appears in search." : "Others can find its name and photo, and ask you for view access."}
          value={form.visibility}
          options={VISIBILITY}
          onChange={(v) => setForm((f) => ({ ...f, visibility: v }))}
        />
        <Button type="submit" loading={saving}>
          Create contact
        </Button>
      </form>
    </Sheet>
  );
}

function PublicSearch() {
  const [q, setQ] = useState("");
  return (
    <section aria-labelledby="discover-h" className="mt-6">
      <h2 id="discover-h" className="px-1 text-[13px] font-bold tracking-wide text-muted uppercase">
        Find public contacts
      </h2>
      <label className="relative mt-2 mb-2 block">
        <span className="sr-only">Search public contacts by name</span>
        <Search className="pointer-events-none absolute top-1/2 left-3.5 size-[18px] -translate-y-1/2 text-subtle" aria-hidden="true" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search by name (2+ letters)"
          className="h-11 w-full rounded-2xl glass-input pr-4 pl-10 text-[15px] placeholder:text-subtle"
        />
      </label>
      <div className="-mx-2">
        <PublicContactResults query={q} />
      </div>
    </section>
  );
}

export function ContactsView({ mine, shared: initialShared }: { mine: MyContactDTO[]; shared: SharedContactDTO[] }) {
  const [tab, setTab] = useState<Tab>("mine");
  const [creating, setCreating] = useState(false);
  const [shared, setShared] = useState(initialShared);

  // Access granted or revoked elsewhere: refresh the shared list.
  useRealtimeEvent((e) => {
    if (e.name === "contact.access") {
      api<{ shared: SharedContactDTO[] }>("/api/contacts/shared")
        .then((r) => setShared(r.shared))
        .catch(() => {});
    }
  });

  return (
    <div className="h-full overflow-y-auto">
      <FloatingBar className="px-2 py-2">
        <div className="flex items-center gap-2">
          <Link href="/chats" className="grid size-10 place-items-center rounded-xl hover:bg-surface-3 md:hidden" aria-label="Back to chats">
            <ChevronLeft className="size-6" />
          </Link>
          <h1 className="floating-title flex-1 px-1 text-xl font-extrabold tracking-tight">Contacts</h1>
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus className="size-4" aria-hidden="true" /> New
          </Button>
        </div>
        <div role="tablist" aria-label="Contacts" className="mt-3 grid grid-cols-2 rounded-2xl bg-surface-3 p-1">
          {(["mine", "shared"] as const).map((t) => (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={tab === t}
              onClick={() => setTab(t)}
              className={cn("h-9 rounded-xl text-sm font-semibold transition-colors", tab === t ? "bg-surface text-fg shadow-[var(--shadow-sm)]" : "text-muted hover:text-fg")}
            >
              {t === "mine" ? `My contacts (${mine.length})` : `Shared with me (${shared.length})`}
            </button>
          ))}
        </div>
      </FloatingBar>

      <div className="mx-auto max-w-2xl px-4 py-4 pb-[max(2rem,env(safe-area-inset-bottom))]">
        {tab === "mine" ? (
          mine.length === 0 ? (
            <div className="flex flex-col items-center gap-3 pt-12 text-center">
              <span className="grid size-16 place-items-center rounded-[22px] bg-brand text-white">
                <BookUser className="size-7" aria-hidden="true" />
              </span>
              <p className="text-lg font-bold">Write to someone, privately</p>
              <p className="max-w-xs text-[15px] text-muted">
                A personal contact is a one-way chat, like a journal addressed to a person. Keep it private, or make it public and choose who can read it.
              </p>
              <Button onClick={() => setCreating(true)}>Create a contact</Button>
            </div>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {mine.map((c) => (
                <li key={c.id}>
                  <Link href={`/contacts/${c.id}`} className="glass-1 glass-sheen flex items-center gap-3 rounded-2xl px-2.5 py-2.5 transition-transform active:scale-[0.97]">
                    <Avatar name={c.name} src={c.avatarUrl} size={48} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px] font-semibold">{c.name}</span>
                      <span className="flex items-center gap-1.5 text-[13px] text-muted">
                        {c.visibility === "PUBLIC" ? <Globe className="size-3.5" aria-hidden="true" /> : <Lock className="size-3.5" aria-hidden="true" />}
                        {c.visibility === "PUBLIC" ? "Public" : "Private"}
                        {c.viewers > 0 && (
                          <>
                            {" · "}
                            <Users className="size-3.5" aria-hidden="true" /> {c.viewers}
                          </>
                        )}
                      </span>
                    </span>
                    {c.pendingRequests > 0 && (
                      <span className="rounded-full bg-brand px-2 py-0.5 text-xs font-bold text-white">{c.pendingRequests} request{c.pendingRequests > 1 ? "s" : ""}</span>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          )
        ) : shared.length === 0 ? (
          <p className="px-2 py-10 text-center text-[15px] text-muted">Nothing shared with you yet. Find a public contact below and ask its owner for access.</p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {shared.map((c) => (
              <li key={c.id}>
                <Link href={`/chats/${c.chatId}`} className="glass-1 glass-sheen flex items-center gap-3 rounded-2xl px-2.5 py-2.5 transition-transform active:scale-[0.97]">
                  <Avatar name={c.name} src={c.avatarUrl} size={48} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-semibold">{c.name}</span>
                    <span className="block truncate text-[13px] text-muted">Shared by {c.ownerName}</span>
                  </span>
                  <Eye className="size-[18px] text-subtle" aria-label="View only" />
                </Link>
              </li>
            ))}
          </ul>
        )}

        <PublicSearch />
      </div>
      <CreateContactSheet open={creating} onClose={() => setCreating(false)} />
    </div>
  );
}
