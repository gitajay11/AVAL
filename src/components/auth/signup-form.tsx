"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { AtSign, Check, ChevronDown, Mail, LockKeyhole, UserRound, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { api, ClientApiError } from "@/lib/client/api";
import { useUsernameCheck, type UsernameState } from "@/lib/client/use-username-check";
import { USERNAME_MAX } from "@/lib/validation/auth";
import { AuthCard, FormError } from "./auth-card";
import { PasswordMeter } from "./password-meter";

function UsernameStatus({ state }: { state: UsernameState }) {
  switch (state.status) {
    case "checking":
      return (
        <span className="inline-flex items-center gap-1.5">
          <Spinner className="size-3.5" /> Checking…
        </span>
      );
    case "available":
      return <span className="font-semibold text-accent">✓ Available</span>;
    case "taken":
    case "invalid":
      return <span className="font-medium text-danger">{state.reason}</span>;
    default:
      return null;
  }
}

export function SignupForm() {
  const router = useRouter();
  const [form, setForm] = useState({ username: "", email: "", password: "", displayName: "", bio: "", dateOfBirth: "" });
  const [showOptional, setShowOptional] = useState(false);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const usernameState = useUsernameCheck(form.username);

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const value = key === "username" ? e.target.value.toLowerCase().replace(/\s/g, "") : e.target.value;
    setForm((f) => ({ ...f, [key]: value }));
    if (fields[key]) setFields((f) => Object.fromEntries(Object.entries(f).filter(([k]) => k !== key)));
  };

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (usernameState.status === "taken" || usernameState.status === "invalid") {
      setFields((f) => ({ ...f, username: usernameState.reason }));
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await api("/api/auth/signup", {
        body: {
          username: form.username,
          email: form.email,
          password: form.password,
          displayName: form.displayName,
          ...(form.bio.trim() && { bio: form.bio }),
          ...(form.dateOfBirth && { dateOfBirth: form.dateOfBirth }),
        },
      });
      router.replace("/welcome");
      router.refresh();
    } catch (err) {
      setLoading(false);
      if (err instanceof ClientApiError) {
        setFields(err.fields);
        if (err.fields.bio || err.fields.dateOfBirth) setShowOptional(true);
        setError(Object.keys(err.fields).length ? null : err.message);
      } else setError("Something went wrong.");
    }
  }

  const usernameTrailing =
    usernameState.status === "available" ? (
      <Check className="size-[18px] text-accent" aria-hidden="true" />
    ) : usernameState.status === "taken" || usernameState.status === "invalid" ? (
      <X className="size-[18px] text-danger" aria-hidden="true" />
    ) : null;

  return (
    <AuthCard
      title="Create your account"
      subtitle="Pick a username people can find you by."
      footer={
        <>
          Already have an account?{" "}
          <Link href="/login" className="font-semibold text-accent hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        <FormError message={error} />
        <Input
          label="Display name"
          name="name"
          autoComplete="name"
          leading={<UserRound className="size-[18px]" />}
          value={form.displayName}
          onChange={set("displayName")}
          error={fields.displayName}
          maxLength={64}
          required
          autoFocus
        />
        <Input
          label="Username"
          name="username"
          autoComplete="username"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          leading={<AtSign className="size-[18px]" />}
          trailing={usernameTrailing}
          value={form.username}
          onChange={set("username")}
          error={fields.username}
          status={form.username ? <UsernameStatus state={usernameState} /> : undefined}
          hint="3–20 characters: letters, numbers, _ and ."
          maxLength={USERNAME_MAX}
          required
        />
        <Input
          label="Email"
          name="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          autoCapitalize="none"
          leading={<Mail className="size-[18px]" />}
          value={form.email}
          onChange={set("email")}
          error={fields.email}
          required
        />
        <div className="flex flex-col gap-2">
          <Input
            label="Password"
            name="new-password"
            type="password"
            autoComplete="new-password"
            leading={<LockKeyhole className="size-[18px]" />}
            value={form.password}
            onChange={set("password")}
            error={fields.password}
            hint="At least 8 characters. A short phrase is easy to remember."
            required
          />
          <PasswordMeter password={form.password} />
        </div>

        <button
          type="button"
          onClick={() => setShowOptional((s) => !s)}
          aria-expanded={showOptional}
          className="-mx-1 flex items-center justify-between rounded-xl px-1 py-1 text-sm font-semibold text-muted hover:text-fg"
        >
          Bio and birthday (optional)
          <ChevronDown className={`size-4 transition-transform ${showOptional ? "rotate-180" : ""}`} aria-hidden="true" />
        </button>
        <AnimatePresence initial={false}>
          {showOptional && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ type: "spring", stiffness: 400, damping: 36 }}
              className="-mx-1 overflow-hidden px-1"
            >
              <div className="flex flex-col gap-4 pb-1">
                <Textarea label="Bio" optional value={form.bio} onChange={set("bio")} error={fields.bio} maxLength={160} rows={2} />
                <Input
                  label="Date of birth"
                  optional
                  type="date"
                  autoComplete="bday"
                  value={form.dateOfBirth}
                  onChange={set("dateOfBirth")}
                  error={fields.dateOfBirth}
                  max={new Date().toISOString().slice(0, 10)}
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <Button type="submit" size="lg" loading={loading} className="mt-1">
          Create account
        </Button>
        <p className="text-center text-xs text-subtle">You can add a profile photo on the next step.</p>
      </form>
    </AuthCard>
  );
}
