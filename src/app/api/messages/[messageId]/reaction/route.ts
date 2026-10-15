import { json, parseJson, route } from "@/lib/api";
import { requireSession } from "@/lib/auth/session";
import { setReaction } from "@/lib/chats/service";
import { rateLimit } from "@/lib/security/rate-limit";
import { ReactionSchema } from "@/lib/validation/chat";

/** Set my reaction (`{ emoji }`) or remove it (`{ emoji: null }`). */
export const PUT = route<RouteContext<"/api/messages/[messageId]/reaction">>(async (req, ctx) => {
  const { user } = await requireSession();
  await rateLimit("messageAction", user.id);
  const { emoji } = await parseJson(req, ReactionSchema);
  await setReaction(user, (await ctx.params).messageId, emoji);
  return json({ ok: true });
});
