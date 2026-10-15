import type { Metadata } from "next";
import { LogoMark } from "@/components/ui/logo";

export const metadata: Metadata = { title: "Chats" };

/** Desktop right pane when no chat is open (the list lives in the shell). */
export default function ChatsPage() {
  return (
    <div className="bg-aurora flex h-full flex-col items-center justify-center gap-4 p-8 text-center">
      <LogoMark className="size-16 opacity-90" />
      <div>
        <p className="text-lg font-bold">Select a chat to start messaging</p>
        <p className="mt-1 text-[15px] text-muted">Your conversations stay in sync across every device.</p>
      </div>
    </div>
  );
}
