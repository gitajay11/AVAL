"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { LockKeyhole } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { api, ClientApiError } from "@/lib/client/api";
import { useHashToken } from "@/lib/client/use-hash-token";
import { AuthCard, FormError } from "./auth-card";
import { PasswordMeter } from "./password-meter";

export function ResetForm() {
  const router = useRouter();
  const toast = useToast();
  const token = useHashToken();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [fields, setFields] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) {
      setFields({ confirm: "Passwords don't match" });
      return;
    }
    setLoading(true);
    setError(null);
    setFields({});
    try {
      await api("/api/auth/reset-password", { body: { token, password } });
      toast("Password updated. Sign in with your new password.");
      router.replace("/login");
    } catch (err) {
      setLoading(false);
      if (err instanceof ClientApiError) {
        setFields(err.fields);
        setError(err.fields.token ?? (Object.keys(err.fields).length ? null : err.message));
      } else setError("Something went wrong.");
    }
  }

  if (token === undefined) return <Skeleton className="h-[360px] rounded-[24px]" />;

  if (!token) {
    return (
      <AuthCard
        title="Link not valid"
        subtitle="This reset link is incomplete or has already been used."
        footer={
          <Link href="/forgot-password" className="font-semibold text-accent hover:underline">
            Request a new link
          </Link>
        }
      >
        <span />
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Choose a new password" subtitle="You'll be signed out on all devices.">
      <form method="post" onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        <FormError message={error} />
        <div className="flex flex-col gap-2">
          <Input
            label="New password"
            type="password"
            autoComplete="new-password"
            leading={<LockKeyhole className="size-[18px]" />}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            error={fields.password}
            required
            autoFocus
          />
          <PasswordMeter password={password} />
        </div>
        <Input
          label="Confirm password"
          type="password"
          autoComplete="new-password"
          leading={<LockKeyhole className="size-[18px]" />}
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          error={fields.confirm}
          required
        />
        <Button type="submit" size="lg" loading={loading}>
          Update password
        </Button>
      </form>
    </AuthCard>
  );
}
