import { ApiError, json, parseJson, route } from "@/lib/api";
import { requireSession } from "@/lib/auth/session";
import { requireOwnedContact } from "@/lib/authz/contacts";
import { getContactDetail } from "@/lib/contacts/service";
import { groupPhotoChanged, requireGroupAdmin } from "@/lib/groups/service";
import { db } from "@/lib/db";
import { sniffMime } from "@/lib/media/sniff";
import { deleteObject, fullAvatarKey, headObject, readHead, UPLOAD_URL_TTL_SECONDS } from "@/lib/object-storage";
import { meSelect, toMe } from "@/lib/users";
import { AVATAR_MAX_BYTES, ConfirmUploadSchema } from "@/lib/validation/profile";

/**
 * Step 2 of 2: verify what actually landed in storage (size and real file signature)
 * before it becomes the user's avatar. Anything that doesn't match is deleted.
 */
export const POST = route(async (req) => {
  const { user } = await requireSession();
  const { uploadId } = await parseJson(req, ConfirmUploadSchema);

  const upload = await db.attachment.findFirst({
    where: { id: uploadId, uploaderId: user.id, kind: "AVATAR", status: "PENDING" },
  });
  const maxAgeMs = (UPLOAD_URL_TTL_SECONDS + 10 * 60) * 1000;
  if (!upload || Date.now() - upload.createdAt.getTime() > maxAgeMs) {
    throw new ApiError(404, "upload_not_found", "Upload expired. Please try again.");
  }

  const reject = async (message: string) => {
    await deleteObject(upload.objectKey);
    await db.attachment.delete({ where: { id: upload.id } });
    throw new ApiError(422, "invalid_upload", message);
  };

  const head = await headObject(upload.objectKey);
  if (!head) throw new ApiError(409, "upload_missing", "Upload didn't finish. Please try again.");
  if (head.size !== upload.sizeBytes || head.size > AVATAR_MAX_BYTES) await reject("File size didn't match.");
  if (sniffMime(await readHead(upload.objectKey)) !== upload.mimeType) await reject("That file isn't a valid image.");
  // The optional full-size copy gets the same checks; a bad one is dropped (the 512px picture still works).
  const fullKey = fullAvatarKey(upload.objectKey);
  const full = await headObject(fullKey);
  if (full && (full.size > AVATAR_MAX_BYTES || sniffMime(await readHead(fullKey)) !== upload.mimeType)) {
    await deleteObject(fullKey);
  }

  // A contact's photo: the contact id is in the key; ownership is re-checked now.
  if (upload.objectKey.startsWith("contacts/")) {
    const contactId = upload.objectKey.split("/")[1];
    const contact = await requireOwnedContact(user.id, contactId);
    await db.$transaction([
      db.attachment.update({ where: { id: upload.id }, data: { status: "READY" } }),
      db.personalContact.update({ where: { id: contactId }, data: { avatarKey: upload.objectKey } }),
      ...(contact.avatarKey ? [db.attachment.deleteMany({ where: { objectKey: contact.avatarKey } })] : []),
    ]);
    if (contact.avatarKey) await deleteObject(contact.avatarKey);
    return json({ contact: (await getContactDetail(user.id, contactId)).contact });
  }

  // A group photo: admin rights are re-checked now.
  if (upload.objectKey.startsWith("groups/")) {
    const chatId = upload.objectKey.split("/")[1];
    await requireGroupAdmin(user.id, chatId);
    const before = await db.chat.findUniqueOrThrow({ where: { id: chatId }, select: { avatarKey: true } });
    await db.$transaction([
      db.attachment.update({ where: { id: upload.id }, data: { status: "READY" } }),
      db.chat.update({ where: { id: chatId }, data: { avatarKey: upload.objectKey } }),
      ...(before.avatarKey ? [db.attachment.deleteMany({ where: { objectKey: before.avatarKey } })] : []),
    ]);
    if (before.avatarKey) await deleteObject(before.avatarKey);
    await groupPhotoChanged(user, chatId);
    return json({ ok: true });
  }

  const previous = await db.user.findUniqueOrThrow({ where: { id: user.id }, select: { avatarKey: true } });
  const [, row] = await db.$transaction([
    db.attachment.update({ where: { id: upload.id }, data: { status: "READY" } }),
    db.user.update({ where: { id: user.id }, data: { avatarKey: upload.objectKey }, select: meSelect }),
    ...(previous.avatarKey ? [db.attachment.deleteMany({ where: { objectKey: previous.avatarKey } })] : []),
  ]);
  if (previous.avatarKey) await deleteObject(previous.avatarKey);

  return json({ user: toMe(row) });
});
