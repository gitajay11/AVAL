import { describe, expect, it } from "vitest";
import { SignInSchema, SignUpSchema, dateOfBirth, usernameProblem } from "@/lib/validation/auth";
import { UpdateSettingsSchema } from "@/lib/validation/profile";
import { cleanText } from "@/lib/validation/common";

describe("usernameProblem", () => {
  it.each(["abc", "john_doe", "j.doe", "a1b2c3", "x".repeat(20), "UPPER"])("accepts %s", (u) => {
    expect(usernameProblem(u)).toBeNull();
  });

  it.each([
    ["ab", "At least 3"],
    ["x".repeat(21), "At most 20"],
    ["john-doe", "Only letters"],
    ["jo hn", "Only letters"],
    ["émile", "Only letters"],
    ["admin", "reserved"],
    ["Support", "reserved"],
  ])("rejects %s", (u, msg) => {
    expect(usernameProblem(u)).toContain(msg);
  });
});

describe("SignUpSchema", () => {
  const base = { username: "Ada.L", email: "  Ada@Example.com ", password: "correct horse", displayName: "  Ada   Lovelace " };

  it("normalizes username to lowercase and trims fields", () => {
    const out = SignUpSchema.parse(base);
    expect(out.username).toBe("ada.l");
    expect(out.email).toBe("Ada@Example.com");
    expect(out.displayName).toBe("Ada Lovelace");
  });

  it("rejects a password equal to the username", () => {
    const same = SignUpSchema.safeParse({ ...base, username: "password1", password: "Password1" });
    expect(same.success).toBe(false);
  });

  it("requires 8+ character passwords", () => {
    expect(SignUpSchema.safeParse({ ...base, password: "short" }).success).toBe(false);
  });

  it("strips control and bidi characters from display names", () => {
    const rlo = String.fromCodePoint(0x202e);
    const out = SignUpSchema.parse({ ...base, displayName: `Ada${rlo}\u0000 Lovelace` });
    expect(out.displayName).toBe("Ada Lovelace");
  });
});

describe("SignInSchema", () => {
  it("lowercases the identifier so username and email lookups are case-insensitive", () => {
    expect(SignInSchema.parse({ identifier: " Ada@Example.COM ", password: "x" }).identifier).toBe("ada@example.com");
  });
});

describe("dateOfBirth", () => {
  it("accepts a valid adult date", () => {
    expect(dateOfBirth.safeParse("1990-05-17").success).toBe(true);
  });
  it("rejects future dates, under-13s, and bad formats", () => {
    const nextYear = new Date().getUTCFullYear() + 1;
    const tenYearsAgo = new Date().getUTCFullYear() - 10;
    expect(dateOfBirth.safeParse(`${nextYear}-01-01`).success).toBe(false);
    expect(dateOfBirth.safeParse(`${tenYearsAgo}-01-01`).success).toBe(false);
    expect(dateOfBirth.safeParse("17/05/1990").success).toBe(false);
  });
});

describe("UpdateSettingsSchema", () => {
  it("only accepts known audiences", () => {
    expect(UpdateSettingsSchema.safeParse({ lastSeenAudience: "CONTACTS" }).success).toBe(true);
    expect(UpdateSettingsSchema.safeParse({ lastSeenAudience: "FRIENDS" }).success).toBe(false);
  });
  it("drops unknown keys so clients can't set arbitrary columns", () => {
    const out = UpdateSettingsSchema.parse({ notifyMessages: false, passwordHash: "x", emailVerifiedAt: "now" });
    expect(out).toEqual({ notifyMessages: false });
  });
});

describe("cleanText", () => {
  it("keeps newlines and tabs, normalizes CRLF", () => {
    expect(cleanText("a\r\nb\tc")).toBe("a\nb\tc");
  });
  it("keeps emoji and non-Latin scripts", () => {
    expect(cleanText("héllo 👋 مرحبا")).toBe("héllo 👋 مرحبا");
  });
});
