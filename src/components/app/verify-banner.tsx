"use client";

import { MailWarning } from "lucide-react";
import { useState } from "react";
import { useToast } from "@/components/ui/toast";
import { api, ClientApiError } from "@/lib/client/api";

export function VerifyBanner() {
  const toast = useToast();
  const [sending, setSending] = useState(false);

  async function resend() {
    setSending(true);
    try {
      const res = await api<{ alreadyVerified: boolean }>("/api/auth/resend-verification", { method: "POST" });
      toast(res.alreadyVerified ? "Your email is already verified" : "Verification email sent");
    } catch (err) {
      toast(err instanceof ClientApiError ? err.message : "Couldn't send email.", "error");
    } finally {
      setSending(false);
    }
  }

  return (
    <div role="status" className="mx-3 mb-2 flex items-center gap-3 rounded-2xl bg-accent-soft px-3.5 py-3 text-sm text-fg">
      <MailWarning className="size-5 shrink-0 text-accent" aria-hidden="true" />
      <p className="min-w-0 flex-1 leading-5">Verify your email to start chatting.</p>
      <button
        type="button"
        onClick={resend}
        disabled={sending}
        className="shrink-0 rounded-lg px-2 py-1 font-semibold text-accent hover:underline disabled:opacity-60"
      >
        {sending ? "Sending…" : "Resend email"}
      </button>
    </div>
  );
}
