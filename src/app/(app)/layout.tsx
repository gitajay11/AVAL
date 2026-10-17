import { AppShell } from "@/components/app/app-shell";
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

/**
 * The signed-in shell renders with the first HTML instead of streaming in
 * behind a skeleton: the session check and the chat list take a few ms, and
 * the real content then paints with the first frame (before any JavaScript
 * runs) instead of after it. Pages under it still stream their own parts.
 */
export const instant = false;

export default function AppLayout({ children }: LayoutProps<"/">) {
  return <AuthedShell>{children}</AuthedShell>;
}
