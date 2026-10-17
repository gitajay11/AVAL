import { json, route } from "@/lib/api";
import { requireSession } from "@/lib/auth/session";
import { searchPublicContacts } from "@/lib/contacts/service";
import { rateLimit } from "@/lib/security/rate-limit";
import { ContactSearchSchema } from "@/lib/validation/contacts";

/** GET ?q= → public contacts by name or @username prefix (2+ characters). */
export const GET = route(async (req) => {
  const { user } = await requireSession();
  await rateLimit("userSearch", user.id);
  const q = ContactSearchSchema.safeParse(req.nextUrl.searchParams.get("q") ?? "");
  return json({ results: q.success ? await searchPublicContacts(user.id, q.data) : [] });
});
