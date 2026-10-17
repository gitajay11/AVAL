import { randomUUID } from "node:crypto";
import { json, parseJson, route } from "@/lib/api";
import { requireSession } from "@/lib/auth/session";
import { requireOwnedContact } from "@/lib/authz/contacts";
import { requireGroupAdmin } from "@/lib/groups/service";
import { db } from "@/lib/db";
import { fullAvatarKey, presignUpload } from "@/lib/object-storage";
import { rateLimit } from "@/lib/security/rate-limit";
import { AvatarUploadSchema } from "@/lib/validation/profile";

const EXT: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

/**
 * Step 1 of 2: reserve an upload and return a presigned PUT for exactly this
 * type and size. With `contactId`, the photo is for one of my personal contacts
 * (the key prefix records which, and confirm re-checks ownership). With
 * `chatId`, it's a group photo (admins only, re-checked on confirm too).
 */
export const POST = route(async (req) => {
  const { user } = await requireSession();
  await rateLimit("avatarUpload", user.id);
  const { contentType, size, fullSize, contactId, chatId } = await parseJson(req, AvatarUploadSchema);
  if (contactId) await requireOwnedContact(user.id, contactId);
  if (chatId) await requireGroupAdmin(user.id, chatId);

  const prefix = contactId ? `contacts/${contactId}` : chatId ? `groups/${chatId}` : `avatars/${user.id}`;
  const objectKey = `${prefix}/${randomUUID()}.${EXT[contentType]}`;
  const upload = await db.attachment.create({
    data: { uploaderId: user.id, kind: "AVATAR", objectKey, mimeType: contentType, sizeBytes: size },
    select: { id: true },
  });
  const [main, full] = await Promise.all([
    presignUpload(objectKey, contentType, size),
    fullSize ? presignUpload(fullAvatarKey(objectKey), contentType, fullSize) : null,
  ]);
  return json({ uploadId: upload.id, url: main.url, headers: main.headers, full });
});
