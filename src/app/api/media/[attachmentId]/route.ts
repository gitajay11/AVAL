import { NextResponse } from "next/server";
import { ApiError, route } from "@/lib/api";
import { requireSession } from "@/lib/auth/session";
import { accessClearedAt, getChatAccess } from "@/lib/authz/contacts";
import { db } from "@/lib/db";
import { presignDownload } from "@/lib/r2";
import { uuid } from "@/lib/validation/common";

const SIGNED_URL_TTL = 60 * 60;
const INLINE_KINDS = new Set(["IMAGE", "VIDEO", "VOICE", "LINK_PREVIEW"]);

/**
 * Authorized media access: members of the message's chat (or approved viewers
 * of a shared contact), only while the message exists and isn't hidden for the
 * viewer. Redirects to a short-lived signed R2 URL. Files are always served as
 * downloads; `?download=1` forces a download for media too. Viewers are
 * view-only: no downloads and no files.
 */
export const GET = route<RouteContext<"/api/media/[attachmentId]">>(async (req, ctx) => {
  const { user } = await requireSession();
  const id = uuid.safeParse((await ctx.params).attachmentId);
  const a = id.success
    ? await db.attachment.findUnique({
        where: { id: id.data },
        select: {
          objectKey: true,
          kind: true,
          mimeType: true,
          fileName: true,
          status: true,
          message: {
            select: { chatId: true, deletedAt: true, createdAt: true, hiddenFor: { where: { userId: user.id }, select: { userId: true } } },
          },
        },
      })
    : null;
  const access = a?.message ? await getChatAccess(user.id, a.message.chatId) : null;
  const clearedAt = access ? accessClearedAt(access) : null;
  const visible =
    a?.status === "READY" &&
    a.message &&
    access &&
    !a.message.deletedAt &&
    a.message.hiddenFor.length === 0 &&
    !(clearedAt && a.message.createdAt <= clearedAt);
  if (!a || !visible) throw new ApiError(404, "not_found", "Not found.");

  const download = req.nextUrl.searchParams.get("download") === "1" || !INLINE_KINDS.has(a.kind);
  if (download && access!.kind === "viewer") {
    throw new ApiError(403, "view_only", "Shared contacts are view-only.");
  }
  const url = await presignDownload(a.objectKey, {
    expiresIn: SIGNED_URL_TTL,
    contentType: download ? "application/octet-stream" : a.mimeType,
    downloadName: download ? (a.fileName ?? `aval-${id.data!.slice(0, 8)}`) : undefined,
  });
  return NextResponse.redirect(url, { status: 302, headers: { "Cache-Control": "private, max-age=3000" } });
});
