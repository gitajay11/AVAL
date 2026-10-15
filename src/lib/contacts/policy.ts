// The single source of truth for who may see a personal contact. Pure, so it
// can be unit-tested exhaustively; every API route goes through it (via
// src/lib/authz/contacts.ts) rather than re-implementing the rules.

export type Visibility = "PRIVATE" | "PUBLIC";

/**
 * - owner:        full control; the only one who can write.
 * - viewer:       read-only access to the chat (approved, contact still public).
 * - discoverable: may see name + avatar and ask for access (public, not approved).
 * - hidden:       must not learn the contact exists (private, or a block either way).
 */
export type ContactRole = "owner" | "viewer" | "discoverable" | "hidden";

export function contactRole(
  contact: { ownerId: string; visibility: Visibility },
  userId: string,
  opts: { granted: boolean; blocked: boolean },
): ContactRole {
  if (userId === contact.ownerId) return "owner";
  if (contact.visibility !== "PUBLIC" || opts.blocked) return "hidden";
  return opts.granted ? "viewer" : "discoverable";
}

export type RequestState = "none" | "pending" | "approved" | "declined";

/** What a non-owner sees about their own request (cancelled reads as none). */
export function requestState(status: "PENDING" | "APPROVED" | "DECLINED" | "CANCELLED" | null, granted: boolean): RequestState {
  if (granted) return "approved";
  if (status === "PENDING") return "pending";
  if (status === "DECLINED") return "declined";
  return "none";
}
