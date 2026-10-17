import { json, parseJson, route } from "@/lib/api";
import { requireSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { rateLimit } from "@/lib/security/rate-limit";
import { profileChanged } from "@/lib/profile-events";
import { meSelect, toMe } from "@/lib/users";
import { UpdateSettingsSchema } from "@/lib/validation/profile";

/** Privacy (last seen, profile photo, who can message me) and notification toggles. */
export const PATCH = route(async (req) => {
  const { user } = await requireSession();
  await rateLimit("profileUpdate", user.id);
  const input = await parseJson(req, UpdateSettingsSchema);
  const row = await db.user.update({ where: { id: user.id }, data: input, select: meSelect });
  // Who may see the photo changed: chats showing it re-check.
  if (input.avatarAudience !== undefined) await profileChanged(user.id);
  return json({ user: toMe(row) });
});
