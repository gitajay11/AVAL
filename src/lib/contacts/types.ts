import type { RequestState, Visibility } from "./policy";

export type ContactUserDTO = { id: string; username: string; displayName: string; avatarUrl: string | null };

/** My own contact, as listed on the Contacts page. */
export type MyContactDTO = {
  id: string;
  chatId: string;
  name: string;
  username: string;
  note: string | null;
  avatarUrl: string | null;
  visibility: Visibility;
  viewers: number;
  pendingRequests: number;
  createdAt: string;
};

export type AccessRequestDTO = { id: string; note: string | null; createdAt: string; requester: ContactUserDTO };
export type AccessGrantDTO = { user: ContactUserDTO; grantedAt: string };

/** Owner's management view. */
export type ContactDetailDTO = { contact: MyContactDTO; requests: AccessRequestDTO[]; grants: AccessGrantDTO[] };

/**
 * What anyone else may know about a public contact: name, @username, avatar
 * and whose contact it is, plus the state of their own request (and the chat once approved).
 */
export type PublicContactDTO = {
  id: string;
  name: string;
  username: string;
  /** Whose contact it is, for the "Personal contact · by @owner" badge. */
  ownerUsername: string;
  avatarUrl: string | null;
  request: RequestState;
  chatId: string | null; // only when approved
};

/** A contact someone shared with me (approved). */
export type SharedContactDTO = {
  id: string;
  chatId: string;
  name: string;
  avatarUrl: string | null;
  ownerName: string;
  grantedAt: string;
};

export type NotificationDTO = {
  id: string;
  type: "ACCESS_REQUEST" | "ACCESS_APPROVED" | "ACCESS_DECLINED" | "ACCESS_REVOKED";
  payload: {
    contactId: string;
    contactName: string;
    requestId?: string;
    note?: string | null;
    chatId?: string;
    user?: { id: string; username: string; displayName: string };
  };
  readAt: string | null;
  createdAt: string;
  /** ACCESS_REQUEST only: still pending, so Approve / Decline make sense. */
  actionable?: boolean;
};
