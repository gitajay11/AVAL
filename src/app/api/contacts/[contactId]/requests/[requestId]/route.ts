import { json, parseJson, route } from "@/lib/api";
import { requireSession } from "@/lib/auth/session";
import { decideRequest } from "@/lib/contacts/service";
import { rateLimit } from "@/lib/security/rate-limit";
import { DecisionSchema } from "@/lib/validation/contacts";

/** Owner only: approve (grants read-only access) or decline a pending request. */
export const POST = route<RouteContext<"/api/contacts/[contactId]/requests/[requestId]">>(async (req, ctx) => {
  const { user } = await requireSession();
  await rateLimit("contactWrite", user.id);
  const { contactId, requestId } = await ctx.params;
  const { decision } = await parseJson(req, DecisionSchema);
  return json(await decideRequest(user.id, contactId, requestId, decision));
});
