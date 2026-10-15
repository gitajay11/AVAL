import { ApiError, json, route } from "@/lib/api";
import { requireSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { uuid } from "@/lib/validation/common";

/** Sign out one other device. Scoped to the caller's own sessions. */
export const DELETE = route<RouteContext<"/api/me/sessions/[id]">>(async (_req, ctx) => {
  const { user, sessionId } = await requireSession();
  const id = uuid.safeParse((await ctx.params).id);
  if (!id.success) throw new ApiError(404, "not_found", "Session not found.");
  if (id.data === sessionId) throw new ApiError(400, "current_session", "Use “Log out” to end this session.");
  const { count } = await db.session.deleteMany({ where: { id: id.data, userId: user.id } });
  if (count === 0) throw new ApiError(404, "not_found", "Session not found.");
  return json({ ok: true });
});
