"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { AvatarPicker } from "@/components/profile/avatar-picker";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { api, ClientApiError } from "@/lib/client/api";
import type { Me } from "@/lib/users";
import { Section } from "./section";

export function ProfileSection({ me, onChange }: { me: Me; onChange: (me: Me) => void }) {
  const router = useRouter();
  const toast = useToast();
  const [form, setForm] = useState({ displayName: me.displayName, bio: me.bio ?? "", dateOfBirth: me.dateOfBirth ?? "" });
  const [fields, setFields] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const dirty =
    form.displayName !== me.displayName || form.bio !== (me.bio ?? "") || form.dateOfBirth !== (me.dateOfBirth ?? "");

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  function applyUser(user: Me) {
    onChange(user);
    router.refresh(); // updates the avatar/name in the app shell
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setFields({});
    try {
      const { user } = await api<{ user: Me }>("/api/me", {
        method: "PATCH",
        body: { displayName: form.displayName, bio: form.bio || null, dateOfBirth: form.dateOfBirth || null },
      });
      applyUser(user);
      setForm({ displayName: user.displayName, bio: user.bio ?? "", dateOfBirth: user.dateOfBirth ?? "" });
      toast("Profile saved");
    } catch (err) {
      if (err instanceof ClientApiError) {
        setFields(err.fields);
        if (!Object.keys(err.fields).length) toast(err.message, "error");
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <Section id="profile" title="Profile">
      <form method="post" onSubmit={save} className="flex flex-col gap-4 py-4" noValidate>
        <AvatarPicker name={me.displayName} avatarUrl={me.avatarUrl} onChange={applyUser} size={96} />
        <p className="-mt-1 text-center text-[15px] text-muted">@{me.username}</p>
        <Input label="Display name" value={form.displayName} onChange={set("displayName")} error={fields.displayName} maxLength={64} />
        <Textarea
          label="Bio"
          optional
          value={form.bio}
          onChange={set("bio")}
          error={fields.bio}
          maxLength={160}
          rows={2}
          hint={`${form.bio.length}/160`}
        />
        <Input
          label="Date of birth"
          optional
          type="date"
          value={form.dateOfBirth}
          onChange={set("dateOfBirth")}
          error={fields.dateOfBirth}
          max={new Date().toISOString().slice(0, 10)}
        />
        <div className="flex justify-end">
          <Button type="submit" loading={saving} disabled={!dirty}>
            Save changes
          </Button>
        </div>
      </form>
    </Section>
  );
}
