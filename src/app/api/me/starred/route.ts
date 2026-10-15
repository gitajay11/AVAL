import { json, route } from "@/lib/api";
import { requireSession } from "@/lib/auth/session";
import { decodeCursor, encodeCursor } from "@/lib/chats/cursor";
import { listStarred } from "@/lib/chats/starred";

/** My starred (saved) messages, newest saved first. `?before=<cursor>` pages back. */
export const GET = route(async (req) => {
  const { user } = await requireSession();
  const before = decodeCursor(req.nextUrl.searchParams.get("before"));
  const { items, last, hasMore } = await listStarred(user.id, before);
  return json({ items, olderCursor: hasMore && last ? encodeCursor(last) : null });
});
