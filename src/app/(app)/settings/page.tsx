import type { Metadata } from "next";
import { Suspense } from "react";
import { SettingsView } from "@/components/settings/settings-view";
import { Skeleton } from "@/components/ui/skeleton";
import { getMe } from "@/lib/auth/me";

export const metadata: Metadata = { title: "Settings" };

async function Settings() {
  return <SettingsView me={await getMe()} />;
}

export default function SettingsPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto flex max-w-2xl flex-col gap-6 px-4 pt-20">
          <Skeleton className="h-72 rounded-[20px]" />
          <Skeleton className="h-56 rounded-[20px]" />
        </div>
      }
    >
      <Settings />
    </Suspense>
  );
}
