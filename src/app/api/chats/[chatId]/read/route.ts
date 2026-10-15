import { json, parseJson, route } from "@/lib/api";
import { requireSession } from "@/lib/auth/session";
import { requireMembership } from "@/lib/authz/chats";
import { markRead } from "@/lib/chats/service";
import { ReadSchema } from "@/lib/validation/chat";

/** Mark everything up to `upTo` as read. The watermark only moves forward. */
export const POST = route<RouteContext<"/api/chats/[chatId]/read">>(async (req, ctx) => {
  const { user } = await requireSession();
  const m = await requireMembership(user.id, (await ctx.params).chatId);
  const { upTo } = await parseJson(req, ReadSchema);
  const lastReadAt = await markRead(user.id, m.chat.id, new Date(upTo));
  return json({ lastReadAt });
});
