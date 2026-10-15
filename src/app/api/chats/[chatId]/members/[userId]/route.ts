import { ApiError, json, parseJson, route } from "@/lib/api";
import { requireSession } from "@/lib/auth/session";
import { removeMember, setRole } from "@/lib/groups/service";
import { rateLimit } from "@/lib/security/rate-limit";
import { uuid } from "@/lib/validation/common";
import { SetRoleSchema } from "@/lib/validation/groups";

type Ctx = RouteContext<"/api/chats/[chatId]/members/[userId]">;

async function ids(ctx: Ctx) {
  const { chatId, userId } = await ctx.params;
  if (!uuid.safeParse(userId).success) throw new ApiError(404, "not_found", "Not found.");
  return { chatId, userId };
}

/** Remove someone (admins), or leave the group (my own id). */
export const DELETE = route<Ctx>(async (_req, ctx) => {
  const { user } = await requireSession();
  await rateLimit("messageAction", user.id);
  const { chatId, userId } = await ids(ctx);
  await removeMember(user, chatId, userId);
  return json({ ok: true });
});

/** Owner: make someone an admin, or a member again. */
export const PATCH = route<Ctx>(async (req, ctx) => {
  const { user } = await requireSession();
  await rateLimit("messageAction", user.id);
  const { chatId, userId } = await ids(ctx);
  const { role } = await parseJson(req, SetRoleSchema);
  await setRole(user, chatId, userId, role);
  return json({ ok: true });
});
