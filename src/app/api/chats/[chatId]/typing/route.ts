import { json, route } from "@/lib/api";
import { requireSession } from "@/lib/auth/session";
import { requireMembership } from "@/lib/authz/chats";
import { relayTyping } from "@/lib/chats/service";
import { rateLimit } from "@/lib/security/rate-limit";

/** "I'm typing" ping. Clients send at most one every 3 seconds while composing. */
export const POST = route<RouteContext<"/api/chats/[chatId]/typing">>(async (_req, ctx) => {
  const { user } = await requireSession();
  await rateLimit("typing", user.id);
  const m = await requireMembership(user.id, (await ctx.params).chatId);
  await relayTyping(user.id, m);
  return json({ ok: true });
});
