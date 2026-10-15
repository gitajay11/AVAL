import { describe, expect, it } from "vitest";
import { searchTerms, toTsQuery } from "@/lib/search/tsquery";
import { AddMembersSchema, CreateGroupSchema, MAX_ADD_AT_ONCE, SetRoleSchema, UpdateGroupSchema } from "@/lib/validation/groups";

const id = (n: number) => `00000000-0000-7000-8000-${String(n).padStart(12, "0")}`;

describe("toTsQuery", () => {
  it("ANDs words and makes the last one a prefix", () => {
    expect(toTsQuery("hello wor")).toBe("hello & wor:*");
    expect(toTsQuery("Lunch")).toBe("lunch:*");
  });

  it("drops tsquery operators and punctuation", () => {
    expect(toTsQuery("a & b | !c <-> d:*")).toBe("a & b & c & d:*");
    expect(toTsQuery("'); DROP TABLE messages; --")).toBe("drop & table & messages:*");
    expect(toTsQuery("&|!():*<>")).toBeNull();
    expect(toTsQuery("   ")).toBeNull();
  });

  it("keeps non-Latin letters and digits", () => {
    expect(toTsQuery("привет 2026")).toBe("привет & 2026:*");
    expect(toTsQuery("東京")).toBe("東京:*");
  });

  it("limits the number and length of terms", () => {
    expect(searchTerms("a b c d e f g h i j")).toHaveLength(8);
    expect(searchTerms("x".repeat(200))[0]).toHaveLength(64);
  });

  it("normalises width and case", () => {
    expect(toTsQuery("ＨＥＬＬＯ")).toBe("hello:*");
  });
});

describe("group validation", () => {
  it("needs a title and at least one other person", () => {
    expect(CreateGroupSchema.safeParse({ title: "Team", memberIds: [id(2)] }).success).toBe(true);
    expect(CreateGroupSchema.safeParse({ title: "  ", memberIds: [id(2)] }).success).toBe(false);
    expect(CreateGroupSchema.safeParse({ title: "Team", memberIds: [] }).success).toBe(false);
    expect(CreateGroupSchema.safeParse({ title: "Team", memberIds: ["nope"] }).success).toBe(false);
  });

  it("caps how many people are added at once", () => {
    const many = Array.from({ length: MAX_ADD_AT_ONCE + 1 }, (_, i) => id(i + 2));
    expect(AddMembersSchema.safeParse({ userIds: many }).success).toBe(false);
    expect(AddMembersSchema.safeParse({ userIds: many.slice(1) }).success).toBe(true);
  });

  it("only allows ADMIN or MEMBER as a role change", () => {
    expect(SetRoleSchema.safeParse({ role: "ADMIN" }).success).toBe(true);
    expect(SetRoleSchema.safeParse({ role: "OWNER" }).success).toBe(false);
  });

  it("accepts partial group updates", () => {
    expect(UpdateGroupSchema.safeParse({ description: null }).success).toBe(true);
    expect(UpdateGroupSchema.safeParse({ removeAvatar: true }).success).toBe(true);
  });
});
