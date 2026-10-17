"use client";

import { IdleLink as Link } from "@/components/ui/idle-link";
import { useState } from "react";
import { ChevronLeft } from "lucide-react";
import type { Me } from "@/lib/users";
import { AboutSection, AppSection } from "./app-section";
import { BlockedSection } from "./blocked-section";
import { AppearanceSection, PrivacyAndNotifications } from "./preferences-sections";
import { ProfileSection } from "./profile-section";
import { AccountSection } from "./security-section";
import { FloatingBar } from "@/components/ui/floating-bar";

export function SettingsView({ me: initial }: { me: Me }) {
  const [me, setMe] = useState(initial);
  return (
    <div className="h-full overflow-y-auto">
      <FloatingBar className="flex items-center gap-2 px-2 py-2">
        <Link
          href="/chats"
          className="grid size-10 place-items-center rounded-xl text-fg hover:bg-surface-3 md:hidden"
          aria-label="Back to chats"
        >
          <ChevronLeft className="size-6" />
        </Link>
        <h1 className="floating-title px-1 text-xl font-extrabold tracking-tight">Settings</h1>
      </FloatingBar>
      <div className="mx-auto flex max-w-2xl flex-col gap-7 px-4 py-6 pb-[max(2rem,env(safe-area-inset-bottom))]">
        <ProfileSection me={me} onChange={setMe} />
        <PrivacyAndNotifications me={me} onChange={setMe} />
        <BlockedSection />
        <AppearanceSection />
        <AppSection />
        <AccountSection me={me} />
        <AboutSection />
      </div>
    </div>
  );
}
