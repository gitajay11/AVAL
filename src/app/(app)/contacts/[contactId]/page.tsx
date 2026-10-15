import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ContactManage } from "@/components/contacts/contact-manage";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { getContactDetail } from "@/lib/contacts/service";

export const metadata: Metadata = { title: "Contact" };

async function Manage({ params }: { params: PageProps<"/contacts/[contactId]">["params"] }) {
  const { contactId } = await params;
  const user = await requireUser();
  // Owner only; anyone else gets the same 404 as a missing contact.
  const detail = await getContactDetail(user.id, contactId).catch((err) => {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  });
  return <ContactManage key={contactId} initial={detail} />;
}

export default function ContactPage({ params }: PageProps<"/contacts/[contactId]">) {
  return (
    <Suspense
      fallback={
        <div className="mx-auto flex max-w-2xl flex-col gap-6 px-4 pt-20">
          <Skeleton className="h-72 rounded-[20px]" />
          <Skeleton className="h-32 rounded-[20px]" />
        </div>
      }
    >
      <Manage params={params} />
    </Suspense>
  );
}
