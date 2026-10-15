import { describe, expect, it } from "vitest";
import { snippetOf } from "@/components/chats/message-snippet";
import { firstUrl, parseMeta } from "@/lib/link-meta";
import { kindForFile, normalizeMime } from "@/lib/media/policy";
import { bytesMatch, sniffMime } from "@/lib/media/sniff";
import { isPrivateAddress } from "@/lib/security/ip";
import { ChatSettingsSchema, isSingleEmoji, ReportSchema, SendMessageSchema, UploadRequestSchema } from "@/lib/validation/chat";

const UUID = "01a14118-42b6-7624-bfed-2c078e518157";

describe("isPrivateAddress (SSRF guard)", () => {
  it.each(["127.0.0.1", "10.1.2.3", "172.16.0.1", "172.31.255.255", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "224.0.0.1", "::1", "::", "fe80::1", "fd00::1", "::ffff:127.0.0.1", "::ffff:10.0.0.1", "not-an-ip"])(
    "blocks %s",
    (ip) => expect(isPrivateAddress(ip)).toBe(true),
  );
  it.each(["93.184.216.34", "1.1.1.1", "172.32.0.1", "2606:4700:4700::1111", "::ffff:8.8.8.8"])("allows %s", (ip) =>
    expect(isPrivateAddress(ip)).toBe(false),
  );
});

describe("link previews", () => {
  it("finds the first http(s) link and normalizes www.", () => {
    expect(firstUrl("see https://example.com/a?b=1, ok")).toBe("https://example.com/a?b=1");
    expect(firstUrl("go to www.example.org.")).toBe("https://www.example.org");
    expect(firstUrl("javascript:alert(1) ftp://x")).toBeNull();
  });
  it("reads Open Graph metadata with entity decoding and fallbacks", () => {
    const html = `<html><head><title>Fallback</title>
      <meta content="Tom &amp; Jerry &#8212; best" property="og:title">
      <meta name='description' content='A  short   description'>
      <meta property="og:image" content="/img.png"></head></html>`;
    expect(parseMeta(html)).toEqual({
      title: "Tom & Jerry — best",
      description: "A short description",
      siteName: null,
      image: "/img.png",
    });
    expect(parseMeta("<title>Only title</title>").title).toBe("Only title");
  });
});

describe("media signatures", () => {
  const head = (...b: number[]) => new Uint8Array([...b, ...new Array(32).fill(0)]);
  const ascii = (s: string) => Array.from(s, (c) => c.charCodeAt(0));
  it("recognises containers", () => {
    expect(sniffMime(head(0x1a, 0x45, 0xdf, 0xa3))).toBe("video/webm");
    expect(sniffMime(head(0, 0, 0, 0x18, ...ascii("ftypisom")))).toBe("video/mp4");
    expect(sniffMime(head(0, 0, 0, 0x18, ...ascii("ftypqt  ")))).toBe("video/quicktime");
    expect(sniffMime(head(...ascii("OggS")))).toBe("audio/ogg");
  });
  it("matches audio and video that share a container", () => {
    expect(bytesMatch("audio/webm", head(0x1a, 0x45, 0xdf, 0xa3))).toBe(true);
    expect(bytesMatch("audio/mp4", head(0, 0, 0, 0x18, ...ascii("ftypM4A ")))).toBe(true);
    expect(bytesMatch("image/png", head(...ascii("<html>")))).toBe(false);
    expect(bytesMatch("video/mp4", head(0xff, 0xd8, 0xff))).toBe(false);
  });
  it("picks a kind and normalizes types", () => {
    expect(kindForFile("image/jpeg")).toBe("IMAGE");
    expect(kindForFile("video/mp4")).toBe("VIDEO");
    expect(kindForFile("image/svg+xml")).toBe("FILE"); // never rendered inline
    expect(kindForFile("application/pdf")).toBe("FILE");
    expect(normalizeMime("audio/webm;codecs=opus")).toBe("audio/webm");
    expect(normalizeMime("text/html\r\nX-Evil: 1")).toBe("application/octet-stream");
  });
});

describe("message validation", () => {
  it("allows a caption-less attachment but not an empty message", () => {
    expect(SendMessageSchema.safeParse({ clientId: "abcd1234", attachmentId: UUID }).success).toBe(true);
    expect(SendMessageSchema.safeParse({ clientId: "abcd1234", text: "  " }).success).toBe(false);
  });
  it("accepts exactly one emoji as a reaction", () => {
    for (const e of ["👍", "❤️", "👍🏽", "👨‍👩‍👧", "🏳️‍🌈"]) expect(isSingleEmoji(e)).toBe(true);
    for (const e of ["👍👍", "a", "😀x", ""]) expect(isSingleEmoji(e)).toBe(false);
  });
  it("caps upload sizes per kind", () => {
    const base = { chatId: UUID, contentType: "video/mp4" };
    expect(UploadRequestSchema.safeParse({ ...base, kind: "VIDEO", size: 100 * 1024 * 1024 }).success).toBe(true);
    expect(UploadRequestSchema.safeParse({ ...base, kind: "VIDEO", size: 100 * 1024 * 1024 + 1 }).success).toBe(false);
    expect(UploadRequestSchema.safeParse({ ...base, kind: "VOICE", contentType: "audio/webm", size: 11 * 1024 * 1024 }).success).toBe(false);
    expect(UploadRequestSchema.safeParse({ ...base, kind: "IMAGE", size: 10, waveform: [40] }).success).toBe(false);
  });
  it("validates chat settings and reports", () => {
    expect(ChatSettingsSchema.safeParse({ mute: "8h", pinned: true }).success).toBe(true);
    expect(ChatSettingsSchema.safeParse({ mute: "1y" }).success).toBe(false);
    expect(ReportSchema.safeParse({ reason: "SPAM" }).success).toBe(false);
    expect(ReportSchema.safeParse({ reason: "SPAM", targetUserId: UUID }).success).toBe(true);
  });
});

describe("snippetOf", () => {
  it("labels media and keeps captions", () => {
    expect(snippetOf({ type: "IMAGE", text: "beach", deleted: false })).toBe("📷 Photo · beach");
    expect(snippetOf({ type: "VOICE", text: null, deleted: false })).toBe("🎤 Voice message");
    expect(snippetOf({ type: "TEXT", text: "hi", deleted: true })).toBe("Message deleted");
  });
});
