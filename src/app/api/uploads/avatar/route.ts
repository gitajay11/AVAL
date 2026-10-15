import { randomUUID } from "node:crypto";
import { json, parseJson, route } from "@/lib/api";
import { requireSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { presignUpload } from "@/lib/r2";
import { rateLimit } from "@/lib/security/rate-limit";
import { AvatarUploadSchema } from "@/lib/validation/profile";

const EXT: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

/** Step 1 of 2: reserve an upload and return a presigned PUT for exactly this type and size. */
export const POST = route(async (req) => {
  const { user } = await requireSession();
  await rateLimit("avatarUpload", user.id);
  const { contentType, size } = await parseJson(req, AvatarUploadSchema);

  const objectKey = `avatars/${user.id}/${randomUUID()}.${EXT[contentType]}`;
  const upload = await db.attachment.create({
    data: { uploaderId: user.id, kind: "AVATAR", objectKey, mimeType: contentType, sizeBytes: size },
    select: { id: true },
  });
  const { url, headers } = await presignUpload(objectKey, contentType, size);
  return json({ uploadId: upload.id, url, headers });
});
