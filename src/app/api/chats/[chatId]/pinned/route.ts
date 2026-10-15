import { json, route } from "@/lib/api";
import { requireSession } from "@/lib/auth/session";
import { requireMembership } from "@/lib/authz/chats";
import { latestPinned } from "@/lib/chats/queries";

/** The most recently pinned message in the chat (used after an unpin). */
export const GET = route<RouteContext<"/api/chats/[chatId]/pinned">>(async (_req, ctx) => {
  const { user } = await requireSession();
  const m = await requireMembership(user.id, (await ctx.params).chatId);
  return json({ pinned: await latestPinned(user.id, m.chat.id, m.clearedAt) });
});
