import { json, parseJson, route } from "@/lib/api";
import { requireSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { rateLimit } from "@/lib/security/rate-limit";
import { profileChanged } from "@/lib/profile-events";
import { meSelect, toMe } from "@/lib/users";
import { UpdateProfileSchema } from "@/lib/validation/profile";

export const GET = route(async () => {
  const { user } = await requireSession();
  const row = await db.user.findUniqueOrThrow({ where: { id: user.id }, select: meSelect });
  return json({ user: toMe(row) });
});

/** Update display name, bio and date of birth. */
export const PATCH = route(async (req) => {
  const { user } = await requireSession();
  await rateLimit("profileUpdate", user.id);
  const input = await parseJson(req, UpdateProfileSchema);
  const row = await db.user.update({
    where: { id: user.id },
    data: {
      ...(input.displayName !== undefined && { displayName: input.displayName }),
      ...(input.bio !== undefined && { bio: input.bio || null }),
      ...(input.dateOfBirth !== undefined && {
        dateOfBirth: input.dateOfBirth ? new Date(`${input.dateOfBirth}T00:00:00Z`) : null,
      }),
    },
    select: meSelect,
  });
  if (input.displayName !== undefined) await profileChanged(user.id);
  return json({ user: toMe(row) });
});
