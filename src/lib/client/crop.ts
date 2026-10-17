"use client";

export type CropArea = { x: number; y: number; width: number; height: number };

/** Whether this browser can encode WebP (Safari before 17 can't; it falls back to JPEG). */
let webp: boolean | null = null;
export function canEncodeWebp(): boolean {
  if (webp === null) {
    const c = document.createElement("canvas");
    c.width = c.height = 1;
    webp = c.toDataURL("image/webp").startsWith("data:image/webp");
  }
  return webp;
}

export function toBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("encode"))), type, quality));
}

/**
 * Draw `area` of the image (in source pixels, after `rotation` degrees about its
 * centre, as react-easy-crop reports it) onto a canvas no larger than `maxSide`.
 */
export async function cropToCanvas(src: string | Blob, area: CropArea, rotation: number, maxSide: number): Promise<HTMLCanvasElement> {
  const bitmap = await createImageBitmap(typeof src === "string" ? await (await fetch(src)).blob() : src, { imageOrientation: "from-image" });
  const rad = (rotation * Math.PI) / 180;
  const sin = Math.abs(Math.sin(rad));
  const cos = Math.abs(Math.cos(rad));
  // The rotated image's bounding box: the crop area is measured in it.
  const bw = bitmap.width * cos + bitmap.height * sin;
  const bh = bitmap.width * sin + bitmap.height * cos;
  const scale = Math.min(1, maxSide / Math.max(area.width, area.height));
  const out = document.createElement("canvas");
  out.width = Math.max(1, Math.round(area.width * scale));
  out.height = Math.max(1, Math.round(area.height * scale));
  const ctx = out.getContext("2d")!;
  ctx.imageSmoothingQuality = "high";
  ctx.scale(scale, scale);
  ctx.translate(-area.x, -area.y);
  ctx.translate(bw / 2, bh / 2);
  ctx.rotate(rad);
  ctx.drawImage(bitmap, -bitmap.width / 2, -bitmap.height / 2);
  bitmap.close();
  return out;
}

/** Downscale a canvas (for the second, smaller size of an avatar). */
export function resizeCanvas(src: HTMLCanvasElement, maxSide: number): HTMLCanvasElement {
  const scale = Math.min(1, maxSide / Math.max(src.width, src.height));
  if (scale === 1) return src;
  const out = document.createElement("canvas");
  out.width = Math.round(src.width * scale);
  out.height = Math.round(src.height * scale);
  const ctx = out.getContext("2d")!;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(src, 0, 0, out.width, out.height);
  return out;
}
