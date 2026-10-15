import "server-only";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { ApiError } from "@/lib/api";
import { requireMembership } from "@/lib/authz/chats";
import { cantSendReason } from "@/lib/chats/service";
import { db } from "@/lib/db";
import { deleteObject, headObject, presignUpload, readHead, UPLOAD_URL_TTL_SECONDS } from "@/lib/r2";
import type { UploadRequestSchema } from "@/lib/validation/chat";
import { extensionFor, MEDIA_LIMITS, MEDIA_TYPES, normalizeMime } from "./policy";
import { bytesMatch } from "./sniff";

type UploadRequest = z.output<typeof UploadRequestSchema>;

/**
 * Step 1: reserve an upload for a chat I can send in, and presign a PUT that
 * only accepts exactly this type and byte length.
 */
export async function createChatUpload(me: { id: string; emailVerified: boolean }, input: UploadRequest) {
  const m = await requireMembership(me.id, input.chatId);
  const reason = await cantSendReason(me, m);
  if (reason) throw new ApiError(403, "not_allowed", reason);

  const mime = normalizeMime(input.contentType);
  if (input.kind !== "FILE" && !MEDIA_TYPES[input.kind].includes(mime)) {
    throw new ApiError(400, "unsupported_type", "That file type isn't supported here. Try sending it as a file.");
  }
  const objectKey = `chats/${m.chat.id}/${randomUUID()}.${input.kind === "FILE" ? "bin" : extensionFor(mime)}`;
  const upload = await db.attachment.create({
    data: {
      uploaderId: me.id,
      kind: input.kind,
      objectKey,
      mimeType: mime,
      sizeBytes: input.size,
      fileName: input.fileName ?? null,
      width: input.width ?? null,
      height: input.height ?? null,
      durationMs: input.durationMs ?? null,
      waveform: input.waveform ?? undefined,
    },
    select: { id: true },
  });
  const { url, headers } = await presignUpload(objectKey, mime, input.size);
  return { uploadId: upload.id, url, headers };
}

/**
 * Step 2: check what actually landed in R2 (exact size, and for media the real
 * file signature) before it can be attached to a message. Mismatches are deleted.
 */
export async function confirmChatUpload(meId: string, uploadId: string) {
  const upload = await db.attachment.findFirst({
    where: { id: uploadId, uploaderId: meId, status: "PENDING", kind: { in: ["IMAGE", "VIDEO", "VOICE", "FILE"] } },
  });
  const maxAgeMs = (UPLOAD_URL_TTL_SECONDS + 15 * 60) * 1000;
  if (!upload || Date.now() - upload.createdAt.getTime() > maxAgeMs) {
    throw new ApiError(404, "upload_not_found", "Upload expired. Please try again.");
  }
  const reject = async (message: string): Promise<never> => {
    await deleteObject(upload.objectKey);
    await db.attachment.delete({ where: { id: upload.id } });
    throw new ApiError(422, "invalid_upload", message);
  };

  const head = await headObject(upload.objectKey);
  if (!head) throw new ApiError(409, "upload_missing", "Upload didn't finish. Please try again.");
  if (head.size !== upload.sizeBytes || head.size > MEDIA_LIMITS[upload.kind as keyof typeof MEDIA_LIMITS]) {
    await reject("File size didn't match.");
  }
  if (upload.kind !== "FILE" && !bytesMatch(upload.mimeType, await readHead(upload.objectKey, 32))) {
    await reject("That file doesn't look like what it claims to be.");
  }
  await db.attachment.update({ where: { id: upload.id }, data: { status: "READY" } });
  return { uploadId: upload.id };
}
