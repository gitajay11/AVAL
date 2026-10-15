import { json, parseJson, route } from "@/lib/api";
import { requireSession } from "@/lib/auth/session";
import { forwardMessage } from "@/lib/chats/service";
import { rateLimit } from "@/lib/security/rate-limit";
import { ForwardSchema } from "@/lib/validation/chat";

/** Forward a message to up to 10 chats I can send in. */
export const POST = route<RouteContext<"/api/messages/[messageId]/forward">>(async (req, ctx) => {
  const { user } = await requireSession();
  await rateLimit("forward", user.id);
  const { chatIds } = await parseJson(req, ForwardSchema);
  const messageIds = await forwardMessage(user, (await ctx.params).messageId, chatIds);
  return json({ messageIds });
});
