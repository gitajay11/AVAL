import { describe, expect, it } from "vitest";
import { decodeCursor, encodeCursor } from "@/lib/chats/cursor";
import { buildTimeline, isJumboEmoji, messageKey, upsertSorted, type UiMessage } from "@/lib/chats/timeline";
import { SendMessageSchema, UserSearchSchema } from "@/lib/validation/chat";

const ME = "00000000-0000-7000-8000-000000000001";
const PEER = "00000000-0000-7000-8000-000000000002";

let seq = 0;
function msg(over: Partial<UiMessage> & { createdAt: string }): UiMessage {
  seq++;
  return {
    id: `00000000-0000-7000-8000-${String(seq).padStart(12, "0")}`,
    chatId: "c",
    senderId: PEER,
    clientId: null,
    type: "TEXT",
    text: `m${seq}`,
    editedAt: null,
    deleted: false,
    status: "sent",
    ...over,
  };
}

describe("cursor", () => {
  it("round-trips (createdAt, id)", () => {
    const c = { createdAt: new Date("2026-10-15T19:44:34.538Z"), id: "01a14118-4eea-74ea-9c78-cbe413046311" };
    expect(decodeCursor(encodeCursor(c))).toEqual(c);
  });
  it("rejects garbage and tampering", () => {
    expect(decodeCursor("zzz")).toBeNull();
    expect(decodeCursor("not base64 !!")).toBeNull();
    expect(decodeCursor(btoa("2026-01-01T00:00:00Z|'; drop table messages"))).toBeNull();
    expect(decodeCursor(null)).toBeNull();
  });
});

describe("buildTimeline", () => {
  it("adds day separators and groups consecutive messages from one sender", () => {
    const a = msg({ createdAt: "2026-10-14T10:00:00.000Z" });
    const b = msg({ createdAt: "2026-10-14T10:01:00.000Z" });
    const c = msg({ createdAt: "2026-10-14T10:30:00.000Z" }); // > 5 min later: new group
    const d = msg({ createdAt: "2026-10-15T10:00:00.000Z", senderId: ME });
    const items = buildTimeline([a, b, c, d], { meId: ME, unreadAfter: null });
    const kinds = items.map((i) => i.kind);
    expect(kinds.filter((k) => k === "day")).toHaveLength(2);
    const rows = items.filter((i) => i.kind === "message");
    expect(rows.map((r) => [r.groupStart, r.groupEnd])).toEqual([
      [true, false],
      [false, true],
      [true, true],
      [true, true],
    ]);
  });

  it("puts the unread divider before the first incoming message after the watermark", () => {
    const old = msg({ createdAt: "2026-10-15T09:00:00.000Z" });
    const mine = msg({ createdAt: "2026-10-15T09:10:00.000Z", senderId: ME });
    const fresh = msg({ createdAt: "2026-10-15T09:20:00.000Z" });
    const items = buildTimeline([old, mine, fresh], { meId: ME, unreadAfter: "2026-10-15T09:05:00.000Z" });
    const idx = items.findIndex((i) => i.kind === "unread");
    expect(items[idx + 1]).toMatchObject({ kind: "message", message: { id: fresh.id } });
    expect(items.filter((i) => i.kind === "unread")).toHaveLength(1);
  });

  it("has no unread divider when nothing is unread", () => {
    const items = buildTimeline([msg({ createdAt: "2026-10-15T09:00:00.000Z" })], { meId: ME, unreadAfter: null });
    expect(items.some((i) => i.kind === "unread")).toBe(false);
  });
});

describe("messageKey", () => {
  it("is the same for the optimistic and the confirmed copy of my message", () => {
    const pending = { id: "pending-abc", clientId: "abc123456", senderId: ME };
    const confirmed = { id: "01a14118-4eea-74ea-9c78-cbe413046311", clientId: "abc123456", senderId: ME };
    expect(messageKey(pending)).toBe(messageKey(confirmed));
  });
});

describe("upsertSorted", () => {
  it("inserts in (createdAt, id) order and replaces by id", () => {
    const a = msg({ createdAt: "2026-10-15T09:00:00.000Z" });
    const c = msg({ createdAt: "2026-10-15T09:02:00.000Z" });
    const b = msg({ createdAt: "2026-10-15T09:01:00.000Z" });
    let list = upsertSorted(upsertSorted([], a), c);
    list = upsertSorted(list, b);
    expect(list.map((m) => m.id)).toEqual([a.id, b.id, c.id]);
    list = upsertSorted(list, { ...b, text: "edited" });
    expect(list).toHaveLength(3);
    expect(list[1].text).toBe("edited");
  });
});

describe("isJumboEmoji", () => {
  it.each(["🎉", "🎉🎉", "👍🏽", "❤️ 🔥", "👨‍👩‍👧"])("treats %s as jumbo", (t) => expect(isJumboEmoji(t)).toBe(true));
  it.each(["hi 🎉", "🎉🎉🎉🎉", "123", "", null])("treats %s as text", (t) => expect(isJumboEmoji(t)).toBe(false));
});

describe("chat validation", () => {
  it("normalizes search queries", () => {
    expect(UserSearchSchema.parse("  @Grace.H ")).toBe("grace.h");
    expect(UserSearchSchema.safeParse("grace hopper").success).toBe(false);
    expect(UserSearchSchema.safeParse("' or 1=1 --").success).toBe(false);
  });
  it("requires non-empty text and a well-formed client id", () => {
    expect(SendMessageSchema.safeParse({ clientId: "abcd1234", text: "   " }).success).toBe(false);
    expect(SendMessageSchema.safeParse({ clientId: "x", text: "hi" }).success).toBe(false);
    expect(SendMessageSchema.parse({ clientId: "abcd1234", text: "  hi\n\n\n\nthere " }).text).toBe("hi\n\nthere");
    expect(SendMessageSchema.safeParse({ clientId: "abcd1234", text: "x".repeat(4097) }).success).toBe(false);
  });
});
