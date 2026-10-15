import { json, parseJson, route } from "@/lib/api";
import { requireSession } from "@/lib/auth/session";
import { deleteContact, getContactDetail, updateContact } from "@/lib/contacts/service";
import { rateLimit } from "@/lib/security/rate-limit";
import { UpdateContactSchema } from "@/lib/validation/contacts";

type Ctx = RouteContext<"/api/contacts/[contactId]">;

/** Owner only: the contact, pending requests and who has access. Others get 404. */
export const GET = route<Ctx>(async (_req, ctx) => {
  const { user } = await requireSession();
  return json(await getContactDetail(user.id, (await ctx.params).contactId));
});

/**
 * Owner only: rename, edit the note, remove the photo, or change visibility.
 * Switching to Private ends every viewer's access immediately.
 */
export const PATCH = route<Ctx>(async (req, ctx) => {
  const { user } = await requireSession();
  await rateLimit("contactWrite", user.id);
  const input = await parseJson(req, UpdateContactSchema);
  return json(await updateContact(user.id, (await ctx.params).contactId, input));
});

/** Owner only: delete the contact, its journal and its media. */
export const DELETE = route<Ctx>(async (_req, ctx) => {
  const { user } = await requireSession();
  await rateLimit("contactWrite", user.id);
  await deleteContact(user.id, (await ctx.params).contactId);
  return json({ ok: true });
});
