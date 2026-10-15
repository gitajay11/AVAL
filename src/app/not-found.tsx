import Link from "next/link";
import { LogoMark } from "@/components/ui/logo";

export default function NotFound() {
  return (
    <div className="bg-aurora flex h-full min-h-dvh flex-col items-center justify-center gap-4 p-8 text-center">
      <LogoMark className="size-14" />
      <div>
        <h1 className="text-xl font-extrabold">Nothing here</h1>
        <p className="mt-1 text-[15px] text-muted">This chat or page doesn&apos;t exist, or you don&apos;t have access to it.</p>
      </div>
      <Link href="/chats" className="rounded-2xl bg-brand px-5 py-2.5 text-[15px] font-semibold text-white">
        Back to chats
      </Link>
    </div>
  );
}
