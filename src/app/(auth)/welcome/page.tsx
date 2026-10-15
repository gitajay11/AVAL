import type { Metadata } from "next";
import { Suspense } from "react";
import { WelcomeStep } from "@/components/auth/welcome-step";
import { Skeleton } from "@/components/ui/skeleton";
import { getMe } from "@/lib/auth/me";

export const metadata: Metadata = { title: "Welcome" };

async function Welcome() {
  return <WelcomeStep me={await getMe()} />;
}

export default function WelcomePage() {
  return (
    <Suspense fallback={<Skeleton className="h-[420px] rounded-[24px]" />}>
      <Welcome />
    </Suspense>
  );
}
