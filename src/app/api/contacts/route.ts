import { json, parseJson, route } from "@/lib/api";
import { requireSession } from "@/lib/auth/session";
import { createContact, listMyContacts } from "@/lib/contacts/service";
import { rateLimit } from "@/lib/security/rate-limit";
import { CreateContactSchema } from "@/lib/validation/contacts";

/** My personal contacts, with viewer and pending-request counts. */
export const GET = route(async () => {
  const { user } = await requireSession();
  return json({ contacts: await listMyContacts(user.id) });
});

/** Create a personal contact (Private by default) and its one-way chat. */
export const POST = route(async (req) => {
  const { user } = await requireSession();
  await rateLimit("contactWrite", user.id);
  const input = await parseJson(req, CreateContactSchema);
  return json({ contact: await createContact(user.id, input) }, { status: 201 });
});
