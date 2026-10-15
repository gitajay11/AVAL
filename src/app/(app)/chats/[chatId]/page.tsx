import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ChatView } from "@/components/chats/chat-view";
import { Skeleton } from "@/components/ui/skeleton";
import { requireUser } from "@/lib/auth/session";
import { getChatDetail } from "@/lib/chats/detail";

export const metadata: Metadata = { title: "Chat" };

async function ChatLoader({ params }: { params: PageProps<"/chats/[chatId]">["params"] }) {
  const { chatId } = await params;
  const user = await requireUser();
  // Membership is checked inside: non-members get the same 404 as a missing chat.
  const detail = await getChatDetail(user, chatId);
  if (!detail) notFound();
  return <ChatView key={chatId} detail={detail} />;
}

function ChatSkeleton() {
  return (
    <div className="flex h-full flex-col" aria-busy="true" aria-label="Loading chat">
      <div className="flex h-16 items-center gap-3 border-b border-line bg-surface/70 px-4 pt-[env(safe-area-inset-top)]">
        <Skeleton className="size-[42px] rounded-full" />
        <div className="flex flex-col gap-1.5">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-3 w-20" />
        </div>
      </div>
      <div className="flex flex-1 flex-col justify-end gap-2 p-4">
        {[48, 64, 40, 72, 56].map((w, i) => (
          <Skeleton key={i} className={`h-10 rounded-[20px] ${i % 2 ? "self-end" : ""}`} style={{ width: `${w}%` }} />
        ))}
      </div>
      <div className="p-3">
        <Skeleton className="h-12 rounded-[24px]" />
      </div>
    </div>
  );
}

export default function ChatPage({ params }: PageProps<"/chats/[chatId]">) {
  return (
    <Suspense fallback={<ChatSkeleton />}>
      <ChatLoader params={params} />
    </Suspense>
  );
}
