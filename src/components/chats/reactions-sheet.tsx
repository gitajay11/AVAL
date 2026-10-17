"use client";

import { Avatar } from "@/components/ui/avatar";
import { Sheet } from "@/components/ui/sheet";
import { cn } from "@/lib/cn";
import type { MessageDTO } from "@/lib/chats/types";

type Props = {
  message: MessageDTO | null;
  meId: string;
  readOnly: boolean;
  nameOf: (userId: string | null) => string;
  avatarOf: (userId: string | null) => string | null;
  onToggle: (m: MessageDTO, emoji: string) => void;
  onClose: () => void;
};

/** Who reacted with what. Tapping an emoji row of mine removes it; another adds it. */
export function ReactionsSheet({ message, meId, readOnly, nameOf, avatarOf, onToggle, onClose }: Props) {
  const reactions = message?.reactions ?? [];
  const total = reactions.reduce((n, r) => n + r.userIds.length, 0);
  return (
    <Sheet open={message !== null && reactions.length > 0} onClose={onClose} title="Reactions" description={total === 1 ? "1 reaction" : `${total} reactions`}>
      <ul className="flex flex-col gap-3 pt-1">
        {reactions.map((r) => {
          const mine = r.userIds.includes(meId);
          return (
            <li key={r.emoji} className="glass-1 rounded-2xl p-2">
              <div className="flex items-center gap-2 px-1.5 pb-1.5">
                <span className="text-[22px] leading-none">{r.emoji}</span>
                <span className="flex-1 text-[13px] font-semibold text-muted">{r.userIds.length}</span>
                {!readOnly && message && (
                  <button
                    type="button"
                    onClick={() => onToggle(message, r.emoji)}
                    className={cn("rounded-full px-3 py-1 text-[13px] font-semibold", mine ? "glass-flat text-danger" : "glass-primary")}
                  >
                    {mine ? "Remove mine" : "Add mine"}
                  </button>
                )}
              </div>
              <ul className="flex flex-col">
                {r.userIds.map((id) => (
                  <li key={id} className="flex items-center gap-3 rounded-xl px-1.5 py-1.5">
                    <Avatar name={nameOf(id)} src={avatarOf(id)} size={32} />
                    <span className="min-w-0 flex-1 truncate text-[15px] font-medium">{id === meId ? "You" : nameOf(id)}</span>
                  </li>
                ))}
              </ul>
            </li>
          );
        })}
      </ul>
    </Sheet>
  );
}
