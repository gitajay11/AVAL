import { json, route } from "@/lib/api";
import { requireSession } from "@/lib/auth/session";
import { accessChatId, accessClearedAt, requireChatAccess } from "@/lib/authz/contacts";
import { decodeCursor } from "@/lib/chats/cursor";
import { searchInChat } from "@/lib/search/messages";
import { rateLimit } from "@/lib/security/rate-limit";

/** GET ?q=&before= → messages matching q in this chat (members, or viewers of a shared contact). */
export const GET = route<RouteContext<"/api/chats/[chatId]/search">>(async (req, ctx) => {
  const { user } = await requireSession();
  await rateLimit("userSearch", user.id);
  const access = await requireChatAccess(user.id, (await ctx.params).chatId);
  const q = (req.nextUrl.searchParams.get("q") ?? "").slice(0, 200);
  const before = decodeCursor(req.nextUrl.searchParams.get("before"));
  return json(await searchInChat(user.id, accessChatId(access), accessClearedAt(access), q, before));
});
