"use client";

import { useState } from "react";
import { CheckCircle2, Download, RefreshCw } from "lucide-react";
import { IosInstallSheet } from "@/components/app/pwa-banners";
import { BUILD_ID, usePwa } from "@/components/app/pwa";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { Divider, Section } from "./section";

const INSTALL_HINT = {
  prompt: "Get a full-screen app that opens from your home screen or dock.",
  ios: "Add Aval to your Home Screen from Safari's Share menu.",
  installed: "You're using the installed app.",
  unavailable: "Use your browser's menu (Install app / Add to Home Screen) if it offers it.",
} as const;

export function AppSection() {
  const { install, promptInstall, updateReady, checkForUpdate } = usePwa();
  const toast = useToast();
  const [iosOpen, setIosOpen] = useState(false);
  const [checking, setChecking] = useState(false);

  async function check() {
    setChecking(true);
    const newer = await checkForUpdate();
    setChecking(false);
    if (!newer) toast("You're on the latest version.");
  }

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
      <Divider />
      <div className="flex items-center gap-4 py-1">
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-medium">Version</p>
          <p className="truncate font-mono text-[13px] text-muted">{BUILD_ID}</p>
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
      <IosInstallSheet open={iosOpen} onClose={() => setIosOpen(false)} />
    </Section>
  );
}
