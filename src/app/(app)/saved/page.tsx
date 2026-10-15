import type { Metadata } from "next";
import { Suspense } from "react";
import { SavedView } from "@/components/chats/saved-view";
import { Skeleton } from "@/components/ui/skeleton";
import { requireUser } from "@/lib/auth/session";
import { listStarred } from "@/lib/chats/starred";
import { encodeCursor } from "@/lib/chats/cursor";

export const metadata: Metadata = { title: "Starred messages" };

async function Saved() {
  const user = await requireUser();
  const { items, last, hasMore } = await listStarred(user.id, null);
  return <SavedView initial={items} initialCursor={hasMore && last ? encodeCursor(last) : null} />;
}

export default function SavedPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto flex max-w-2xl flex-col gap-3 px-4 pt-20">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-24 rounded-[20px]" />
          ))}
        </div>
      }
    >
      <Saved />
    </Suspense>
  );
}
