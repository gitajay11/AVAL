import { ApiError, json, route } from "@/lib/api";
import { requireSession } from "@/lib/auth/session";
import { canSeeAvatar, hasBlocked } from "@/lib/authz/privacy";
import type { UserProfileDTO } from "@/lib/chats/types";
import { getAlias } from "@/lib/aliases";
import { db } from "@/lib/db";
import { avatarUrl } from "@/lib/users";
import { uuid } from "@/lib/validation/common";

/** Public profile card: name, username, bio and photo (privacy applied). */
export const GET = route<RouteContext<"/api/users/[userId]">>(async (_req, ctx) => {
  const { user: me } = await requireSession();
  const id = uuid.safeParse((await ctx.params).userId);
  const u = id.success
    ? await db.user.findUnique({
        where: { id: id.data },
        select: { id: true, username: true, displayName: true, bio: true, avatarKey: true, avatarAudience: true },
      })
    : null;
  if (!u) throw new ApiError(404, "not_found", "User not found.");
  const [blockedByMe, blockedMe, photo, alias] = await Promise.all([
    hasBlocked(me.id, u.id),
    hasBlocked(u.id, me.id),
    canSeeAvatar(me.id, u),
    u.id === me.id ? Promise.resolve(null) : getAlias(me.id, u.id),
  ]);
  const profile: UserProfileDTO = {
    id: u.id,
    username: u.username,
    displayName: u.displayName,
    avatarUrl: photo ? avatarUrl(u.id, u.avatarKey) : null,
    bio: blockedMe ? null : u.bio,
    blockedByMe,
    alias,
  };
  return json({ profile });
});
