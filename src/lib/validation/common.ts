import { z } from "zod";

// Bidi embedding/override/isolate controls (U+202A to U+202E, U+2066 to U+2069), used
// to visually spoof text. Listed by code point to keep invisible characters out of the source.
const BIDI_CONTROLS = new Set([0x202a, 0x202b, 0x202c, 0x202d, 0x202e, 0x2066, 0x2067, 0x2068, 0x2069]);

function isUnsafe(code: number): boolean {
  if (code === 0x09 || code === 0x0a || code === 0x0d) return false; // tab, newline, CR
  return code < 0x20 || code === 0x7f || BIDI_CONTROLS.has(code);
}

/** Normalize to NFC and strip control and bidi-override characters. */
export function cleanText(value: string): string {
  let out = "";
  for (const ch of value.normalize("NFC")) {
    if (!isUnsafe(ch.codePointAt(0)!)) out += ch;
  }
  return out.replace(/\r\n?/g, "\n");
}

/** Single-line text: cleaned, whitespace collapsed, trimmed. */
export const singleLine = (max: number) =>
  z
    .string()
    .transform((v) => cleanText(v).replace(/\s+/g, " ").trim())
    .pipe(z.string().max(max));

/** Multi-line text: cleaned, trimmed, at most two consecutive blank lines. */
export const multiLine = (max: number) =>
  z
    .string()
    .transform((v) => cleanText(v).replace(/\n{3,}/g, "\n\n").trim())
    .pipe(z.string().max(max));

export const uuid = z.uuid();
