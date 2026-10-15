"use client";

import Link from "next/link";
import { useEffect } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LogoMark } from "@/components/ui/logo";

/** Something failed while rendering a page inside the app; the chat list stays usable. */
export default function AppError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 p-8 text-center" role="alert">
      <LogoMark className="size-14" />
      <div>
        <h1 className="text-xl font-extrabold">Something went wrong</h1>
        <p className="mt-1 max-w-sm text-[15px] text-muted">This page couldn&apos;t load. Your messages are safe; try again in a moment.</p>
        {error.digest && <p className="mt-2 font-mono text-xs text-subtle">Ref {error.digest}</p>}
      </div>
      <div className="flex gap-2">
        <Button onClick={() => retry()}>
          <RefreshCw className="size-4" aria-hidden="true" /> Try again
        </Button>
        <Link href="/chats" className="inline-flex h-11 items-center rounded-2xl px-5 text-[15px] font-semibold text-fg hover:bg-surface-3">
          Back to chats
        </Link>
      </div>
    </div>
  );
}
