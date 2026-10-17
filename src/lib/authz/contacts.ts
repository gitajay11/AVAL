import "server-only";
import { ApiError } from "@/lib/api";
import { contactRole, type ContactRole } from "@/lib/contacts/policy";
import { db } from "@/lib/db";
import { uuid } from "@/lib/validation/common";
import { chatMembers, getMembership, type Membership } from "./chats";
import { isBlockedEitherWay } from "./privacy";

const contactSelect = {
  id: true,
  ownerId: true,
  name: true,
  username: true,
  owner: { select: { username: true } },
  note: true,
  avatarKey: true,
  visibility: true,
  createdAt: true,
  chat: { select: { id: true } },
} as const;

export type ContactRow = NonNullable<Awaited<ReturnType<typeof findContact>>>;

function findContact(contactId: string) {
  return db.personalContact.findUnique({ where: { id: contactId }, select: contactSelect });
}

/** Load a contact and the caller's role for it (see contacts/policy.ts). */
export async function contactWithRole(userId: string, contactId: string): Promise<{ contact: ContactRow; role: ContactRole } | null> {
  if (!uuid.safeParse(contactId).success) return null;
  const contact = await findContact(contactId);
  if (!contact) return null;
  if (contact.ownerId === userId) return { contact, role: "owner" };
  const [grant, blocked] = await Promise.all([
    db.contactAccessGrant.findUnique({ where: { contactId_userId: { contactId, userId } }, select: { userId: true } }),
    isBlockedEitherWay(userId, contact.ownerId),
  ]);
  return { contact, role: contactRole(contact, userId, { granted: grant !== null, blocked }) };
}

/** Owner-only actions. Everyone else gets the same 404 as a missing contact. */
export async function requireOwnedContact(userId: string, contactId: string): Promise<ContactRow> {
  const r = await contactWithRole(userId, contactId);
  if (!r || r.role !== "owner") throw new ApiError(404, "not_found", "Contact not found.");
  return r.contact;
}

/** Visible to the caller at all (owner, viewer or discoverable); private ones 404. */
export async function requireVisibleContact(userId: string, contactId: string) {
  const r = await contactWithRole(userId, contactId);
  if (!r || r.role === "hidden") throw new ApiError(404, "not_found", "Contact not found.");
  return r;
}

export type ChatAccess =
  | { kind: "member"; membership: Membership }
  | { kind: "viewer"; chatId: string; contact: ContactRow; clearedAt: null };

/**
 * Read access to a chat: members, or approved viewers of a public contact's
 * journal. Writes never use this; they require membership, so viewers are
 * read-only by construction.
 */
export async function getChatAccess(userId: string, chatId: string): Promise<ChatAccess | null> {
  const membership = await getMembership(userId, chatId);
  if (membership) return { kind: "member", membership };
  if (!uuid.safeParse(chatId).success) return null;
  const chat = await db.chat.findUnique({ where: { id: chatId }, select: { type: true, contactId: true } });
  if (chat?.type !== "CONTACT" || !chat.contactId) return null;
  const r = await contactWithRole(userId, chat.contactId);
  return r?.role === "viewer" ? { kind: "viewer", chatId, contact: r.contact, clearedAt: null } : null;
}

export async function requireChatAccess(userId: string, chatId: string): Promise<ChatAccess> {
  const access = await getChatAccess(userId, chatId);
  if (!access) throw new ApiError(404, "not_found", "Chat not found.");
  return access;
}

export const accessChatId = (a: ChatAccess) => (a.kind === "member" ? a.membership.chat.id : a.chatId);
export const accessClearedAt = (a: ChatAccess) => (a.kind === "member" ? a.membership.clearedAt : null);

/** Current viewers of a contact's journal, re-checked against blocks at publish time. */
export async function contactViewerIds(contactId: string): Promise<string[]> {
  const contact = await db.personalContact.findUnique({
    where: { id: contactId },
    select: { ownerId: true, visibility: true, accessGrants: { select: { userId: true } } },
  });
  if (!contact || contact.visibility !== "PUBLIC") return [];
  const ids: string[] = [];
  for (const g of contact.accessGrants) {
    if (!(await isBlockedEitherWay(g.userId, contact.ownerId))) ids.push(g.userId);
  }
  return ids;
}

/**
 * Who receives message events for a chat: its members, plus (for a contact's
 * journal) the currently approved viewers. Computed at publish time, so a
 * revoked or blocked viewer stops receiving events immediately.
 */
export async function chatAudience(chatId: string): Promise<string[]> {
  const [members, chat] = await Promise.all([
    chatMembers(chatId),
    db.chat.findUnique({ where: { id: chatId }, select: { type: true, contactId: true } }),
  ]);
  if (chat?.type !== "CONTACT" || !chat.contactId) return members;
  return [...new Set([...members, ...(await contactViewerIds(chat.contactId))])];
}
