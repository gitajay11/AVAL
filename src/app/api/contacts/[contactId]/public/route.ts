import { json, route } from "@/lib/api";
import { requireSession } from "@/lib/auth/session";
import { publicContact } from "@/lib/contacts/service";

/** Name, avatar and my request state for a public contact. Private ones are 404. */
export const GET = route<RouteContext<"/api/contacts/[contactId]/public">>(async (_req, ctx) => {
  const { user } = await requireSession();
  return json({ contact: await publicContact(user.id, (await ctx.params).contactId) });
});
