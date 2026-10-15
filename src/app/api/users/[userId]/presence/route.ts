import { json, route } from "@/lib/api";
import { requireSession } from "@/lib/auth/session";
import { presenceFor } from "@/lib/presence";
import { rateLimit } from "@/lib/security/rate-limit";
import { uuid } from "@/lib/validation/common";

/** Online / last seen for a user, or `{ visible: false }` when their privacy hides it. */
export const GET = route<RouteContext<"/api/users/[userId]/presence">>(async (_req, ctx) => {
  const { user } = await requireSession();
  await rateLimit("presenceRead", user.id);
  const id = uuid.safeParse((await ctx.params).userId);
  if (!id.success) return json({ presence: { visible: false } });
  return json({ presence: await presenceFor(user.id, id.data) });
});
