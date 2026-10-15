"use client";

import { useEffect, useState } from "react";
import { LogOut, Monitor, ShieldAlert, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { PasswordMeter } from "@/components/auth/password-meter";
import { api, ClientApiError } from "@/lib/client/api";
import { signOut } from "@/lib/client/sign-out";
import type { Me } from "@/lib/users";
import { Divider, Section } from "./section";

type Device = {
  id: string;
  userAgent: string | null;
  ipPrefix: string | null;
  lastUsedAt: string;
  current: boolean;
};

function describeAgent(ua: string | null): { label: string; mobile: boolean } {
  if (!ua) return { label: "Unknown device", mobile: false };
  const mobile = /Mobile|Android|iPhone|iPad/i.test(ua);
  const browser = /Edg\//.test(ua) ? "Edge" : /Firefox\//.test(ua) ? "Firefox" : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : "Browser";
  const os = /Windows/.test(ua) ? "Windows" : /Android/.test(ua) ? "Android" : /iPhone|iPad/.test(ua) ? "iOS" : /Mac OS/.test(ua) ? "macOS" : /Linux/.test(ua) ? "Linux" : "";
  return { label: os ? `${browser} on ${os}` : browser, mobile };
}

const relative = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
function ago(iso: string): string {
  const mins = Math.round((Date.now() - Date.parse(iso)) / 60000);
  if (mins < 2) return "Active now";
  if (mins < 60) return relative.format(-mins, "minute");
  if (mins < 60 * 24) return relative.format(-Math.round(mins / 60), "hour");
  return relative.format(-Math.round(mins / 1440), "day");
}

function Devices() {
  const toast = useToast();
  const [devices, setDevices] = useState<Device[] | null>(null);

  useEffect(() => {
    api<{ sessions: Device[] }>("/api/me/sessions")
      .then((r) => setDevices(r.sessions))
      .catch(() => setDevices([]));
  }, []);

  async function revoke(id: string) {
    try {
      await api(`/api/me/sessions/${id}`, { method: "DELETE" });
      setDevices((d) => d?.filter((x) => x.id !== id) ?? null);
      toast("Device signed out");
    } catch (err) {
      toast(err instanceof ClientApiError ? err.message : "Couldn't sign out device.", "error");
    }
  }

  if (!devices) return <Skeleton className="my-3 h-14" />;
  return (
    <ul className="divide-y divide-line">
      {devices.map((d) => {
        const { label, mobile } = describeAgent(d.userAgent);
        const Icon = mobile ? Smartphone : Monitor;
        return (
          <li key={d.id} className="flex items-center gap-3 py-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-surface-3 text-muted">
              <Icon className="size-5" aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[15px] font-medium">{label}</p>
              <p className="text-[13px] text-muted">
                {d.current ? <span className="font-semibold text-accent">This device</span> : ago(d.lastUsedAt)}
                {d.ipPrefix ? ` · ${d.ipPrefix}` : ""}
              </p>
            </div>
            {!d.current && (
              <Button variant="ghost" size="sm" onClick={() => revoke(d.id)}>
                Sign out
              </Button>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function ChangePassword() {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ currentPassword: "", newPassword: "" });
  const [fields, setFields] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setFields({});
    try {
      await api("/api/me/password", { body: form });
      toast("Password changed. Other devices were signed out.");
      setForm({ currentPassword: "", newPassword: "" });
      setOpen(false);
    } catch (err) {
      if (err instanceof ClientApiError) {
        setFields(err.fields);
        if (!Object.keys(err.fields).length) toast(err.message, "error");
      }
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <div className="flex items-center justify-between py-3">
        <p className="text-[15px] font-medium">Password</p>
        <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
          Change
        </Button>
      </div>
    );
  }
  return (
    <form method="post" onSubmit={submit} className="flex flex-col gap-4 py-4" noValidate>
      <Input
        label="Current password"
        type="password"
        autoComplete="current-password"
        value={form.currentPassword}
        onChange={(e) => setForm((f) => ({ ...f, currentPassword: e.target.value }))}
        error={fields.currentPassword}
        autoFocus
      />
      <div className="flex flex-col gap-2">
        <Input
          label="New password"
          type="password"
          autoComplete="new-password"
          value={form.newPassword}
          onChange={(e) => setForm((f) => ({ ...f, newPassword: e.target.value }))}
          error={fields.newPassword}
        />
        <PasswordMeter password={form.newPassword} />
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
        <Button type="submit" loading={saving}>
          Update password
        </Button>
      </div>
    </form>
  );
}

export function AccountSection({ me }: { me: Me }) {
  const toast = useToast();
  const [busy, setBusy] = useState<"one" | "all" | null>(null);

  async function resend() {
    try {
      await api("/api/auth/resend-verification", { method: "POST" });
      toast("Verification email sent");
    } catch (err) {
      toast(err instanceof ClientApiError ? err.message : "Couldn't send email.", "error");
    }
  }

  return (
    <>
      <Section id="account" title="Account">
        <div className="flex items-center justify-between gap-3 py-3">
          <div className="min-w-0">
            <p className="text-[15px] font-medium">Email</p>
            <p className="truncate text-[13px] text-muted">{me.email}</p>
          </div>
          {me.emailVerified ? (
            <span className="rounded-full bg-accent-soft px-2.5 py-1 text-xs font-bold text-accent">Verified</span>
          ) : (
            <Button variant="secondary" size="sm" onClick={resend}>
              Verify
            </Button>
          )}
        </div>
        <Divider />
        <ChangePassword />
      </Section>

      <Section id="devices" title="Devices" description="Where you're signed in right now.">
        <Devices />
      </Section>

      <Section id="sign-out" title="Sign out" className="flex flex-col gap-2 py-4">
        <Button
          variant="secondary"
          loading={busy === "one"}
          onClick={() => {
            setBusy("one");
            signOut(false);
          }}
        >
          <LogOut className="size-[18px]" aria-hidden="true" /> Log out
        </Button>
        <Button
          variant="danger"
          loading={busy === "all"}
          onClick={() => {
            if (!confirm("Sign out of Aval on every device, including this one?")) return;
            setBusy("all");
            signOut(true);
          }}
        >
          <ShieldAlert className="size-[18px]" aria-hidden="true" /> Log out of all devices
        </Button>
      </Section>
    </>
  );
}
