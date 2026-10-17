"use client";

import { IdleLink as Link } from "@/components/ui/idle-link";
import { useState } from "react";
import { Clock3, Eye, Flag, Lock } from "lucide-react";
import { ReportSheet, type ReportTarget } from "@/components/chats/dialogs";
import { ViewableAvatar } from "@/components/ui/avatar-viewer";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/field";
import { Sheet } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import { api, ClientApiError } from "@/lib/client/api";
import type { PublicContactDTO } from "@/lib/contacts/types";

/**
 * Someone else's public contact: name and photo only, plus my request state.
 * Request (with an optional note), cancel, re-request after a decline, or open once approved.
 */
export function PublicContactSheet({
  contact,
  onClose,
  onChange,
}: {
  contact: PublicContactDTO | null;
  onClose: () => void;
  onChange: (c: PublicContactDTO) => void;
}) {
  const toast = useToast();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [reporting, setReporting] = useState<ReportTarget>(null);

  async function run(method: "POST" | "DELETE") {
    if (!contact) return;
    setBusy(true);
    try {
      const r = await api<{ contact: PublicContactDTO }>(`/api/contacts/${contact.id}/request`, {
        method,
        ...(method === "POST" ? { body: { note: note || undefined } } : {}),
      });
      onChange(r.contact);
      setNote("");
      toast(method === "POST" ? "Request sent" : "Request withdrawn");
    } catch (err) {
      toast(err instanceof ClientApiError ? err.message : "Something went wrong.", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Sheet open={contact !== null} onClose={onClose} title="Public contact">
        {contact && (
          <div className="flex flex-col items-center gap-2 pt-1 text-center">
            <ViewableAvatar name={contact.name} src={contact.avatarUrl} size={88} />
            <p className="mt-1 text-xl font-bold">{contact.name}</p>
            <p className="text-[15px] text-muted">@{contact.username}</p>
            <p className="glass-flat rounded-full px-2.5 py-0.5 text-xs font-semibold text-muted">Personal contact · by @{contact.ownerUsername}</p>
            <p className="flex items-center gap-1.5 text-sm text-muted">
              <Lock className="size-3.5" aria-hidden="true" /> Its conversation is private until the owner approves you.
            </p>
            <div className="mt-4 w-full text-left">
              {contact.request === "approved" ? (
                <Link
                  href={`/chats/${contact.chatId}`}
                  onClick={onClose}
                  className="flex h-11 w-full items-center justify-center gap-2 rounded-2xl bg-brand font-semibold text-white"
                >
                  <Eye className="size-[18px]" /> Open (view only)
                </Link>
              ) : contact.request === "pending" ? (
                <div className="flex flex-col gap-2">
                  <p className="flex items-center justify-center gap-2 rounded-2xl bg-accent-soft py-3 text-[15px] font-semibold text-accent">
                    <Clock3 className="size-[18px]" aria-hidden="true" /> Request sent: waiting for approval
                  </p>
                  <Button variant="ghost" loading={busy} onClick={() => run("DELETE")}>
                    Withdraw request
                  </Button>
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  {contact.request === "declined" && (
                    <p className="rounded-2xl bg-surface-2 px-3 py-2 text-center text-sm text-muted">Your last request was declined. You can ask again.</p>
                  )}
                  <Textarea
                    label="Note to the owner"
                    optional
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    maxLength={280}
                    rows={2}
                    placeholder="Why you'd like to view it"
                  />
                  <Button loading={busy} onClick={() => run("POST")}>
                    Request to view
                  </Button>
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={() => setReporting({ contactId: contact.id, label: contact.name })}
              className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-danger hover:underline"
            >
              <Flag className="size-3.5" aria-hidden="true" /> Report
            </button>
          </div>
        )}
      </Sheet>
      <ReportSheet target={reporting} onClose={() => setReporting(null)} />
    </>
  );
}
