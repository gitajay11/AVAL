"use client";

import { IdleLink as Link } from "@/components/ui/idle-link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { ChevronLeft, MessageSquareText, Trash2, UserMinus } from "lucide-react";
import { AvatarPicker } from "@/components/profile/avatar-picker";
import { useNotifications } from "@/components/notifications/notifications-provider";
import { Section } from "@/components/settings/section";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/field";
import { Segmented } from "@/components/ui/segmented";
import { Sheet } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import { api, ClientApiError } from "@/lib/client/api";
import { ClientTime, formatListTime } from "@/lib/client/time";
import type { ContactDetailDTO } from "@/lib/contacts/types";
import { FloatingBar } from "@/components/ui/floating-bar";
import { UsernameField, useUsernameField } from "@/components/ui/username-field";

const VISIBILITY = [
  { value: "PRIVATE" as const, label: "Private" },
  { value: "PUBLIC" as const, label: "Public" },
];

/** Owner's view of a personal contact: profile, visibility, requests and access. */
export function ContactManage({ initial }: { initial: ContactDetailDTO }) {
  const router = useRouter();
  const toast = useToast();
  const [detail, setDetail] = useState(initial);
  const { contact } = detail;
  const [form, setForm] = useState({ name: contact.name, username: contact.username, note: contact.note ?? "" });
  const handle = useUsernameField(form.username, contact.username);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [confirmPrivate, setConfirmPrivate] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const fail = (err: unknown, fallback: string) => toast(err instanceof ClientApiError ? err.message : fallback, "error");

  // New requests arrive as notifications (live, or via the notifications poll):
  // refresh this page's lists whenever a newer one for this contact shows up.
  const { notifications } = useNotifications();
  const latestForContact = notifications?.find((n) => n.payload.contactId === contact.id)?.id ?? null;
  const seenLatest = useRef(latestForContact);
  useEffect(() => {
    if (!latestForContact || latestForContact === seenLatest.current) return;
    seenLatest.current = latestForContact;
    api<ContactDetailDTO>(`/api/contacts/${contact.id}`).then(setDetail).catch(() => {});
  }, [latestForContact, contact.id]);

  async function patch(body: Record<string, unknown>, done?: string) {
    const r = await api<ContactDetailDTO>(`/api/contacts/${contact.id}`, { method: "PATCH", body });
    setDetail(r);
    if (done) toast(done);
    router.refresh(); // chat list title/avatar
    return r;
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (handle.blocked && (handle.state.status === "taken" || handle.state.status === "invalid")) {
      setFields({ username: handle.state.reason });
      return;
    }
    setSaving(true);
    setFields({});
    try {
      await patch(
        { name: form.name, note: form.note || null, ...(handle.unchanged ? {} : { username: form.username }) },
        "Saved",
      );
    } catch (err) {
      if (err instanceof ClientApiError) setFields(err.fields);
      fail(err, "Couldn't save.");
    } finally {
      setSaving(false);
    }
  }

  async function setVisibility(v: "PRIVATE" | "PUBLIC") {
    if (v === contact.visibility) return;
    if (v === "PRIVATE" && (detail.grants.length > 0 || detail.requests.length > 0)) {
      setConfirmPrivate(true);
      return;
    }
    try {
      await patch({ visibility: v }, v === "PUBLIC" ? "Now public: people can find it and ask to view" : "Now private");
    } catch (err) {
      fail(err, "Couldn't change visibility.");
    }
  }

  async function decide(requestId: string, decision: "approve" | "decline") {
    setBusy(requestId);
    try {
      setDetail(await api<ContactDetailDTO>(`/api/contacts/${contact.id}/requests/${requestId}`, { body: { decision } }));
      toast(decision === "approve" ? "Access granted" : "Request declined");
    } catch (err) {
      fail(err, "Couldn't update the request.");
    } finally {
      setBusy(null);
    }
  }

  async function revoke(userId: string, name: string) {
    setBusy(userId);
    try {
      setDetail(await api<ContactDetailDTO>(`/api/contacts/${contact.id}/access/${userId}`, { method: "DELETE" }));
      toast(`${name} can no longer view it`);
    } catch (err) {
      fail(err, "Couldn't revoke access.");
    } finally {
      setBusy(null);
    }
  }

  async function remove() {
    setBusy("delete");
    try {
      await api(`/api/contacts/${contact.id}`, { method: "DELETE" });
      toast(`${contact.name} deleted`);
      router.replace("/contacts");
      router.refresh();
    } catch (err) {
      fail(err, "Couldn't delete.");
      setBusy(null);
    }
  }

  const dirty = form.name !== contact.name || form.note !== (contact.note ?? "") || !handle.unchanged;

  return (
    <div className="h-full overflow-y-auto">
      <FloatingBar className="flex items-center gap-2 px-2 py-2">
        <Link href="/contacts" className="grid size-10 place-items-center rounded-xl hover:bg-surface-3" aria-label="Back to contacts">
          <ChevronLeft className="size-6" />
        </Link>
        <h1 className="floating-title min-w-0 flex-1 truncate px-1 text-xl font-extrabold tracking-tight">{contact.name}</h1>
        <Link href={`/chats/${contact.chatId}`} className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-brand px-3.5 text-sm font-semibold text-white">
          <MessageSquareText className="size-4" aria-hidden="true" /> Open chat
        </Link>
      </FloatingBar>

      <div className="mx-auto flex max-w-2xl flex-col gap-7 px-4 py-6 pb-[max(2rem,env(safe-area-inset-bottom))]">
        <Section id="contact-profile" title="Contact">
          <form method="post" onSubmit={save} className="flex flex-col gap-4 py-4" noValidate>
            <AvatarPicker
              name={contact.name}
              avatarUrl={contact.avatarUrl}
              contactId={contact.id}
              size={96}
              onChange={(c) => {
                setDetail((d) => ({ ...d, contact: c }));
                router.refresh();
              }}
            />
            <Input label="Name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} error={fields.name} maxLength={64} />
            <UsernameField value={form.username} current={contact.username} onChange={(username) => setForm((f) => ({ ...f, username }))} error={fields.username} />
            <Textarea label="Note" optional value={form.note} onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} error={fields.note} maxLength={500} rows={3} hint="Only you can see the note." />
            <div className="flex justify-end">
              <Button type="submit" loading={saving} disabled={!dirty}>
                Save changes
              </Button>
            </div>
          </form>
        </Section>

        <Section id="visibility" title="Visibility">
          <Segmented
            label="Who can find this contact"
            description={
              contact.visibility === "PRIVATE"
                ? "Private: only you can see it. It never appears in search or anywhere else."
                : "Public: anyone can find its name and photo and ask to view. Only people you approve can read the chat, and they can't reply, react, forward or download."
            }
            value={contact.visibility}
            options={VISIBILITY}
            onChange={setVisibility}
          />
        </Section>

        {contact.visibility === "PUBLIC" && (
          <Section id="requests" title={`Requests (${detail.requests.length})`}>
            {detail.requests.length === 0 ? (
              <p className="py-3 text-[15px] text-muted">No pending requests.</p>
            ) : (
              <ul className="divide-y divide-line">
                <AnimatePresence initial={false}>
                  {detail.requests.map((r) => (
                    <motion.li key={r.id} layout exit={{ opacity: 0, height: 0 }} className="flex flex-col gap-2 py-3">
                      <div className="flex items-center gap-3">
                        <Avatar name={r.requester.displayName} src={r.requester.avatarUrl} size={40} />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[15px] font-medium">{r.requester.displayName}</p>
                          <p className="truncate text-[13px] text-muted">
                            @{r.requester.username} · <ClientTime iso={r.createdAt} format={formatListTime} />
                          </p>
                        </div>
                      </div>
                      {r.note && <p className="rounded-xl bg-surface-2 px-3 py-2 text-sm italic">“{r.note}”</p>}
                      <div className="flex gap-2">
                        <Button size="sm" loading={busy === r.id} onClick={() => decide(r.id, "approve")}>
                          Approve
                        </Button>
                        <Button size="sm" variant="secondary" disabled={busy === r.id} onClick={() => decide(r.id, "decline")}>
                          Decline
                        </Button>
                      </div>
                    </motion.li>
                  ))}
                </AnimatePresence>
              </ul>
            )}
          </Section>
        )}

        <Section id="access" title={`People with access (${detail.grants.length})`} description="They can read the chat (view only).">
          {detail.grants.length === 0 ? (
            <p className="py-3 text-[15px] text-muted">{contact.visibility === "PUBLIC" ? "No one yet." : "Private contacts can't be shared."}</p>
          ) : (
            <ul className="divide-y divide-line">
              {detail.grants.map((g) => (
                <li key={g.user.id} className="flex items-center gap-3 py-2.5">
                  <Avatar name={g.user.displayName} src={g.user.avatarUrl} size={40} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[15px] font-medium">{g.user.displayName}</p>
                    <p className="truncate text-[13px] text-muted">
                      @{g.user.username} · since <ClientTime iso={g.grantedAt} format={formatListTime} />
                    </p>
                  </div>
                  <Button size="sm" variant="secondary" loading={busy === g.user.id} onClick={() => revoke(g.user.id, g.user.displayName)}>
                    <UserMinus className="size-4" aria-hidden="true" /> Revoke
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section id="danger" title="Delete" className="py-4">
          <Button variant="danger" className="w-full" onClick={() => setConfirmDelete(true)}>
            <Trash2 className="size-[18px]" aria-hidden="true" /> Delete contact and chat
          </Button>
        </Section>
      </div>

      <Sheet
        open={confirmPrivate}
        onClose={() => setConfirmPrivate(false)}
        variant="dialog"
        title="Make it private?"
        description={`This immediately removes access for ${detail.grants.length} ${detail.grants.length === 1 ? "person" : "people"} and cancels ${detail.requests.length} pending ${detail.requests.length === 1 ? "request" : "requests"}. If you make it public again, they'll need to ask again.`}
      >
        <div className="mt-2 flex flex-col gap-2">
          <Button
            variant="danger"
            onClick={async () => {
              setConfirmPrivate(false);
              try {
                await patch({ visibility: "PRIVATE" }, "Now private: all access removed");
              } catch (err) {
                fail(err, "Couldn't change visibility.");
              }
            }}
          >
            Make private
          </Button>
          <Button variant="ghost" onClick={() => setConfirmPrivate(false)}>
            Cancel
          </Button>
        </div>
      </Sheet>

      <Sheet
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        variant="dialog"
        title={`Delete ${contact.name}?`}
        description="The contact, every message and all media in its chat are deleted permanently. Anyone with access loses it."
      >
        <div className="mt-2 flex flex-col gap-2">
          <Button variant="danger" loading={busy === "delete"} onClick={remove}>
            Delete permanently
          </Button>
          <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
            Cancel
          </Button>
        </div>
      </Sheet>
    </div>
  );
}
