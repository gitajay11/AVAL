"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { MessageCircle } from "lucide-react";
import { ViewableAvatar } from "@/components/ui/avatar-viewer";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import { api, ClientApiError } from "@/lib/client/api";
import type { MemberDTO } from "@/lib/chats/types";

const ROLE = { OWNER: "Group owner", ADMIN: "Admin", MEMBER: null } as const;

/** A group member's card (opened from their avatar beside a message): name, @username, message them. */
export function MemberSheet({ member, meId, onClose }: { member: MemberDTO | null; meId: string; onClose: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  async function message() {
    if (!member) return;
    setBusy(true);
    try {
      const { chatId } = await api<{ chatId: string }>("/api/chats", { body: { userId: member.id } });
      onClose();
      router.push(`/chats/${chatId}`);
    } catch (err) {
      toast(err instanceof ClientApiError ? err.message : "Couldn't open the chat.", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet open={member !== null} onClose={onClose} title="Profile">
      {member && (
        <div className="flex flex-col items-center gap-2 pt-1 pb-2 text-center">
          <ViewableAvatar name={member.displayName} src={member.avatarUrl} username={member.username} size={96} />
          <p className="mt-1 text-xl font-bold">{member.displayName}</p>
          <p className="text-[15px] text-muted">@{member.username}</p>
          {ROLE[member.role] && <p className="glass-flat rounded-full px-2.5 py-0.5 text-xs font-semibold text-muted">{ROLE[member.role]}</p>}
          {member.id !== meId && (
            <Button className="mt-3 w-full" loading={busy} onClick={message}>
              <MessageCircle className="size-[18px]" aria-hidden="true" /> Message
            </Button>
          )}
        </div>
      )}
    </Sheet>
  );
}
