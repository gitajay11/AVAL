import { describe, expect, it } from "vitest";
import { contactRole, requestState } from "@/lib/contacts/policy";
import { AccessRequestSchema, CreateContactSchema, UpdateContactSchema } from "@/lib/validation/contacts";

const OWNER = "owner";
const OTHER = "someone-else";
const priv = { ownerId: OWNER, visibility: "PRIVATE" as const };
const pub = { ownerId: OWNER, visibility: "PUBLIC" as const };

describe("contactRole (who may see a personal contact)", () => {
  it("the owner always has full control, whatever the visibility", () => {
    expect(contactRole(priv, OWNER, { granted: false, blocked: false })).toBe("owner");
    expect(contactRole(pub, OWNER, { granted: false, blocked: true })).toBe("owner");
  });

  it.each([
    // [label, contact, granted, blocked, expected]
    ["stranger, private", priv, false, false, "hidden"],
    ["previously approved, now private", priv, true, false, "hidden"],
    ["stranger, public", pub, false, false, "discoverable"],
    ["pending request, public", pub, false, false, "discoverable"],
    ["approved, public", pub, true, false, "viewer"],
    ["approved but blocked", pub, true, true, "hidden"],
    ["public but blocked", pub, false, true, "hidden"],
  ] as const)("%s → %s", (_label, contact, granted, blocked, expected) => {
    expect(contactRole(contact, OTHER, { granted, blocked })).toBe(expected);
  });
});

describe("requestState (what a requester sees)", () => {
  it.each([
    [null, false, "none"],
    ["PENDING", false, "pending"],
    ["DECLINED", false, "declined"],
    ["CANCELLED", false, "none"], // revoked or switched to private: may ask again
    ["APPROVED", false, "none"], // approval without a grant (revoked) never reads as approved
    ["APPROVED", true, "approved"],
  ] as const)("%s (granted: %s) → %s", (status, granted, expected) => {
    expect(requestState(status, granted)).toBe(expected);
  });
});

describe("contact validation", () => {
  it("defaults to private and trims names", () => {
    expect(CreateContactSchema.parse({ name: "  Mom  " })).toEqual({ name: "Mom", visibility: "PRIVATE" });
    expect(CreateContactSchema.safeParse({ name: "   " }).success).toBe(false);
    expect(CreateContactSchema.safeParse({ name: "x", visibility: "FRIENDS" }).success).toBe(false);
  });
  it("only accepts known fields when updating", () => {
    expect(UpdateContactSchema.parse({ visibility: "PUBLIC", ownerId: "hijack" })).toEqual({ visibility: "PUBLIC" });
    expect(UpdateContactSchema.safeParse({ removeAvatar: false }).success).toBe(false);
  });
  it("caps request notes", () => {
    expect(AccessRequestSchema.safeParse({ note: "x".repeat(281) }).success).toBe(false);
    expect(AccessRequestSchema.parse({})).toEqual({});
  });
});
