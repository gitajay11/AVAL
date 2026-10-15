import { json, route } from "@/lib/api";
import { requireSession } from "@/lib/auth/session";
import { decodeCursor } from "@/lib/chats/cursor";
import { searchAll } from "@/lib/search/messages";
import { rateLimit } from "@/lib/security/rate-limit";

/** GET ?q=&before= → messages matching q across all my chats, newest first. */
export const GET = route(async (req) => {
  const { user } = await requireSession();
  await rateLimit("userSearch", user.id);
  const q = (req.nextUrl.searchParams.get("q") ?? "").slice(0, 200);
  const before = decodeCursor(req.nextUrl.searchParams.get("before"));
  return json(await searchAll(user.id, q, before));
});
