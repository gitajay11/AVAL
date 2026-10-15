"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { AtSign, LockKeyhole } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { api, ClientApiError, safeNext } from "@/lib/client/api";
import { AuthCard, FormError } from "./auth-card";

export function LoginForm() {
  const router = useRouter();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [fields, setFields] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setFields({});
    try {
      await api("/api/auth/login", { body: { identifier, password } });
      router.replace(safeNext(new URLSearchParams(location.search).get("next")));
      router.refresh();
    } catch (err) {
      setLoading(false);
      if (err instanceof ClientApiError) {
        setFields(err.fields);
        setError(Object.keys(err.fields).length ? null : err.message);
      } else setError("Something went wrong.");
    }
  }

  return (
    <AuthCard
      title="Welcome back"
      subtitle="Sign in with your username or email."
      footer={
        <>
          New to Aval?{" "}
          <Link href="/signup" className="font-semibold text-accent hover:underline">
            Create an account
          </Link>
        </>
      }
    >
      {/* method="post": a submit before hydration must never put credentials in the URL. */}
      <form method="post" onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        <FormError message={error} />
        <Input
          label="Username or email"
          name="username"
          autoComplete="username"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          inputMode="email"
          leading={<AtSign className="size-[18px]" />}
          value={identifier}
          onChange={(e) => setIdentifier(e.target.value)}
          error={fields.identifier}
          required
          autoFocus
        />
        <Input
          label="Password"
          name="password"
          type="password"
          autoComplete="current-password"
          leading={<LockKeyhole className="size-[18px]" />}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={fields.password}
          required
        />
        <div className="-mt-1 flex justify-end">
          <Link href="/forgot-password" className="text-sm font-semibold text-accent hover:underline">
            Forgot password?
          </Link>
        </div>
        <Button type="submit" size="lg" loading={loading} className="mt-1">
          Sign in
        </Button>
      </form>
    </AuthCard>
  );
}
