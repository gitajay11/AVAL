"use client";

import type { MediaKind } from "@/lib/chats/types";
import { kindForFile, MEDIA_LIMITS, normalizeMime } from "@/lib/media/policy";
import { api, ClientApiError } from "./api";

export type PreparedMedia = {
  kind: MediaKind;
  blob: Blob;
  contentType: string;
  fileName: string | null;
  width?: number;
  height?: number;
  durationMs?: number;
  waveform?: number[];
};

const MAX_IMAGE_SIDE = 2560;

/**
 * Images are re-encoded in the browser: large photos are downscaled, and
 * re-encoding drops EXIF metadata (including GPS location). GIFs keep their animation.
 */
async function prepareImage(file: File): Promise<PreparedMedia> {
  const mime = normalizeMime(file.type);
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const { width, height } = bitmap;
  if (mime === "image/gif") {
    bitmap.close();
    return { kind: "IMAGE", blob: file, contentType: mime, fileName: file.name, width, height };
  }
  const scale = Math.min(1, MAX_IMAGE_SIDE / Math.max(width, height));
  const w = Math.round(width * scale);
  const h = Math.round(height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  // Keep PNG for graphics with transparency; everything else becomes JPEG.
  const outType = mime === "image/png" ? "image/png" : "image/jpeg";
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, outType, 0.86));
  if (!blob) throw new ClientApiError(0, "encode", "Couldn't process that image.");
  return { kind: "IMAGE", blob, contentType: outType, fileName: file.name, width: w, height: h };
}

function videoMeta(file: File): Promise<{ width: number; height: number; durationMs: number }> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const v = document.createElement("video");
    v.preload = "metadata";
    v.muted = true;
    const done = (meta: { width: number; height: number; durationMs: number }) => {
      URL.revokeObjectURL(url);
      resolve(meta);
    };
    v.onloadedmetadata = () =>
      done({ width: v.videoWidth || 0, height: v.videoHeight || 0, durationMs: Math.round((v.duration || 0) * 1000) });
    v.onerror = () => done({ width: 0, height: 0, durationMs: 0 });
    v.src = url;
  });
}

/** Turn a picked/pasted/dropped file into something we can upload. */
export async function prepareFile(file: File): Promise<PreparedMedia> {
  const kind = kindForFile(file.type);
  if (kind === "IMAGE") {
    try {
      return await prepareImage(file);
    } catch {
      // Undecodable here (e.g. HEIC on some browsers): send as a file instead.
    }
  }
  if (kind === "VIDEO") {
    const meta = await videoMeta(file);
    return {
      kind,
      blob: file,
      contentType: normalizeMime(file.type),
      fileName: file.name,
      ...(meta.width ? { width: meta.width, height: meta.height } : {}),
      ...(meta.durationMs ? { durationMs: meta.durationMs } : {}),
    };
  }
  return { kind: "FILE", blob: file, contentType: normalizeMime(file.type || "application/octet-stream"), fileName: file.name };
}

/** PUT with progress events (fetch can't report upload progress). */
function putWithProgress(url: string, headers: Record<string, string>, body: Blob, onProgress: (p: number) => void, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    for (const [k, v] of Object.entries(headers)) xhr.setRequestHeader(k, v);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`upload ${xhr.status}`)));
    xhr.onerror = () => reject(new Error("network"));
    xhr.onabort = () => reject(new DOMException("aborted", "AbortError"));
    signal?.addEventListener("abort", () => xhr.abort());
    xhr.send(body);
  });
}

/** Presign → PUT straight to R2 (with progress) → confirm. Returns the upload id to send with the message. */
export async function uploadMedia(
  chatId: string,
  media: PreparedMedia,
  onProgress: (p: number) => void,
  signal?: AbortSignal,
): Promise<string> {
  if (media.blob.size > MEDIA_LIMITS[media.kind]) {
    throw new ClientApiError(0, "size", `That file is too large (max ${Math.round(MEDIA_LIMITS[media.kind] / 1024 / 1024)} MB).`);
  }
  const { uploadId, url, headers } = await api<{ uploadId: string; url: string; headers: Record<string, string> }>("/api/uploads", {
    body: {
      chatId,
      kind: media.kind,
      contentType: media.contentType,
      size: media.blob.size,
      fileName: media.fileName ?? undefined,
      width: media.width,
      height: media.height,
      durationMs: media.durationMs,
      waveform: media.waveform,
    },
    signal,
  });
  try {
    await putWithProgress(url, headers, media.blob, onProgress, signal);
  } catch (err) {
    if ((err as Error).name === "AbortError") throw err;
    throw new ClientApiError(0, "upload", "Upload failed. Check your connection and try again.");
  }
  await api("/api/uploads/confirm", { body: { uploadId }, signal });
  return uploadId;
}
