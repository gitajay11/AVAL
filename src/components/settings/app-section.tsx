"use client";

import { useState } from "react";
import { CheckCircle2, Download, RefreshCw } from "lucide-react";
import { IosInstallSheet } from "@/components/app/pwa-banners";
import { BUILD_ID, usePwa } from "@/components/app/pwa";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { APP_LABEL, APP_VERSION } from "@/lib/version";
import { Section } from "./section";

const INSTALL_HINT = {
  prompt: "Get a full-screen app that opens from your home screen or dock.",
  ios: "Add Aval to your Home Screen from Safari's Share menu.",
  installed: "You're using the installed app.",
  unavailable: "Use your browser's menu (Install app / Add to Home Screen) if it offers it.",
} as const;

export function AppSection() {
  const { install, promptInstall } = usePwa();
  const [iosOpen, setIosOpen] = useState(false);

  return (
    <Section id="app" title="App">
      <div className="flex items-center gap-4 py-1">
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-medium">Install Aval</p>
          <p className="text-[13px] text-muted">{INSTALL_HINT[install]}</p>
        </div>
        {install === "installed" ? (
          <CheckCircle2 className="size-5 shrink-0 text-accent" aria-label="Installed" />
        ) : install === "unavailable" ? null : (
          <Button size="sm" variant="secondary" onClick={() => (install === "ios" ? setIosOpen(true) : void promptInstall())}>
            <Download className="size-4" aria-hidden="true" /> Install
          </Button>
        )}
      </div>
      <IosInstallSheet open={iosOpen} onClose={() => setIosOpen(false)} />
    </Section>
  );
}

/** Settings → About: the app version and update check. */
export function AboutSection() {
  const { updateReady, checkForUpdate } = usePwa();
  const toast = useToast();
  const [checking, setChecking] = useState(false);

  async function check() {
    setChecking(true);
    const newer = await checkForUpdate();
    setChecking(false);
    if (!newer) toast("You're on the latest version.");
  }

  return (
    <Section id="about" title="About">
      <div className="flex items-center gap-4 py-1">
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-semibold">{APP_LABEL}</p>
          <p className="truncate text-[13px] text-muted">
            Version {APP_VERSION} · build <span className="font-mono">{BUILD_ID}</span>
          </p>
        </div>
        {updateReady ? (
          <Button size="sm" onClick={() => location.reload()}>
            <RefreshCw className="size-4" aria-hidden="true" /> Update now
          </Button>
        ) : (
          <Button size="sm" variant="secondary" loading={checking} onClick={check} disabled={BUILD_ID === "dev"}>
            Check for updates
          </Button>
        )}
      </div>
    </Section>
  );
}
