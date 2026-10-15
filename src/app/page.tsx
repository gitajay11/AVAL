import { redirect } from "next/navigation";

// proxy.ts normally answers "/" first; this is the fallback.
export default function Home() {
  redirect("/chats");
}
