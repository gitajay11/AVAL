import { randomBytes } from "node:crypto";

/**
 * RFC 9562 UUIDv7: 48-bit Unix-ms timestamp, then random bits. Same shape as
 * the ids Prisma generates for `@default(uuid(7))`, for rows inserted with raw SQL.
 */
export function uuidv7(now = Date.now()): string {
  const b = randomBytes(16);
  // 48-bit big-endian millisecond timestamp (exact in a double up to 2^53).
  let ts = now;
  for (let i = 5; i >= 0; i--) {
    b[i] = ts % 256;
    ts = Math.floor(ts / 256);
  }
  b[6] = (b[6] & 0x0f) | 0x70; // version 7
  b[8] = (b[8] & 0x3f) | 0x80; // RFC variant
  const h = b.toString("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
