import { beforeEach, describe, expect, it, vi } from "vitest";

const findMany = vi.fn();
const publishToUsers = vi.fn();
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ db: { chatMember: { findMany } } }));
vi.mock("@/lib/realtime/server", () => ({ publishToUsers }));

const { profileChanged } = await import("@/lib/profile-events");

describe("profileChanged", () => {
  beforeEach(() => {
    findMany.mockReset();
    publishToUsers.mockReset();
  });

  it("tells everyone who shares a chat with the user, and the user's own devices", async () => {
    findMany.mockResolvedValue([{ userId: "ada" }, { userId: "linus" }]);
    await profileChanged("grace");
    expect(findMany).toHaveBeenCalledWith({
      where: { userId: { not: "grace" }, chat: { members: { some: { userId: "grace" } } } },
      select: { userId: true },
      distinct: ["userId"],
    });
    expect(publishToUsers).toHaveBeenCalledWith(["grace", "ada", "linus"], "user.updated", { userId: "grace" });
  });

  it("sends only the id, never the photo URL (viewers refetch, so privacy and blocks apply)", async () => {
    findMany.mockResolvedValue([{ userId: "ada" }]);
    await profileChanged("grace");
    expect(publishToUsers.mock.calls[0][2]).toEqual({ userId: "grace" });
  });

  it("still reaches the user's own devices when they share no chats", async () => {
    findMany.mockResolvedValue([]);
    await profileChanged("grace");
    expect(publishToUsers).toHaveBeenCalledWith(["grace"], "user.updated", { userId: "grace" });
  });
});
