import { json, parseJson, route } from "@/lib/api";
import { requireSession } from "@/lib/auth/session";
import { updateGroup } from "@/lib/groups/service";
import { rateLimit } from "@/lib/security/rate-limit";
import { UpdateGroupSchema } from "@/lib/validation/groups";

/** Admins: rename, edit the description, or remove the group photo. */
export const PATCH = route<RouteContext<"/api/chats/[chatId]/group">>(async (req, ctx) => {
  const { user } = await requireSession();
  await rateLimit("messageAction", user.id);
  const input = await parseJson(req, UpdateGroupSchema);
  await updateGroup(user, (await ctx.params).chatId, input);
  return json({ ok: true });
});
