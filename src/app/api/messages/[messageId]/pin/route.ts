import { json, route } from "@/lib/api";
import { requireSession } from "@/lib/auth/session";
import { setPinned } from "@/lib/chats/service";
import { rateLimit } from "@/lib/security/rate-limit";

type Ctx = RouteContext<"/api/messages/[messageId]/pin">;

/** Pin a message for everyone in the chat. */
export const POST = route<Ctx>(async (_req, ctx) => {
  const { user } = await requireSession();
  await rateLimit("messageAction", user.id);
  return json({ message: await setPinned(user.id, (await ctx.params).messageId, true) });
});

/** Unpin it. */
export const DELETE = route<Ctx>(async (_req, ctx) => {
  const { user } = await requireSession();
  await rateLimit("messageAction", user.id);
  return json({ message: await setPinned(user.id, (await ctx.params).messageId, false) });
});
