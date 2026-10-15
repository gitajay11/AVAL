import type { Metadata } from "next";
import { Suspense } from "react";
import { ContactsView } from "@/components/contacts/contacts-view";
import { Skeleton } from "@/components/ui/skeleton";
import { requireUser } from "@/lib/auth/session";
import { listMyContacts, listShared } from "@/lib/contacts/service";

export const metadata: Metadata = { title: "Contacts" };

async function Contacts() {
  const user = await requireUser();
  const [mine, shared] = await Promise.all([listMyContacts(user.id), listShared(user.id)]);
  return <ContactsView mine={mine} shared={shared} />;
}

export default function ContactsPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto flex max-w-2xl flex-col gap-3 px-4 pt-28">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-16 rounded-[20px]" />
          ))}
        </div>
      }
    >
      <Contacts />
    </Suspense>
  );
}
