"use client";

import type { MyContactDTO } from "@/lib/contacts/types";
import type { Me } from "@/lib/users";
import { AVATAR_MAX_BYTES } from "@/lib/validation/limits";
import { api, ClientApiError } from "./api";
import { canEncodeWebp, cropToCanvas, resizeCanvas, toBlob } from "./crop";

const SIZE = 512;
const FULL_SIZE = 1080;

/** Center square of an uncropped file (used when there's no crop step, e.g. a drop). */
async function centerSquare(file: File): Promise<HTMLCanvasElement> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const side = Math.min(bitmap.width, bitmap.height);
  const area = { x: (bitmap.width - side) / 2, y: (bitmap.height - side) / 2, width: side, height: side };
  bitmap.close();
  return cropToCanvas(file, area, 0, FULL_SIZE);
}

/**
 * Re-encode as WebP (JPEG on browsers that can't encode WebP), which also strips
 * EXIF/location data: a 512px picture and a 1080px copy for the full-screen viewer.
 */
async function encode(square: HTMLCanvasElement): Promise<{ small: Blob; full: Blob | null }> {
  const type = canEncodeWebp() ? "image/webp" : "image/jpeg";
  const small = await toBlob(resizeCanvas(square, SIZE), type, 0.88);
  // Only worth a second file when the source is bigger than the small one.
  const full = square.width > SIZE ? await toBlob(resizeCanvas(square, FULL_SIZE), type, 0.86) : null;
  return { small, full: full && full.size <= AVATAR_MAX_BYTES ? full : null };
}

/**
 * Presign → PUT straight to object storage → confirm (server verifies size and file signature).
 * `source` is the cropped square from the crop step, or a file to center-crop.
 * With `contactId` / `chatId`, sets a personal contact's or a group's photo instead of mine.
 */
export async function uploadAvatar(
  source: File | HTMLCanvasElement,
  target: { contactId?: string; chatId?: string } = {},
): Promise<{ user?: Me; contact?: MyContactDTO }> {
  if (source instanceof File) {
    if (!source.type.startsWith("image/")) throw new ClientApiError(0, "type", "Choose an image file.");
    if (source.size > 25 * 1024 * 1024) throw new ClientApiError(0, "size", "That image is too large.");
  }

  let blobs: { small: Blob; full: Blob | null };
  try {
    blobs = await encode(source instanceof File ? await centerSquare(source) : source);
  } catch {
    throw new ClientApiError(0, "encode", "Couldn't process that image.");
  }
  const { small, full } = blobs;
  if (small.size > AVATAR_MAX_BYTES) throw new ClientApiError(0, "size", "That image is too large.");

  type Put = { url: string; headers: Record<string, string> };
  const { uploadId, url, headers, full: fullPut } = await api<{ uploadId: string; url: string; headers: Record<string, string>; full: Put | null }>(
    "/api/uploads/avatar",
    { body: { contentType: small.type, size: small.size, ...(full && { fullSize: full.size }), ...target } },
  );

  const [put] = await Promise.all([
    fetch(url, { method: "PUT", headers, body: small }).catch(() => null),
    // The large copy is a nice-to-have: a failure here doesn't fail the change.
    fullPut && full ? fetch(fullPut.url, { method: "PUT", headers: fullPut.headers, body: full }).catch(() => null) : null,
  ]);
  if (!put?.ok) throw new ClientApiError(0, "upload", "Upload failed. Check your connection and try again.");

  return api<{ user?: Me; contact?: MyContactDTO }>("/api/uploads/avatar/confirm", { body: { uploadId } });
}
