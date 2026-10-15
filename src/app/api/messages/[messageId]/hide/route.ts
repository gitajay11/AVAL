import { json, route } from "@/lib/api";
import { requireSession } from "@/lib/auth/session";
import { hideForMe } from "@/lib/chats/service";
import { rateLimit } from "@/lib/security/rate-limit";

/** Delete for me: hides the message from my view on all my devices. */
export const POST = route<RouteContext<"/api/messages/[messageId]/hide">>(async (_req, ctx) => {
  const { user } = await requireSession();
  await rateLimit("messageAction", user.id);
  await hideForMe(user.id, (await ctx.params).messageId);
  return json({ ok: true });
});
