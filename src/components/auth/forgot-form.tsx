"use client";

import Link from "next/link";
import { useState } from "react";
import { Mail, MailCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { api, ClientApiError } from "@/lib/client/api";
import { AuthCard, FormError } from "./auth-card";

export function ForgotForm() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setFields({});
    try {
      await api("/api/auth/forgot-password", { body: { email } });
      setSent(true);
    } catch (err) {
      if (err instanceof ClientApiError) {
        setFields(err.fields);
        setError(Object.keys(err.fields).length ? null : err.message);
      } else setError("Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  const back = (
    <Link href="/login" className="font-semibold text-accent hover:underline">
      Back to sign in
    </Link>
  );

  if (sent) {
    return (
      <AuthCard title="Check your inbox" footer={back}>
        <div className="flex gap-3 rounded-2xl bg-accent-soft p-4 text-[15px] text-fg">
          <MailCheck className="mt-0.5 size-5 shrink-0 text-accent" aria-hidden="true" />
          <p>
            If an account uses <strong className="break-all">{email}</strong>, a reset link is on its way. It expires in 30
            minutes.
          </p>
        </div>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Forgot your password?" subtitle="We'll email you a link to choose a new one." footer={back}>
      <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        <FormError message={error} />
        <Input
          label="Email"
          type="email"
          autoComplete="email"
          inputMode="email"
          leading={<Mail className="size-[18px]" />}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={fields.email}
          required
          autoFocus
        />
        <Button type="submit" size="lg" loading={loading}>
          Send reset link
        </Button>
      </form>
    </AuthCard>
  );
}
