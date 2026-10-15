"use client";

import { useEffect, useState } from "react";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/components/ui/toast";
import { ClientApiError } from "@/lib/client/api";
import { disablePush, enablePush, pushState, type PushState } from "@/lib/client/push";

const HINT: Record<PushState, string> = {
  on: "This browser gets notifications while Aval is closed.",
  off: "Get notifications while Aval is closed.",
  denied: "Notifications are blocked for this site. Allow them in your browser settings.",
  unsupported: "This browser doesn't support push notifications.",
  unconfigured: "Push isn't set up on this server.",
  "needs-install": "On iPhone and iPad, add Aval to your Home Screen first (Share → Add to Home Screen).",
};

/** Per-device push subscription (the account-wide switches below decide what is sent). */
export function PushToggle() {
  const toast = useToast();
  const [state, setState] = useState<PushState | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    pushState()
      .then(setState)
      .catch(() => setState("unsupported"));
  }, []);

  async function toggle(on: boolean) {
    setBusy(true);
    try {
      if (on) {
        const next = await enablePush();
        setState(next);
        if (next === "denied") toast("Notifications are blocked for this site.", "error");
      } else {
        await disablePush();
        setState("off");
      }
    } catch (err) {
      toast(err instanceof ClientApiError ? err.message : "Couldn't change notifications.", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Switch
      label="Push on this device"
      description={state ? HINT[state] : "Checking…"}
      checked={state === "on"}
      onChange={toggle}
      disabled={busy || (state !== "on" && state !== "off")}
    />
  );
}
