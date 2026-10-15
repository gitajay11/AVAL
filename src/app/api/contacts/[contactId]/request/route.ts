import { json, parseJson, route } from "@/lib/api";
import { requireSession } from "@/lib/auth/session";
import { cancelRequest, requestAccess } from "@/lib/contacts/service";
import { rateLimit } from "@/lib/security/rate-limit";
import { AccessRequestSchema } from "@/lib/validation/contacts";

type Ctx = RouteContext<"/api/contacts/[contactId]/request">;

/** Ask the owner for view access (optional note). The owner is notified. */
export const POST = route<Ctx>(async (req, ctx) => {
  const { user } = await requireSession();
  await rateLimit("accessRequest", user.id);
  const { note } = await parseJson(req, AccessRequestSchema);
  return json({ contact: await requestAccess(user, (await ctx.params).contactId, note) }, { status: 201 });
});

/** Withdraw my pending request. */
export const DELETE = route<Ctx>(async (_req, ctx) => {
  const { user } = await requireSession();
  return json({ contact: await cancelRequest(user.id, (await ctx.params).contactId) });
});
