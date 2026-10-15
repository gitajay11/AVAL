"use client";

import Link from "next/link";
import { useState } from "react";
import { ChevronLeft } from "lucide-react";
import type { Me } from "@/lib/users";
import { BlockedSection } from "./blocked-section";
import { AppearanceSection, PrivacyAndNotifications } from "./preferences-sections";
import { ProfileSection } from "./profile-section";
import { AccountSection } from "./security-section";

export function SettingsView({ me: initial }: { me: Me }) {
  const [me, setMe] = useState(initial);
  return (
    <div className="h-full overflow-y-auto">
      <header className="glass sticky top-0 z-10 flex items-center gap-2 border-b border-line px-3 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3">
        <Link
          href="/chats"
          className="grid size-10 place-items-center rounded-xl text-fg hover:bg-surface-3 md:hidden"
          aria-label="Back to chats"
        >
          <ChevronLeft className="size-6" />
        </Link>
        <h1 className="px-1 text-xl font-extrabold tracking-tight">Settings</h1>
      </header>
      <div className="mx-auto flex max-w-2xl flex-col gap-7 px-4 py-6 pb-[max(2rem,env(safe-area-inset-bottom))]">
        <ProfileSection me={me} onChange={setMe} />
        <PrivacyAndNotifications me={me} onChange={setMe} />
        <BlockedSection />
        <AppearanceSection />
        <AccountSection me={me} />
      </div>
    </div>
  );
}
