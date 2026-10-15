import { json, route } from "@/lib/api";
import { requireSession } from "@/lib/auth/session";
import { accessChatId, accessClearedAt, requireChatAccess } from "@/lib/authz/contacts";
import { latestPinned } from "@/lib/chats/queries";

/** The most recently pinned message in the chat (used after an unpin). */
export const GET = route<RouteContext<"/api/chats/[chatId]/pinned">>(async (_req, ctx) => {
  const { user } = await requireSession();
  const access = await requireChatAccess(user.id, (await ctx.params).chatId);
  return json({ pinned: await latestPinned(user.id, accessChatId(access), accessClearedAt(access)) });
});
