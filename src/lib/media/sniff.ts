/**
 * Detect a file's real type from its first bytes. The declared Content-Type is
 * client-controlled, so uploads are only accepted when the bytes agree with it.
 */
const SIGNATURES: { mime: string; offset: number; bytes: number[] }[] = [
  { mime: "image/jpeg", offset: 0, bytes: [0xff, 0xd8, 0xff] },
  { mime: "image/png", offset: 0, bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  { mime: "image/gif", offset: 0, bytes: [0x47, 0x49, 0x46, 0x38] },
];

function matchAt(head: Uint8Array, offset: number, bytes: number[]): boolean {
  return bytes.every((b, i) => head[offset + i] === b);
}

const ascii = (head: Uint8Array, from: number, to: number) => String.fromCharCode(...head.slice(from, to));

export function sniffMime(head: Uint8Array): string | null {
  for (const sig of SIGNATURES) if (matchAt(head, sig.offset, sig.bytes)) return sig.mime;
  if (ascii(head, 0, 4) === "RIFF" && ascii(head, 8, 12) === "WEBP") return "image/webp";
  return null;
}
