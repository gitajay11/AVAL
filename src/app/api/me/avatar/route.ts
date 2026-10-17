import { json, route } from "@/lib/api";
import { requireSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { deleteObject } from "@/lib/object-storage";
import { profileChanged } from "@/lib/profile-events";
import { meSelect, toMe } from "@/lib/users";

/** Remove the profile photo. */
export const DELETE = route(async () => {
  const { user } = await requireSession();
  const { avatarKey } = await db.user.findUniqueOrThrow({ where: { id: user.id }, select: { avatarKey: true } });
  const [row] = await db.$transaction([
    db.user.update({ where: { id: user.id }, data: { avatarKey: null }, select: meSelect }),
    ...(avatarKey ? [db.attachment.deleteMany({ where: { objectKey: avatarKey } })] : []),
  ]);
  if (avatarKey) await deleteObject(avatarKey);
  await profileChanged(user.id);
  return json({ user: toMe(row) });
});
