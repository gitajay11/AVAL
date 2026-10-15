import { json, parseJson, route } from "@/lib/api";
import { requireSession } from "@/lib/auth/session";
import { deleteForEveryone, editMessage } from "@/lib/chats/service";
import { rateLimit } from "@/lib/security/rate-limit";
import { EditMessageSchema } from "@/lib/validation/chat";

type Ctx = RouteContext<"/api/messages/[messageId]">;

/** Edit my message's text or caption (within 48 hours). */
export const PATCH = route<Ctx>(async (req, ctx) => {
  const { user } = await requireSession();
  await rateLimit("messageAction", user.id);
  const { text } = await parseJson(req, EditMessageSchema);
  return json({ message: await editMessage(user, (await ctx.params).messageId, text) });
});

/** Delete my message for everyone. */
export const DELETE = route<Ctx>(async (_req, ctx) => {
  const { user } = await requireSession();
  await rateLimit("messageAction", user.id);
  return json({ message: await deleteForEveryone(user.id, (await ctx.params).messageId) });
});
