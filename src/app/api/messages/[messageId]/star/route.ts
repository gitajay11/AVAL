import { json, route } from "@/lib/api";
import { requireSession } from "@/lib/auth/session";
import { setStarred } from "@/lib/chats/service";
import { rateLimit } from "@/lib/security/rate-limit";

type Ctx = RouteContext<"/api/messages/[messageId]/star">;

/** Save to my starred messages. */
export const POST = route<Ctx>(async (_req, ctx) => {
  const { user } = await requireSession();
  await rateLimit("messageAction", user.id);
  await setStarred(user.id, (await ctx.params).messageId, true);
  return json({ starred: true });
});

/** Remove from my starred messages. */
export const DELETE = route<Ctx>(async (_req, ctx) => {
  const { user } = await requireSession();
  await rateLimit("messageAction", user.id);
  await setStarred(user.id, (await ctx.params).messageId, false);
  return json({ starred: false });
});
