import { NextResponse } from "next/server";
import { ApiError, route } from "@/lib/api";
import { requireSession } from "@/lib/auth/session";
import { getMembership } from "@/lib/authz/chats";
import { db } from "@/lib/db";
import { presignDownload } from "@/lib/object-storage";

/** A group's photo, for its members only. */
export const GET = route<RouteContext<"/api/media/group-avatar/[chatId]">>(async (_req, ctx) => {
  const { user } = await requireSession();
  const m = await getMembership(user.id, (await ctx.params).chatId);
  const chat = m?.chat.type === "GROUP" ? await db.chat.findUnique({ where: { id: m.chat.id }, select: { avatarKey: true } }) : null;
  if (!chat?.avatarKey) throw new ApiError(404, "not_found", "Not found.");
  const url = await presignDownload(chat.avatarKey, { expiresIn: 60 * 60 });
  return NextResponse.redirect(url, { status: 302, headers: { "Cache-Control": "private, max-age=600" } });
});
