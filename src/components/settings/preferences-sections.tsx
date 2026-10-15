"use client";

import { useState } from "react";
import { setThemePref, useThemePref, type ThemePref } from "@/components/theme";
import { Segmented } from "@/components/ui/segmented";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/components/ui/toast";
import { api, ClientApiError } from "@/lib/client/api";
import type { Me } from "@/lib/users";
import type { AUDIENCES } from "@/lib/validation/profile";
import { Divider, Section } from "./section";

type Audience = (typeof AUDIENCES)[number];
type Settings = Me["privacy"] & Me["notifications"];

const AUDIENCE_OPTIONS: { value: Audience; label: string }[] = [
  { value: "EVERYONE", label: "Everyone" },
  { value: "CONTACTS", label: "My chats" },
  { value: "NOBODY", label: "Nobody" },
];

/** Optimistic toggle: flip locally, persist, roll back on failure. */
function useSettings(me: Me, onChange: (me: Me) => void) {
  const toast = useToast();
  const [values, setValues] = useState<Settings>({ ...me.privacy, ...me.notifications });

  async function update<K extends keyof Settings>(key: K, value: Settings[K]) {
    const previous = values[key];
    setValues((v) => ({ ...v, [key]: value }));
    try {
      const { user } = await api<{ user: Me }>("/api/me/settings", { method: "PATCH", body: { [key]: value } });
      onChange(user);
    } catch (err) {
      setValues((v) => ({ ...v, [key]: previous }));
      toast(err instanceof ClientApiError ? err.message : "Couldn't save setting.", "error");
    }
  }
  return { values, update };
}

export function PrivacyAndNotifications({ me, onChange }: { me: Me; onChange: (me: Me) => void }) {
  const { values, update } = useSettings(me, onChange);
  return (
    <>
      <Section id="privacy" title="Privacy" description="“My chats” means people you already have a 1:1 chat with.">
        <Segmented
          label="Last seen & online"
          value={values.lastSeenAudience}
          options={AUDIENCE_OPTIONS}
          onChange={(v) => update("lastSeenAudience", v)}
        />
        <Divider />
        <Segmented
          label="Profile photo"
          value={values.avatarAudience}
          options={AUDIENCE_OPTIONS}
          onChange={(v) => update("avatarAudience", v)}
        />
        <Divider />
        <Segmented
          label="Who can message me"
          value={values.messageAudience}
          options={AUDIENCE_OPTIONS}
          onChange={(v) => update("messageAudience", v)}
        />
      </Section>

      <Section id="notifications" title="Notifications">
        <Switch
          label="New messages"
          description="Push notifications for messages in chats you haven't muted."
          checked={values.notifyMessages}
          onChange={(v) => update("notifyMessages", v)}
        />
        <Divider />
        <Switch
          label="Show message preview"
          description="Include message text in notifications."
          checked={values.notifyPreviews}
          onChange={(v) => update("notifyPreviews", v)}
          disabled={!values.notifyMessages}
        />
        <Divider />
        <Switch
          label="Access requests"
          description="When someone asks to view one of your contacts."
          checked={values.notifyAccessRequests}
          onChange={(v) => update("notifyAccessRequests", v)}
        />
      </Section>
    </>
  );
}

const THEME_OPTIONS: { value: ThemePref; label: string }[] = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

export function AppearanceSection() {
  const pref = useThemePref();
  return (
    <Section id="appearance" title="Appearance">
      <Segmented label="Theme" value={pref} options={THEME_OPTIONS} onChange={setThemePref} />
    </Section>
  );
}
