import "server-only";
import { ApiError } from "@/lib/api";
import { requireMembership, type Membership } from "@/lib/authz/chats";
import { canMessage } from "@/lib/authz/privacy";
import { broadcast } from "@/lib/chats/broadcast";
import { getMessage } from "@/lib/chats/queries";
import type { MemberDTO } from "@/lib/chats/types";
import { aliasMap } from "@/lib/aliases";
import { db } from "@/lib/db";
import { deleteAttachments } from "@/lib/media/storage";
import { deleteObject } from "@/lib/object-storage";
import { publishToUsers } from "@/lib/realtime/server";
import { avatarUrl } from "@/lib/users";
import { MAX_GROUP_MEMBERS } from "@/lib/validation/groups";

type Me = { id: string; displayName: string; emailVerified: boolean };

export type { MemberDTO };

const isAdmin = (m: Membership) => m.role === "OWNER" || m.role === "ADMIN";

/** Membership in a group (not a 1:1 or journal), else 404. */
export async function requireGroupMember(userId: string, chatId: string): Promise<Membership> {
  const m = await requireMembership(userId, chatId);
  if (m.chat.type !== "GROUP") throw new ApiError(404, "not_found", "Group not found.");
  return m;
}

export async function requireGroupAdmin(userId: string, chatId: string): Promise<Membership> {
  const m = await requireGroupMember(userId, chatId);
  if (!isAdmin(m)) throw new ApiError(403, "not_admin", "Only group admins can do that.");
  return m;
}

/** A centered event line in the chat ("Ada added Grace"), delivered like any message. */
async function systemMessage(actorId: string, chatId: string, text: string) {
  const row = await db.$transaction(async (tx) => {
    const created = await tx.message.create({ data: { chatId, senderId: actorId, type: "SYSTEM", text }, select: { id: true, createdAt: true } });
    await tx.chat.update({ where: { id: chatId }, data: { lastMessageAt: created.createdAt } });
    return created;
  });
  const dto = await getMessage(actorId, row.id);
  if (dto) await broadcast("message.new", dto);
}

const names = (users: { displayName: string }[]) =>
  users.length <= 3 ? users.map((u) => u.displayName).join(", ") : `${users.slice(0, 2).map((u) => u.displayName).join(", ")} and ${users.length - 2} others`;

/**
 * People `actor` may add: real accounts, not already in, and who accept
 * messages from `actor` ("Who can message me" also governs being added; blocks too).
 */
async function addable(actorId: string, userIds: string[], existing: Set<string>) {
  const users = await db.user.findMany({
    where: { id: { in: [...new Set(userIds)].filter((id) => id !== actorId && !existing.has(id)) } },
    select: { id: true, displayName: true, messageAudience: true },
  });
  const ok: typeof users = [];
  for (const u of users) {
    const reason = await canMessage(actorId, u);
    if (reason) throw new ApiError(403, "not_allowed", `Can't add ${u.displayName}. ${reason}`);
    ok.push(u);
  }
  return ok;
}

export async function createGroup(me: Me, input: { title: string; description?: string; memberIds: string[] }): Promise<string> {
  if (!me.emailVerified) throw new ApiError(403, "unverified", "Verify your email to start chatting.");
  const members = await addable(me.id, input.memberIds, new Set());
  if (members.length === 0) throw new ApiError(400, "no_members", "Add at least one person.");
  if (members.length + 1 > MAX_GROUP_MEMBERS) throw new ApiError(400, "too_many", `Groups can have up to ${MAX_GROUP_MEMBERS} members.`);
  const chat = await db.chat.create({
    data: {
      type: "GROUP",
      title: input.title,
      description: input.description || null,
      createdById: me.id,
      members: { create: [{ userId: me.id, role: "OWNER" }, ...members.map((u) => ({ userId: u.id, role: "MEMBER" as const }))] },
    },
    select: { id: true },
  });
  await systemMessage(me.id, chat.id, `${me.displayName} created the group “${input.title}”`);
  return chat.id;
}

export async function updateGroup(me: Me, chatId: string, input: { title?: string; description?: string | null; removeAvatar?: true }) {
  await requireGroupAdmin(me.id, chatId);
  const before = await db.chat.findUniqueOrThrow({ where: { id: chatId }, select: { title: true, avatarKey: true } });
  await db.chat.update({
    where: { id: chatId },
    data: {
      ...(input.title !== undefined && { title: input.title }),
      ...(input.description !== undefined && { description: input.description || null }),
      ...(input.removeAvatar && { avatarKey: null }),
    },
  });
  if (input.removeAvatar && before.avatarKey) {
    await db.attachment.deleteMany({ where: { objectKey: before.avatarKey } });
    await deleteObject(before.avatarKey);
  }
  if (input.title && input.title !== before.title) await systemMessage(me.id, chatId, `${me.displayName} renamed the group to “${input.title}”`);
  else if (input.removeAvatar) await systemMessage(me.id, chatId, `${me.displayName} removed the group photo`);
}

/** Announce a new group photo (the upload itself is verified in the avatar confirm route). */
export async function groupPhotoChanged(me: Me, chatId: string) {
  await systemMessage(me.id, chatId, `${me.displayName} changed the group photo`);
}

export async function addMembers(me: Me, chatId: string, userIds: string[]) {
  await requireGroupAdmin(me.id, chatId);
  const existing = new Set((await db.chatMember.findMany({ where: { chatId }, select: { userId: true } })).map((m) => m.userId));
  const users = await addable(me.id, userIds, existing);
  if (users.length === 0) throw new ApiError(400, "no_members", "Those people are already in the group.");
  if (existing.size + users.length > MAX_GROUP_MEMBERS) throw new ApiError(400, "too_many", `Groups can have up to ${MAX_GROUP_MEMBERS} members.`);
  await db.chatMember.createMany({ data: users.map((u) => ({ chatId, userId: u.id, role: "MEMBER" as const })), skipDuplicates: true });
  await systemMessage(me.id, chatId, `${me.displayName} added ${names(users)}`);
}

/** Delete a group that has nobody left, with all of its media. */
async function deleteGroup(chatId: string) {
  const chat = await db.chat.findUnique({ where: { id: chatId }, select: { avatarKey: true } });
  const messages = await db.message.findMany({ where: { chatId }, select: { id: true } });
  for (const m of messages) await deleteAttachments({ messageId: m.id });
  if (chat?.avatarKey) {
    await db.attachment.deleteMany({ where: { objectKey: chat.avatarKey } });
    await deleteObject(chat.avatarKey);
  }
  await db.chat.delete({ where: { id: chatId } });
}

/**
 * Remove someone (admins), or leave (anyone, `userId === me`). Owners can't be
 * removed; only the owner removes admins. An owner who leaves hands ownership
 * to the longest-serving admin, else member; the last one out deletes the group.
 */
export async function removeMember(me: Me, chatId: string, userId: string) {
  const mine = await requireGroupMember(me.id, chatId);
  const leaving = userId === me.id;
  const target = leaving
    ? mine
    : await db.chatMember.findUnique({ where: { chatId_userId: { chatId, userId } }, select: { role: true } });
  if (!target) throw new ApiError(404, "not_found", "That person isn't in the group.");
  if (!leaving) {
    if (!isAdmin(mine)) throw new ApiError(403, "not_admin", "Only group admins can remove people.");
    if (target.role === "OWNER") throw new ApiError(403, "owner", "The group owner can't be removed.");
    if (target.role === "ADMIN" && mine.role !== "OWNER") throw new ApiError(403, "admin", "Only the owner can remove admins.");
  }
  const removed = await db.user.findUniqueOrThrow({ where: { id: userId }, select: { displayName: true } });

  await db.$transaction([
    db.chatMember.delete({ where: { chatId_userId: { chatId, userId } } }),
    db.receipt.deleteMany({ where: { chatId, userId } }),
  ]);
  await publishToUsers([userId], "chat.removed", { chatId });

  const remaining = await db.chatMember.findMany({ where: { chatId }, orderBy: { joinedAt: "asc" }, select: { userId: true, role: true } });
  if (remaining.length === 0) {
    await deleteGroup(chatId);
    return;
  }
  if (target.role === "OWNER") {
    const heir = remaining.find((m) => m.role === "ADMIN") ?? remaining[0];
    await db.chatMember.update({ where: { chatId_userId: { chatId, userId: heir.userId } }, data: { role: "OWNER" } });
  }
  await systemMessage(me.id, chatId, leaving ? `${removed.displayName} left the group` : `${me.displayName} removed ${removed.displayName}`);
}

/** Owner only: make someone an admin, or a regular member again. */
export async function setRole(me: Me, chatId: string, userId: string, role: "ADMIN" | "MEMBER") {
  const mine = await requireGroupMember(me.id, chatId);
  if (mine.role !== "OWNER") throw new ApiError(403, "not_owner", "Only the group owner can change admins.");
  if (userId === me.id) throw new ApiError(400, "self", "You're the owner.");
  const target = await db.chatMember.findUnique({
    where: { chatId_userId: { chatId, userId } },
    select: { role: true, user: { select: { displayName: true } } },
  });
  if (!target) throw new ApiError(404, "not_found", "That person isn't in the group.");
  if (target.role === role) return;
  await db.chatMember.update({ where: { chatId_userId: { chatId, userId } }, data: { role } });
  await systemMessage(
    me.id,
    chatId,
    role === "ADMIN" ? `${me.displayName} made ${target.user.displayName} an admin` : `${target.user.displayName} is no longer an admin`,
  );
}

/**
 * Members with roles. Photos follow each person's privacy: "My contacts" is
 * satisfied by having posted in this group (a message to everyone here).
 */
export async function listMembers(viewerId: string, chatId: string): Promise<MemberDTO[]> {
  const rows = await db.chatMember.findMany({
    where: { chatId },
    orderBy: [{ role: "asc" }, { joinedAt: "asc" }],
    select: {
      role: true,
      user: { select: { id: true, username: true, displayName: true, avatarKey: true, avatarAudience: true } },
    },
  });
  const posted = new Set(
    (
      await db.message.findMany({
        where: { chatId, senderId: { in: rows.map((r) => r.user.id) } },
        distinct: ["senderId"],
        select: { senderId: true },
      })
    ).map((m) => m.senderId),
  );
  const blocks = await db.block.findMany({
    where: { OR: [{ blockerId: viewerId }, { blockedId: viewerId }] },
    select: { blockerId: true, blockedId: true },
  });
  const blocked = new Set(blocks.map((b) => (b.blockerId === viewerId ? b.blockedId : b.blockerId)));
  const aliases = await aliasMap(
    viewerId,
    rows.map((r) => r.user.id),
  );
  return rows.map(({ role, user: u }) => {
    const photo =
      u.id === viewerId ||
      (!blocked.has(u.id) && (u.avatarAudience === "EVERYONE" || (u.avatarAudience === "CONTACTS" && posted.has(u.id))));
    return { id: u.id, username: u.username, displayName: aliases.get(u.id) ?? u.displayName, avatarUrl: photo ? avatarUrl(u.id, u.avatarKey) : null, role };
  });
}
