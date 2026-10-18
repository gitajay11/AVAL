import { describe, expect, it } from "vitest";
import { generateToken, hashToken } from "@/lib/auth/tokens";
import { sniffMime } from "@/lib/media/sniff";
import { checkOrigin } from "@/lib/security/origin";
import { safeNext } from "@/lib/client/api";

const SELF = "https://aval.example";

describe("checkOrigin (CSRF)", () => {
  it("accepts same-origin requests", () => {
    expect(checkOrigin(new Headers({ origin: SELF }), SELF)).toBe(true);
  });
  it("rejects cross-origin requests", () => {
    expect(checkOrigin(new Headers({ origin: "https://evil.example" }), SELF)).toBe(false);
    expect(checkOrigin(new Headers({ origin: "null" }), SELF)).toBe(false);
  });
  it("falls back to Sec-Fetch-Site when Origin is missing", () => {
    expect(checkOrigin(new Headers({ "sec-fetch-site": "same-origin" }), SELF)).toBe(true);
    expect(checkOrigin(new Headers({ "sec-fetch-site": "cross-site" }), SELF)).toBe(false);
    expect(checkOrigin(new Headers(), SELF)).toBe(false);
  });
});

describe("tokens", () => {
  it("are 43-char base64url and unique", () => {
    const a = generateToken();
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(generateToken()).not.toBe(a);
  });
  it("hash deterministically to sha256 hex", () => {
    expect(hashToken("x")).toBe(hashToken("x"));
    expect(hashToken("x")).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("sniffMime", () => {
  const bytes = (...b: number[]) => new Uint8Array([...b, ...new Array(16).fill(0)]);
  const text = (s: string) => Array.from(s, (c) => c.charCodeAt(0));

  it("detects real image signatures", () => {
    expect(sniffMime(bytes(0xff, 0xd8, 0xff, 0xe0))).toBe("image/jpeg");
    expect(sniffMime(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a))).toBe("image/png");
    expect(sniffMime(bytes(...text("RIFF"), 0, 0, 0, 0, ...text("WEBP")))).toBe("image/webp");
  });
  it("rejects disguised files", () => {
    expect(sniffMime(bytes(...text("<svg xmlns")))).toBeNull();
    expect(sniffMime(bytes(...text("<html>")))).toBeNull();
    expect(sniffMime(bytes(0x4d, 0x5a))).toBeNull(); // Windows executable
  });
});

describe("safeNext (open-redirect guard)", () => {
  it("allows same-site paths", () => {
    expect(safeNext("/settings")).toBe("/settings");
  });
  it("rejects absolute and protocol-relative URLs", () => {
    expect(safeNext("https://evil.example")).toBe("/chats");
    expect(safeNext("//evil.example")).toBe("/chats");
    expect(safeNext("/\\evil.example")).toBe("/chats");
    expect(safeNext(null)).toBe("/chats");
  });
});

describe("E2E_NO_RATE_LIMITS", () => {
  it("is ignored in production builds", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync(new URL("../src/lib/security/rate-limit.ts", import.meta.url), "utf8");
    expect(src).toMatch(/const testRunWithoutLimits = !IS_PROD && process\.env\.E2E_NO_RATE_LIMITS === "1";/);
  });
});
