import { ApiError, json, route } from "@/lib/api";
import { requireSession } from "@/lib/auth/session";
import { revokeAccess } from "@/lib/contacts/service";
import { rateLimit } from "@/lib/security/rate-limit";
import { uuid } from "@/lib/validation/common";

/** Owner only: revoke one person's access. Their open view closes immediately. */
export const DELETE = route<RouteContext<"/api/contacts/[contactId]/access/[userId]">>(async (_req, ctx) => {
  const { user } = await requireSession();
  await rateLimit("contactWrite", user.id);
  const { contactId, userId } = await ctx.params;
  if (!uuid.safeParse(userId).success) throw new ApiError(404, "not_found", "Not found.");
  return json(await revokeAccess(user.id, contactId, userId));
});
