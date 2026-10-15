// What may be uploaded to a chat, per kind. Shared by the client (to pick a kind
// and fail fast) and the server (which enforces it, and re-checks the bytes).

import type { MediaKind } from "@/lib/chats/types";

const MB = 1024 * 1024;

export const MEDIA_LIMITS: Record<MediaKind, number> = {
  IMAGE: 20 * MB,
  VIDEO: 100 * MB,
  VOICE: 10 * MB,
  FILE: 100 * MB,
};

/** Accepted declared types per kind (FILE accepts anything; it's always served as a download). */
export const MEDIA_TYPES: Record<Exclude<MediaKind, "FILE">, readonly string[]> = {
  IMAGE: ["image/jpeg", "image/png", "image/webp", "image/gif"],
  VIDEO: ["video/mp4", "video/webm", "video/quicktime"],
  VOICE: ["audio/webm", "audio/ogg", "audio/mp4", "audio/mpeg"],
};

const EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "video/mp4": "mp4",
  "video/webm": "webm",
  "video/quicktime": "mov",
  "audio/webm": "weba",
  "audio/ogg": "ogg",
  "audio/mp4": "m4a",
  "audio/mpeg": "mp3",
};

export function extensionFor(mime: string): string {
  return EXT[mime] ?? "bin";
}

/** Strip codec parameters and anything that isn't a plain type/subtype. */
export function normalizeMime(raw: string): string {
  const base = raw.split(";")[0].trim().toLowerCase();
  return /^[a-z0-9.+-]+\/[a-z0-9.+-]+$/.test(base) ? base : "application/octet-stream";
}

/** The kind a picked file should be sent as. */
export function kindForFile(mime: string): MediaKind {
  const m = normalizeMime(mime);
  if (MEDIA_TYPES.IMAGE.includes(m)) return "IMAGE";
  if (MEDIA_TYPES.VIDEO.includes(m)) return "VIDEO";
  return "FILE";
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < MB) return `${(n / 1024).toFixed(n < 10 * 1024 ? 1 : 0)} KB`;
  return `${(n / MB).toFixed(n < 10 * MB ? 1 : 0)} MB`;
}
