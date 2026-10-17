import { ApiError, json, parseJson, route } from "@/lib/api";
import { setAlias } from "@/lib/aliases";
import { requireSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { rateLimit } from "@/lib/security/rate-limit";
import { uuid } from "@/lib/validation/common";
import { AliasSchema } from "@/lib/validation/profile";

/**
 * PUT { alias } → my private nickname for this person (null resets it). Only I
 * ever see it: in my chat list, chat header, group names, search and notifications.
 */
export const PUT = route<RouteContext<"/api/users/[userId]/alias">>(async (req, ctx) => {
  const { user: me } = await requireSession();
  await rateLimit("profileUpdate", me.id);
  const id = uuid.safeParse((await ctx.params).userId);
  if (!id.success || id.data === me.id) throw new ApiError(404, "not_found", "User not found.");
  const { alias } = await parseJson(req, AliasSchema);
  const target = await db.user.findUnique({ where: { id: id.data }, select: { id: true } });
  if (!target) throw new ApiError(404, "not_found", "User not found.");
  await setAlias(me.id, target.id, alias);
  return json({ alias });
});
