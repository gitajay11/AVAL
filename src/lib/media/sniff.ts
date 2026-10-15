/**
 * Detect a file's real type from its first bytes. The declared Content-Type is
 * client-controlled, so media is only accepted when the bytes agree with it.
 */
const SIGNATURES: { mime: string; offset: number; bytes: number[] }[] = [
  { mime: "image/jpeg", offset: 0, bytes: [0xff, 0xd8, 0xff] },
  { mime: "image/png", offset: 0, bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  { mime: "image/gif", offset: 0, bytes: [0x47, 0x49, 0x46, 0x38] },
  { mime: "audio/ogg", offset: 0, bytes: [0x4f, 0x67, 0x67, 0x53] }, // "OggS"
  { mime: "audio/mpeg", offset: 0, bytes: [0x49, 0x44, 0x33] }, // "ID3"
];

function matchAt(head: Uint8Array, offset: number, bytes: number[]): boolean {
  return bytes.every((b, i) => head[offset + i] === b);
}

const ascii = (head: Uint8Array, from: number, to: number) => String.fromCharCode(...head.slice(from, to));

/** Best-effort identification; null when unrecognised. */
export function sniffMime(head: Uint8Array): string | null {
  for (const sig of SIGNATURES) if (matchAt(head, sig.offset, sig.bytes)) return sig.mime;
  if (ascii(head, 0, 4) === "RIFF" && ascii(head, 8, 12) === "WEBP") return "image/webp";
  if (matchAt(head, 0, [0x1a, 0x45, 0xdf, 0xa3])) return "video/webm"; // EBML (WebM/Matroska)
  if (ascii(head, 4, 8) === "ftyp") {
    const brand = ascii(head, 8, 12);
    if (brand === "qt  ") return "video/quicktime";
    if (brand.startsWith("M4A")) return "audio/mp4";
    return "video/mp4";
  }
  if (head[0] === 0xff && (head[1] & 0xe0) === 0xe0) return "audio/mpeg"; // MPEG frame sync
  return null;
}

/**
 * Whether the bytes are acceptable for the declared type. Containers are
 * shared between audio and video (WebM, MP4), so those match by family.
 */
export function bytesMatch(declared: string, head: Uint8Array): boolean {
  const actual = sniffMime(head);
  if (!actual) return false;
  if (actual === declared) return true;
  const family = (m: string) =>
    m === "video/webm" || m === "audio/webm"
      ? "webm"
      : m === "video/mp4" || m === "audio/mp4" || m === "video/quicktime"
        ? "mp4"
        : m;
  return family(actual) === family(declared);
}
