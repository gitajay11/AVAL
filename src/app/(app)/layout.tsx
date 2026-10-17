import { Suspense } from "react";
import { AppShell, AppShellSkeleton } from "@/components/app/app-shell";
import { requireUser } from "@/lib/auth/session";
import { listChats } from "@/lib/chats/queries";
import { avatarUrl } from "@/lib/users";

async function AuthedShell({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  // Server-rendered chat list: no client fetch before the list appears.
  const chats = await listChats(user.id);
  return (
    <AppShell
      user={{
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        avatarUrl: avatarUrl(user.id, user.avatarKey),
        emailVerified: user.emailVerified,
      }}
      initialChats={chats}
    >
      {children}
    </AppShell>
  );
}

export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <Suspense fallback={<AppShellSkeleton />}>
      <AuthedShell>{children}</AuthedShell>
    </Suspense>
  );
}
