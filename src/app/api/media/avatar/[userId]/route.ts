import { NextResponse } from "next/server";
import { ApiError, route } from "@/lib/api";
import { requireSession } from "@/lib/auth/session";
import { canSeeAvatar } from "@/lib/authz/privacy";
import { db } from "@/lib/db";
import { presignDownload } from "@/lib/r2";
import { uuid } from "@/lib/validation/common";

const SIGNED_URL_TTL = 60 * 60;

/**
 * Authorized avatar access: checks the owner's "profile photo" privacy and blocks,
 * then redirects to a short-lived signed R2 URL. Cached privately for less than
 * the signature's lifetime.
 */
export const GET = route<RouteContext<"/api/media/avatar/[userId]">>(async (_req, ctx) => {
  const { user: viewer } = await requireSession();
  const id = uuid.safeParse((await ctx.params).userId);
  if (!id.success) throw new ApiError(404, "not_found", "Not found.");

  const owner = await db.user.findUnique({
    where: { id: id.data },
    select: { id: true, avatarKey: true, avatarAudience: true },
  });
  if (!owner?.avatarKey || !(await canSeeAvatar(viewer.id, owner))) {
    throw new ApiError(404, "not_found", "Not found.");
  }

  const url = await presignDownload(owner.avatarKey, { expiresIn: SIGNED_URL_TTL });
  return NextResponse.redirect(url, {
    status: 302,
    headers: { "Cache-Control": "private, max-age=600" },
  });
});
