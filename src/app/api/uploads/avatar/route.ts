import { randomUUID } from "node:crypto";
import { json, parseJson, route } from "@/lib/api";
import { requireSession } from "@/lib/auth/session";
import { requireOwnedContact } from "@/lib/authz/contacts";
import { db } from "@/lib/db";
import { presignUpload } from "@/lib/r2";
import { rateLimit } from "@/lib/security/rate-limit";
import { AvatarUploadSchema } from "@/lib/validation/profile";

const EXT: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

/**
 * Step 1 of 2: reserve an upload and return a presigned PUT for exactly this
 * type and size. With `contactId`, the photo is for one of my personal contacts
 * (the key prefix records which, and confirm re-checks ownership).
 */
export const POST = route(async (req) => {
  const { user } = await requireSession();
  await rateLimit("avatarUpload", user.id);
  const { contentType, size, contactId } = await parseJson(req, AvatarUploadSchema);
  if (contactId) await requireOwnedContact(user.id, contactId);

  const prefix = contactId ? `contacts/${contactId}` : `avatars/${user.id}`;
  const objectKey = `${prefix}/${randomUUID()}.${EXT[contentType]}`;
  const upload = await db.attachment.create({
    data: { uploaderId: user.id, kind: "AVATAR", objectKey, mimeType: contentType, sizeBytes: size },
    select: { id: true },
  });
  const { url, headers } = await presignUpload(objectKey, contentType, size);
  return json({ uploadId: upload.id, url, headers });
});
