import { json, route } from "@/lib/api";
import { requireSession } from "@/lib/auth/session";
import { listShared } from "@/lib/contacts/service";

/** Contacts other people have shared with me (approved and still public). */
export const GET = route(async () => {
  const { user } = await requireSession();
  return json({ shared: await listShared(user.id) });
});
