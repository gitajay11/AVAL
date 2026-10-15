import "server-only";
import { ApiError } from "@/lib/api";
import { requireOwnedContact, requireVisibleContact, type ContactRow } from "@/lib/authz/contacts";
import { blockedAmong } from "@/lib/authz/privacy";
import { db } from "@/lib/db";
import { deleteAttachments } from "@/lib/media/storage";
import { deleteObject } from "@/lib/r2";
import { publishToUsers } from "@/lib/realtime/server";
import { avatarUrl } from "@/lib/users";
import { requestState } from "./policy";
import { contactAvatarUrl } from "./urls";
import type {
  ContactDetailDTO,
  ContactUserDTO,
  MyContactDTO,
  NotificationDTO,
  PublicContactDTO,
  SharedContactDTO,
} from "./types";

const userSelect = { id: true, username: true, displayName: true, avatarKey: true, avatarAudience: true } as const;

/** Requester/viewer card for the owner. Photos follow the user's own privacy (EVERYONE only here). */
function toUser(u: { id: string; username: string; displayName: string; avatarKey: string | null; avatarAudience: string }): ContactUserDTO {
  return {
    id: u.id,
    username: u.username,
    displayName: u.displayName,
    avatarUrl: u.avatarAudience === "EVERYONE" ? avatarUrl(u.id, u.avatarKey) : null,
  };
}

function toMyContact(c: ContactRow, counts: { viewers: number; pending: number }): MyContactDTO {
  return {
    id: c.id,
    chatId: c.chat!.id,
    name: c.name,
    note: c.note,
    avatarUrl: contactAvatarUrl(c.id, c.avatarKey),
    visibility: c.visibility,
    viewers: counts.viewers,
    pendingRequests: counts.pending,
    createdAt: c.createdAt.toISOString(),
  };
}

// ─────────────────────────── Notifications ───────────────────────────

export async function notify(userId: string, type: NotificationDTO["type"], payload: NotificationDTO["payload"]) {
  const row = await db.notification.create({ data: { userId, type, payload }, select: { id: true, createdAt: true } });
  const notification: NotificationDTO = {
    id: row.id,
    type,
    payload,
    readAt: null,
    createdAt: row.createdAt.toISOString(),
    ...(type === "ACCESS_REQUEST" ? { actionable: true } : {}),
  };
  await publishToUsers([userId], "notification.new", { notification });
}

async function announceAccess(userIds: string[], contactId: string, chatId: string, access: "granted" | "revoked") {
  await publishToUsers(userIds, "contact.access", { contactId, chatId, access });
}

// ─────────────────────────── Owner ───────────────────────────

const ownedSelect = {
  id: true,
  ownerId: true,
  name: true,
  note: true,
  avatarKey: true,
  visibility: true,
  createdAt: true,
  chat: { select: { id: true } },
  _count: { select: { accessGrants: true, accessRequests: { where: { status: "PENDING" as const } } } },
} as const;

export async function listMyContacts(ownerId: string): Promise<MyContactDTO[]> {
  const rows = await db.personalContact.findMany({ where: { ownerId }, orderBy: { nameLower: "asc" }, select: ownedSelect });
  return rows.map((r) => toMyContact(r, { viewers: r._count.accessGrants, pending: r._count.accessRequests }));
}

/** A contact and its one-way chat (the owner is the chat's only member). */
export async function createContact(ownerId: string, input: { name: string; note?: string; visibility: "PRIVATE" | "PUBLIC" }) {
  const contact = await db.personalContact.create({
    data: {
      ownerId,
      name: input.name,
      nameLower: input.name.toLowerCase(),
      note: input.note || null,
      visibility: input.visibility,
      chat: { create: { type: "CONTACT", createdById: ownerId, members: { create: { userId: ownerId, role: "OWNER" } } } },
    },
    select: ownedSelect,
  });
  return toMyContact(contact, { viewers: 0, pending: 0 });
}

export async function getContactDetail(ownerId: string, contactId: string): Promise<ContactDetailDTO> {
  await requireOwnedContact(ownerId, contactId);
  const [row, requests, grants] = await Promise.all([
    db.personalContact.findUniqueOrThrow({ where: { id: contactId }, select: ownedSelect }),
    db.contactAccessRequest.findMany({
      where: { contactId, status: "PENDING" },
      orderBy: { createdAt: "desc" },
      select: { id: true, note: true, createdAt: true, requester: { select: userSelect } },
    }),
    db.contactAccessGrant.findMany({
      where: { contactId },
      orderBy: { grantedAt: "desc" },
      select: { grantedAt: true, user: { select: userSelect } },
    }),
  ]);
  return {
    contact: toMyContact(row, { viewers: row._count.accessGrants, pending: row._count.accessRequests }),
    requests: requests.map((r) => ({ id: r.id, note: r.note, createdAt: r.createdAt.toISOString(), requester: toUser(r.requester) })),
    grants: grants.map((g) => ({ user: toUser(g.user), grantedAt: g.grantedAt.toISOString() })),
  };
}

/**
 * End every viewer's access at once (used when going Private or deleting).
 * Pending and approved requests are cancelled, so access must be asked for again.
 */
async function revokeAll(contact: ContactRow): Promise<string[]> {
  const viewers = await db.contactAccessGrant.findMany({ where: { contactId: contact.id }, select: { userId: true } });
  await db.$transaction([
    db.contactAccessGrant.deleteMany({ where: { contactId: contact.id } }),
    db.contactAccessRequest.updateMany({
      where: { contactId: contact.id, status: { in: ["PENDING", "APPROVED"] } },
      data: { status: "CANCELLED", decidedAt: new Date() },
    }),
  ]);
  return viewers.map((v) => v.userId);
}

export async function updateContact(
  ownerId: string,
  contactId: string,
  input: { name?: string; note?: string | null; visibility?: "PRIVATE" | "PUBLIC"; removeAvatar?: true },
) {
  const contact = await requireOwnedContact(ownerId, contactId);
  let revoked: string[] = [];
  if (input.visibility === "PRIVATE" && contact.visibility === "PUBLIC") {
    // Going private: access ends immediately, before anything else is visible.
    await db.personalContact.update({ where: { id: contactId }, data: { visibility: "PRIVATE" } });
    revoked = await revokeAll(contact);
  }
  await db.personalContact.update({
    where: { id: contactId },
    data: {
      ...(input.name !== undefined && { name: input.name, nameLower: input.name.toLowerCase() }),
      ...(input.note !== undefined && { note: input.note || null }),
      ...(input.visibility !== undefined && { visibility: input.visibility }),
      ...(input.removeAvatar && { avatarKey: null }),
    },
  });
  if (input.removeAvatar && contact.avatarKey) {
    await db.attachment.deleteMany({ where: { objectKey: contact.avatarKey } });
    await deleteObject(contact.avatarKey);
  }
  if (revoked.length) {
    await announceAccess(revoked, contactId, contact.chat!.id, "revoked");
    for (const userId of revoked) {
      await notify(userId, "ACCESS_REVOKED", { contactId, contactName: contact.name });
    }
  }
  return getContactDetail(ownerId, contactId);
}

/** Delete a contact, its journal and all of its media. */
export async function deleteContact(ownerId: string, contactId: string) {
  const contact = await requireOwnedContact(ownerId, contactId);
  const viewers = await revokeAll(contact);
  const chatId = contact.chat!.id;
  const messages = await db.message.findMany({ where: { chatId }, select: { id: true } });
  for (const m of messages) await deleteAttachments({ messageId: m.id });
  if (contact.avatarKey) {
    await db.attachment.deleteMany({ where: { objectKey: contact.avatarKey } });
    await deleteObject(contact.avatarKey);
  }
  await db.personalContact.delete({ where: { id: contactId } }); // cascades to the chat and its messages
  await announceAccess(viewers, contactId, chatId, "revoked");
}

export async function decideRequest(ownerId: string, contactId: string, requestId: string, decision: "approve" | "decline") {
  const contact = await requireOwnedContact(ownerId, contactId);
  const request = await db.contactAccessRequest.findFirst({
    where: { id: requestId, contactId, status: "PENDING" },
    select: { id: true, requesterId: true },
  });
  if (!request) throw new ApiError(404, "not_found", "Request not found.");
  if (decision === "approve" && contact.visibility !== "PUBLIC") {
    throw new ApiError(400, "private", "Make the contact public before approving requests.");
  }
  if (decision === "approve") {
    await db.$transaction([
      db.contactAccessRequest.update({ where: { id: requestId }, data: { status: "APPROVED", decidedAt: new Date() } }),
      db.contactAccessGrant.upsert({
        where: { contactId_userId: { contactId, userId: request.requesterId } },
        create: { contactId, userId: request.requesterId },
        update: {},
      }),
    ]);
    await announceAccess([request.requesterId], contactId, contact.chat!.id, "granted");
    await notify(request.requesterId, "ACCESS_APPROVED", { contactId, contactName: contact.name, chatId: contact.chat!.id });
  } else {
    await db.contactAccessRequest.update({ where: { id: requestId }, data: { status: "DECLINED", decidedAt: new Date() } });
    await notify(request.requesterId, "ACCESS_DECLINED", { contactId, contactName: contact.name });
  }
  return getContactDetail(ownerId, contactId);
}

/** Revoke one viewer's access. They can ask again later. */
export async function revokeAccess(ownerId: string, contactId: string, userId: string) {
  const contact = await requireOwnedContact(ownerId, contactId);
  const { count } = await db.contactAccessGrant.deleteMany({ where: { contactId, userId } });
  if (count === 0) throw new ApiError(404, "not_found", "That person doesn't have access.");
  await db.contactAccessRequest.updateMany({
    where: { contactId, requesterId: userId },
    data: { status: "CANCELLED", decidedAt: new Date() },
  });
  await announceAccess([userId], contactId, contact.chat!.id, "revoked");
  await notify(userId, "ACCESS_REVOKED", { contactId, contactName: contact.name });
  return getContactDetail(ownerId, contactId);
}

// ─────────────────────────── Everyone else ───────────────────────────

/** Name + avatar + my request state. Private contacts are a 404, like missing ones. */
export async function publicContact(userId: string, contactId: string): Promise<PublicContactDTO> {
  const { contact, role } = await requireVisibleContact(userId, contactId);
  const request = await db.contactAccessRequest.findUnique({
    where: { contactId_requesterId: { contactId, requesterId: userId } },
    select: { status: true },
  });
  return {
    id: contact.id,
    name: contact.name,
    avatarUrl: contactAvatarUrl(contact.id, contact.avatarKey),
    request: role === "owner" ? "approved" : requestState(request?.status ?? null, role === "viewer"),
    chatId: role === "viewer" || role === "owner" ? contact.chat!.id : null,
  };
}

export async function requestAccess(me: { id: string; emailVerified: boolean; username: string; displayName: string }, contactId: string, note?: string) {
  if (!me.emailVerified) throw new ApiError(403, "unverified", "Verify your email first.");
  const { contact, role } = await requireVisibleContact(me.id, contactId);
  if (role === "owner") throw new ApiError(400, "own_contact", "This is your own contact.");
  if (role === "viewer") throw new ApiError(409, "already_approved", "You already have access.");
  const existing = await db.contactAccessRequest.findUnique({
    where: { contactId_requesterId: { contactId, requesterId: me.id } },
    select: { status: true },
  });
  if (existing?.status === "PENDING") throw new ApiError(409, "pending", "Your request is already waiting for approval.");

  const request = await db.contactAccessRequest.upsert({
    where: { contactId_requesterId: { contactId, requesterId: me.id } },
    create: { contactId, requesterId: me.id, note: note || null },
    update: { status: "PENDING", note: note || null, createdAt: new Date(), decidedAt: null },
    select: { id: true },
  });
  await notify(contact.ownerId, "ACCESS_REQUEST", {
    contactId,
    contactName: contact.name,
    requestId: request.id,
    note: note || null,
    user: { id: me.id, username: me.username, displayName: me.displayName },
  });
  return publicContact(me.id, contactId);
}

export async function cancelRequest(userId: string, contactId: string) {
  await requireVisibleContact(userId, contactId);
  await db.contactAccessRequest.updateMany({
    where: { contactId, requesterId: userId, status: "PENDING" },
    data: { status: "CANCELLED", decidedAt: new Date() },
  });
  return publicContact(userId, contactId);
}

/** Public contacts by name prefix: name and avatar only, never the owner. */
export async function searchPublicContacts(userId: string, q: string): Promise<PublicContactDTO[]> {
  const rows = await db.personalContact.findMany({
    where: { visibility: "PUBLIC", nameLower: { startsWith: q }, ownerId: { not: userId } },
    orderBy: { nameLower: "asc" },
    take: 30,
    select: { id: true, ownerId: true, name: true, nameLower: true, avatarKey: true, chat: { select: { id: true } } },
  });
  const blocked = await blockedAmong(userId, [...new Set(rows.map((r) => r.ownerId))]);
  const visible = rows.filter((r) => r.nameLower.startsWith(q) && !blocked.has(r.ownerId)).slice(0, 20);
  const [requests, grants] = await Promise.all([
    db.contactAccessRequest.findMany({
      where: { requesterId: userId, contactId: { in: visible.map((r) => r.id) } },
      select: { contactId: true, status: true },
    }),
    db.contactAccessGrant.findMany({ where: { userId, contactId: { in: visible.map((r) => r.id) } }, select: { contactId: true } }),
  ]);
  const status = new Map(requests.map((r) => [r.contactId, r.status]));
  const granted = new Set(grants.map((g) => g.contactId));
  return visible.map((r) => ({
    id: r.id,
    name: r.name,
    avatarUrl: contactAvatarUrl(r.id, r.avatarKey),
    request: requestState(status.get(r.id) ?? null, granted.has(r.id)),
    chatId: granted.has(r.id) ? r.chat!.id : null,
  }));
}

/** Contacts others have shared with me that I can still view. */
export async function listShared(userId: string): Promise<SharedContactDTO[]> {
  const grants = await db.contactAccessGrant.findMany({
    where: { userId, contact: { visibility: "PUBLIC" } },
    orderBy: { grantedAt: "desc" },
    select: {
      grantedAt: true,
      contact: { select: { id: true, ownerId: true, name: true, avatarKey: true, chat: { select: { id: true } }, owner: { select: { displayName: true } } } },
    },
  });
  const blocked = await blockedAmong(userId, [...new Set(grants.map((g) => g.contact.ownerId))]);
  return grants
    .filter((g) => !blocked.has(g.contact.ownerId))
    .map((g) => ({
      id: g.contact.id,
      chatId: g.contact.chat!.id,
      name: g.contact.name,
      avatarUrl: contactAvatarUrl(g.contact.id, g.contact.avatarKey),
      ownerName: g.contact.owner.displayName,
      grantedAt: g.grantedAt.toISOString(),
    }));
}

/**
 * Blocking ends all contact sharing between two people, both ways: grants are
 * removed and requests cancelled, so unblocking doesn't silently restore access.
 */
export async function endSharingBetween(a: string, b: string) {
  const grants = await db.contactAccessGrant.findMany({
    where: {
      OR: [
        { userId: b, contact: { ownerId: a } },
        { userId: a, contact: { ownerId: b } },
      ],
    },
    select: { userId: true, contactId: true, contact: { select: { chat: { select: { id: true } } } } },
  });
  await db.$transaction([
    db.contactAccessGrant.deleteMany({
      where: { OR: [{ userId: b, contact: { ownerId: a } }, { userId: a, contact: { ownerId: b } }] },
    }),
    db.contactAccessRequest.updateMany({
      where: {
        status: { in: ["PENDING", "APPROVED"] },
        OR: [
          { requesterId: b, contact: { ownerId: a } },
          { requesterId: a, contact: { ownerId: b } },
        ],
      },
      data: { status: "CANCELLED", decidedAt: new Date() },
    }),
  ]);
  for (const g of grants) await announceAccess([g.userId], g.contactId, g.contact.chat!.id, "revoked");
}
