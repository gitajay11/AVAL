"use client";

import type { Me } from "@/lib/users";
import { AVATAR_MAX_BYTES } from "@/lib/validation/profile";
import { api, ClientApiError } from "./api";

const OUTPUT_SIZE = 512;

/** Center-crop to a square and re-encode as WebP, which also strips EXIF/location data. */
async function toSquareWebp(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const side = Math.min(bitmap.width, bitmap.height);
  const size = Math.min(OUTPUT_SIZE, side);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, size, size);
  bitmap.close();
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/webp", 0.88));
  if (!blob || blob.type !== "image/webp") {
    // Very old Safari can't encode WebP: fall back to JPEG.
    const jpeg = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.9));
    if (!jpeg) throw new ClientApiError(0, "encode", "Couldn't process that image.");
    return jpeg;
  }
  return blob;
}

/** Presign → PUT straight to R2 → confirm (server verifies size and file signature). */
export async function uploadAvatar(file: File): Promise<Me> {
  if (!file.type.startsWith("image/")) throw new ClientApiError(0, "type", "Choose an image file.");
  if (file.size > 25 * 1024 * 1024) throw new ClientApiError(0, "size", "That image is too large.");

  const blob = await toSquareWebp(file);
  if (blob.size > AVATAR_MAX_BYTES) throw new ClientApiError(0, "size", "That image is too large.");

  const { uploadId, url, headers } = await api<{ uploadId: string; url: string; headers: Record<string, string> }>(
    "/api/uploads/avatar",
    { body: { contentType: blob.type, size: blob.size } },
  );

  const put = await fetch(url, { method: "PUT", headers, body: blob }).catch(() => null);
  if (!put?.ok) throw new ClientApiError(0, "upload", "Upload failed. Check your connection and try again.");

  const { user } = await api<{ user: Me }>("/api/uploads/avatar/confirm", { body: { uploadId } });
  return user;
}
