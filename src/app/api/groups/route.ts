import { json, parseJson, route } from "@/lib/api";
import { requireSession } from "@/lib/auth/session";
import { createGroup } from "@/lib/groups/service";
import { rateLimit } from "@/lib/security/rate-limit";
import { CreateGroupSchema } from "@/lib/validation/groups";

/** Create a group with me as owner. Each person must accept messages from me. */
export const POST = route(async (req) => {
  const { user } = await requireSession();
  await rateLimit("chatCreate", user.id);
  const input = await parseJson(req, CreateGroupSchema);
  return json({ chatId: await createGroup(user, input) }, { status: 201 });
});
