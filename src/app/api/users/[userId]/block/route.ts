import { ApiError, json, route } from "@/lib/api";
import { requireSession } from "@/lib/auth/session";
import { endSharingBetween } from "@/lib/contacts/service";
import { db } from "@/lib/db";
import { rateLimit } from "@/lib/security/rate-limit";
import { uuid } from "@/lib/validation/common";

type Ctx = RouteContext<"/api/users/[userId]/block">;

async function target(ctx: Ctx, meId: string): Promise<string> {
  const id = uuid.safeParse((await ctx.params).userId);
  if (!id.success || id.data === meId) throw new ApiError(400, "bad_target", "You can't block this account.");
  const exists = await db.user.findUnique({ where: { id: id.data }, select: { id: true } });
  if (!exists) throw new ApiError(404, "not_found", "User not found.");
  return id.data;
}

/**
 * Block: they can't message, react, see my photo, status or typing, or find me
 * (or my public contacts) in search; I stop receiving their messages; any
 * contact sharing between us ends. Takes effect on the next request.
 */
export const POST = route<Ctx>(async (_req, ctx) => {
  const { user } = await requireSession();
  await rateLimit("block", user.id);
  const blockedId = await target(ctx, user.id);
  await db.block.upsert({
    where: { blockerId_blockedId: { blockerId: user.id, blockedId } },
    create: { blockerId: user.id, blockedId },
    update: {},
  });
  await endSharingBetween(user.id, blockedId);
  return json({ blocked: true });
});

export const DELETE = route<Ctx>(async (_req, ctx) => {
  const { user } = await requireSession();
  await rateLimit("block", user.id);
  const blockedId = await target(ctx, user.id);
  await db.block.deleteMany({ where: { blockerId: user.id, blockedId } });
  return json({ blocked: false });
});
