"use client";

import { useEffect, useState } from "react";
import { Ban, BellOff, Bell, Check, Flag, Pencil, RotateCcw, Search } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { ViewableAvatar } from "@/components/ui/avatar-viewer";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/field";
import { Sheet } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { useRealtimeEvent } from "@/components/realtime/realtime-provider";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import { api, ClientApiError } from "@/lib/client/api";
import type { ChatListItemDTO, MessageDTO, UserProfileDTO } from "@/lib/chats/types";
import { MAX_FORWARD_TARGETS, REPORT_REASONS } from "@/lib/validation/limits";
import { useChats } from "./chat-store";

const errorText = (err: unknown, fallback: string) => (err instanceof ClientApiError ? err.message : fallback);

/** Pick up to 10 chats to forward a message to. */
export function ForwardSheet({ message, onClose }: { message: MessageDTO | null; onClose: () => void }) {
  const { chats } = useChats();
  const toast = useToast();
  const [picked, setPicked] = useState<string[]>([]);
  const [q, setQ] = useState("");
  const [sending, setSending] = useState(false);
  const list = chats.filter((c) => c.title.toLowerCase().includes(q.trim().toLowerCase()));

  function toggle(id: string) {
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length >= MAX_FORWARD_TARGETS ? p : [...p, id]));
  }

  async function send() {
    if (!message) return;
    setSending(true);
    try {
      await api(`/api/messages/${message.id}/forward`, { body: { chatIds: picked } });
      toast(picked.length === 1 ? "Forwarded" : `Forwarded to ${picked.length} chats`);
      setPicked([]);
      onClose();
    } catch (err) {
      toast(errorText(err, "Couldn't forward."), "error");
    } finally {
      setSending(false);
    }
  }

  return (
    <Sheet open={message !== null} onClose={onClose} title="Forward to…" description={`Choose up to ${MAX_FORWARD_TARGETS} chats.`}>
      <label className="relative mb-2 block">
        <span className="sr-only">Search chats</span>
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-subtle" aria-hidden="true" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search"
          className="h-10 w-full rounded-xl bg-surface-3 pr-3 pl-9 text-[15px] placeholder:text-subtle focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring/20"
        />
      </label>
      <ul className="-mx-2 flex max-h-[45dvh] flex-col overflow-y-auto">
        {list.map((c: ChatListItemDTO) => {
          const on = picked.includes(c.id);
          return (
            <li key={c.id}>
              <button
                type="button"
                role="checkbox"
                aria-checked={on}
                onClick={() => toggle(c.id)}
                className="flex w-full items-center gap-3 rounded-2xl px-2 py-2 text-left hover:bg-surface-2"
              >
                <Avatar name={c.title} src={c.avatarUrl} size={40} />
                <span className="min-w-0 flex-1 truncate text-[15px] font-semibold">{c.title}</span>
                <span className={cn("grid size-6 place-items-center rounded-full border-2", on ? "border-transparent bg-brand text-white" : "border-line-strong")}>
                  {on && <Check className="size-4" strokeWidth={3} />}
                </span>
              </button>
            </li>
          );
        })}
        {list.length === 0 && <li className="px-2 py-4 text-sm text-muted">No chats match.</li>}
      </ul>
      <Button className="mt-3 w-full" disabled={picked.length === 0} loading={sending} onClick={send}>
        Forward{picked.length > 1 ? ` to ${picked.length} chats` : ""}
      </Button>
    </Sheet>
  );
}

/** Delete for me, or (my own messages) for everyone. */
export function DeleteDialog({
  message,
  mine,
  onClose,
  onDeleted,
}: {
  message: MessageDTO | null;
  mine: boolean;
  onClose: () => void;
  onDeleted: (messageId: string, forEveryone: boolean) => void;
}) {
  const toast = useToast();
  const [busy, setBusy] = useState<"me" | "all" | null>(null);

  async function run(forEveryone: boolean) {
    if (!message) return;
    setBusy(forEveryone ? "all" : "me");
    try {
      if (forEveryone) await api(`/api/messages/${message.id}`, { method: "DELETE" });
      else await api(`/api/messages/${message.id}/hide`, { method: "POST" });
      onDeleted(message.id, forEveryone);
      onClose();
    } catch (err) {
      toast(errorText(err, "Couldn't delete."), "error");
    } finally {
      setBusy(null);
    }
  }

  return (
    <Sheet
      open={message !== null}
      onClose={onClose}
      variant="dialog"
      title="Delete message?"
      description={mine ? "Delete it for everyone, or just remove it from your view." : "This removes it from your view only."}
    >
      <div className="mt-2 flex flex-col gap-2">
        {mine && (
          <Button variant="danger" loading={busy === "all"} disabled={busy !== null} onClick={() => run(true)}>
            Delete for everyone
          </Button>
        )}
        <Button variant={mine ? "secondary" : "danger"} loading={busy === "me"} disabled={busy !== null} onClick={() => run(false)}>
          Delete for me
        </Button>
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
      </div>
    </Sheet>
  );
}

const REASON_LABELS: Record<(typeof REPORT_REASONS)[number], string> = {
  SPAM: "Spam or scam",
  HARASSMENT: "Harassment or bullying",
  IMPERSONATION: "Pretending to be someone",
  INAPPROPRIATE: "Inappropriate content",
  OTHER: "Something else",
};

export type ReportTarget = { userId?: string; messageId?: string; contactId?: string; label: string } | null;

export function ReportSheet({ target, onClose }: { target: ReportTarget; onClose: () => void }) {
  const toast = useToast();
  const [reason, setReason] = useState<(typeof REPORT_REASONS)[number]>("SPAM");
  const [details, setDetails] = useState("");
  const [sending, setSending] = useState(false);

  async function submit() {
    if (!target) return;
    setSending(true);
    try {
      await api("/api/reports", {
        body: {
          targetUserId: target.userId,
          targetMessageId: target.messageId,
          targetContactId: target.contactId,
          reason,
          details: details || undefined,
        },
      });
      toast("Thanks. We'll review your report.");
      setDetails("");
      onClose();
    } catch (err) {
      toast(errorText(err, "Couldn't send the report."), "error");
    } finally {
      setSending(false);
    }
  }

  return (
    <Sheet open={target !== null} onClose={onClose} title={`Report ${target?.label ?? ""}`} description="Reports are confidential.">
      <fieldset className="mt-1 flex flex-col gap-1">
        <legend className="sr-only">Reason</legend>
        {REPORT_REASONS.map((r) => (
          <label key={r} className="flex cursor-pointer items-center gap-3 rounded-xl px-2 py-2.5 hover:bg-surface-2">
            <input type="radio" name="reason" value={r} checked={reason === r} onChange={() => setReason(r)} className="size-4 accent-[var(--accent)]" />
            <span className="text-[15px]">{REASON_LABELS[r]}</span>
          </label>
        ))}
      </fieldset>
      <div className="mt-3">
        <Textarea label="Details" optional value={details} onChange={(e) => setDetails(e.target.value)} maxLength={1000} rows={3} />
      </div>
      <Button className="mt-4 w-full" variant="danger" loading={sending} onClick={submit}>
        <Flag className="size-4" aria-hidden="true" /> Send report
      </Button>
    </Sheet>
  );
}

/** The other person's profile, with mute / block / report. */
export function ProfileSheet({
  open,
  onClose,
  chat,
  onReport,
  onBlockChanged,
}: {
  open: boolean;
  onClose: () => void;
  chat: ChatListItemDTO;
  onReport: () => void;
  onBlockChanged: () => void;
}) {
  const toast = useToast();
  const { updateSettings, refetchChat } = useChats();
  const [profile, setProfile] = useState<UserProfileDTO | null>(null);
  const [busy, setBusy] = useState(false);
  const [editingAlias, setEditingAlias] = useState<string | null>(null);
  const peerId = chat.peer?.id;

  /** Save (or with null, reset) my private nickname, then refresh the chat's title everywhere. */
  async function saveAlias(alias: string | null) {
    if (!peerId) return;
    setBusy(true);
    try {
      const r = await api<{ alias: string | null }>(`/api/users/${peerId}/alias`, { method: "PUT", body: { alias } });
      setProfile((p) => (p ? { ...p, alias: r.alias } : p));
      setEditingAlias(null);
      refetchChat(chat.id);
      toast(r.alias ? "Nickname saved" : "Nickname removed");
    } catch (err) {
      toast(err instanceof ClientApiError ? err.message : "Couldn't save the nickname.", "error");
    } finally {
      setBusy(false);
    }
  }

  // Re-read when they change their photo or name while this is open.
  const [revision, setRevision] = useState(0);
  useRealtimeEvent((e) => {
    if (e.name === "user.updated" && e.data.userId === peerId && open) setRevision((r) => r + 1);
  });
  useEffect(() => {
    if (!open || !peerId) return;
    let cancelled = false;
    api<{ profile: UserProfileDTO }>(`/api/users/${peerId}`)
      .then((r) => !cancelled && setProfile(r.profile))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [open, peerId, revision]);

  async function toggleBlock() {
    if (!profile) return;
    const block = !profile.blockedByMe;
    if (block && !confirm(`Block ${profile.displayName}? They won't be able to message you or see your status and photo.`)) return;
    setBusy(true);
    try {
      await api(`/api/users/${profile.id}/block`, { method: block ? "POST" : "DELETE" });
      setProfile({ ...profile, blockedByMe: block });
      toast(block ? `${profile.displayName} blocked` : `${profile.displayName} unblocked`);
      onBlockChanged();
    } catch (err) {
      toast(errorText(err, "Couldn't update block."), "error");
    } finally {
      setBusy(false);
    }
  }

  const p = profile && profile.id === peerId ? profile : null;
  return (
    <Sheet open={open} onClose={onClose} title="Profile">
      <div className="flex flex-col items-center gap-2 pt-1 pb-4 text-center">
        <ViewableAvatar name={chat.title} src={p?.avatarUrl ?? chat.avatarUrl} username={chat.peer?.username} size={96} />
        <p className="mt-1 text-xl font-bold">{p ? (p.alias ?? p.displayName) : chat.title}</p>
        {p?.alias ? (
          <p className="text-[14px] text-muted">
            Original name: {p.displayName} · @{p.username}
          </p>
        ) : (
          <p className="text-[15px] text-muted">@{chat.peer?.username}</p>
        )}
        {p &&
          (editingAlias !== null ? (
            <form
              className="mt-2 flex w-full max-w-xs items-end gap-2 text-left"
              onSubmit={(e) => {
                e.preventDefault();
                saveAlias(editingAlias.trim() || null);
              }}
            >
              <div className="min-w-0 flex-1">
                <Input
                  label="Nickname"
                  value={editingAlias}
                  onChange={(e) => setEditingAlias(e.target.value)}
                  maxLength={64}
                  placeholder={p.displayName}
                  hint="Only you see it."
                  autoFocus
                />
              </div>
              <Button type="submit" size="sm" loading={busy} className="mb-6">
                Save
              </Button>
            </form>
          ) : (
            <div className="mt-1 flex gap-2">
              <button
                type="button"
                onClick={() => setEditingAlias(p.alias ?? "")}
                className="glass-1 inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-semibold"
              >
                <Pencil className="size-3.5" aria-hidden="true" /> {p.alias ? "Edit nickname" : "Set nickname"}
              </button>
              {p.alias && (
                <button
                  type="button"
                  onClick={() => saveAlias(null)}
                  disabled={busy}
                  className="glass-1 inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-semibold text-muted"
                >
                  <RotateCcw className="size-3.5" aria-hidden="true" /> Reset
                </button>
              )}
            </div>
          ))}
        {p ? p.bio && <p className="max-w-xs text-[15px] whitespace-pre-wrap">{p.bio}</p> : <Skeleton className="h-4 w-40" />}
      </div>
      <div className="flex flex-col gap-2">
        <Button variant="secondary" onClick={() => updateSettings(chat.id, { mute: chat.muted ? "off" : "forever" })}>
          {chat.muted ? <Bell className="size-[18px]" /> : <BellOff className="size-[18px]" />}
          {chat.muted ? "Unmute" : "Mute notifications"}
        </Button>
        <Button variant="secondary" loading={busy} disabled={!p} onClick={toggleBlock}>
          <Ban className="size-[18px]" /> {p?.blockedByMe ? "Unblock" : "Block"}
        </Button>
        <Button
          variant="danger"
          onClick={() => {
            onClose();
            onReport();
          }}
        >
          <Flag className="size-[18px]" /> Report
        </Button>
      </div>
    </Sheet>
  );
}
