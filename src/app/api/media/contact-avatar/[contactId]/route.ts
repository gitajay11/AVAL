import { NextResponse } from "next/server";
import { ApiError, route } from "@/lib/api";
import { requireSession } from "@/lib/auth/session";
import { contactWithRole } from "@/lib/authz/contacts";
import { presignAvatar } from "@/lib/object-storage";

/**
 * A contact's photo: for its owner, its viewers, and (while public) anyone,
 * since public contacts show name and avatar in search. Private: 404.
 */
export const GET = route<RouteContext<"/api/media/contact-avatar/[contactId]">>(async (req, ctx) => {
  const { user } = await requireSession();
  const r = await contactWithRole(user.id, (await ctx.params).contactId);
  if (!r || r.role === "hidden" || !r.contact.avatarKey) throw new ApiError(404, "not_found", "Not found.");
  const url = await presignAvatar(r.contact.avatarKey, new URL(req.url).searchParams.get("size"), 60 * 60);
  return NextResponse.redirect(url, { status: 302, headers: { "Cache-Control": "private, max-age=600" } });
});
