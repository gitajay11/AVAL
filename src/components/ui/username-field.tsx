"use client";

import { AtSign, Check, X } from "lucide-react";
import { Input } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { useUsernameCheck, type UsernameState } from "@/lib/client/use-username-check";
import { USERNAME_MAX } from "@/lib/validation/limits";

export function UsernameStatus({ state }: { state: UsernameState }) {
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

/** Live availability for the namespace shared by people and personal contacts. */
export function useUsernameField(value: string, current?: string | null) {
  const unchanged = !!current && value.trim().toLowerCase() === current.toLowerCase();
  const state = useUsernameCheck(unchanged ? "" : value);
  return { state, unchanged, blocked: !unchanged && (state.status === "taken" || state.status === "invalid") };
}

type Props = {
  label?: string;
  value: string;
  onChange: (v: string) => void;
  error?: string;
  /** Editing: the name it already has counts as fine. */
  current?: string | null;
  hint?: string;
  autoFocus?: boolean;
};

export function UsernameField({ label = "Username", value, onChange, error, current, hint = "3–20 characters: letters, numbers, _ and .", autoFocus }: Props) {
  const { state, unchanged } = useUsernameField(value, current);
  const trailing = unchanged ? null : state.status === "available" ? (
    <Check className="size-[18px] text-accent" aria-hidden="true" />
  ) : state.status === "taken" || state.status === "invalid" ? (
    <X className="size-[18px] text-danger" aria-hidden="true" />
  ) : null;
  return (
    <Input
      label={label}
      name="username"
      autoComplete="off"
      autoCapitalize="none"
      autoCorrect="off"
      spellCheck={false}
      leading={<AtSign className="size-[18px]" />}
      trailing={trailing}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      error={error}
      status={value && !unchanged ? <UsernameStatus state={state} /> : undefined}
      hint={hint}
      maxLength={USERNAME_MAX}
      required
      autoFocus={autoFocus}
    />
  );
}
