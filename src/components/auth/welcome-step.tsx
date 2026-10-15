"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { MailCheck } from "lucide-react";
import { AvatarPicker } from "@/components/profile/avatar-picker";
import { Button } from "@/components/ui/button";
import type { Me } from "@/lib/users";
import { AuthCard } from "./auth-card";

/** Post-signup: optional profile photo, and a reminder to verify the email. */
export function WelcomeStep({ me: initial }: { me: Me }) {
  const router = useRouter();
  const [me, setMe] = useState(initial);
  return (
    <AuthCard title={`Welcome, ${me.displayName.split(" ")[0]}`} subtitle="Add a photo so friends recognise you.">
      <div className="flex flex-col gap-6">
        <AvatarPicker name={me.displayName} avatarUrl={me.avatarUrl} onChange={setMe} />
        {!me.emailVerified && (
          <div className="flex gap-3 rounded-2xl bg-accent-soft p-4 text-sm text-fg">
            <MailCheck className="mt-0.5 size-5 shrink-0 text-accent" aria-hidden="true" />
            <p>
              We sent a verification link to <strong className="break-all">{me.email}</strong>. You&apos;ll need to verify before
              starting chats.
            </p>
          </div>
        )}
        <Button size="lg" onClick={() => router.replace("/chats")}>
          {me.avatarUrl ? "Continue" : "Skip for now"}
        </Button>
      </div>
    </AuthCard>
  );
}
