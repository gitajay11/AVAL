import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";

/** Render inside <Suspense>: sends already signed-in visitors to their chats. */
export async function RedirectIfSignedIn() {
  if (await getSession()) redirect("/chats");
  return null;
}
