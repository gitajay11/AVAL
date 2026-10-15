import type { NotificationDTO } from "@/lib/contacts/types";

// Shapes shared by the API, the server-rendered pages and the client stores.
// Dates are ISO strings so they serialize unchanged across every boundary.

export type MessageType = "TEXT" | "IMAGE" | "VIDEO" | "FILE" | "VOICE" | "SYSTEM";
export type MediaKind = "IMAGE" | "VIDEO" | "FILE" | "VOICE";

export type AttachmentDTO = {
  id: string;
  kind: MediaKind;
  mimeType: string;
  sizeBytes: number;
  fileName: string | null;
  width: number | null;
  height: number | null;
  durationMs: number | null;
  waveform: number[] | null;
  /** Authorized redirect to a short-lived signed R2 URL. */
  url: string;
};

export type LinkPreviewDTO = {
  url: string;
  title: string | null;
  description: string | null;
  siteName: string | null;
  imageUrl: string | null;
};

export type ReplyRefDTO = {
  id: string;
  senderId: string | null;
  type: MessageType;
  text: string | null; // trimmed snippet
  deleted: boolean;
};

export type ReactionDTO = { emoji: string; userIds: string[] };

export type MessageDTO = {
  id: string;
  chatId: string;
  senderId: string | null;
  clientId: string | null;
  type: MessageType;
  text: string | null;
  createdAt: string;
  editedAt: string | null;
  deleted: boolean;
  attachments: AttachmentDTO[];
  replyTo: ReplyRefDTO | null;
  forwardedFromName: string | null;
  linkPreview: LinkPreviewDTO | null;
  reactions: ReactionDTO[];
  pinnedAt: string | null;
  /** Per viewer: saved to my starred messages. */
  starred: boolean;
};

export type PeerDTO = {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
};

export type LastMessageDTO = Pick<MessageDTO, "id" | "senderId" | "type" | "text" | "createdAt" | "deleted"> & {
  /** Groups: shown as "Grace: …" in the chat list. */
  senderName?: string | null;
};

export type MemberDTO = {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  role: "OWNER" | "ADMIN" | "MEMBER";
};

export type ChatListItemDTO = {
  id: string;
  type: "DIRECT" | "GROUP" | "CONTACT";
  title: string;
  avatarUrl: string | null;
  peer: PeerDTO | null; // DIRECT only
  lastMessage: LastMessageDTO | null;
  lastActivityAt: string;
  unread: number;
  pinned: boolean;
  archived: boolean;
  muted: boolean;
  markedUnread: boolean;
  /** GROUP: number of members. */
  memberCount: number | null;
  /** CONTACT: the personal contact behind this one-way chat. */
  contact: { id: string; visibility: "PRIVATE" | "PUBLIC" } | null;
  /** DIRECT: the peer's receipt watermarks, for ✓✓ on my last message. */
  peerDeliveredAt: string | null;
  peerReadAt: string | null;
};

export type MessagePage = {
  messages: MessageDTO[]; // oldest → newest
  /** Pass as `before` to load older messages; null when the start is reached. */
  olderCursor: string | null;
};

/** A window around one message (jump to a search result or a reply far back). */
export type MessageWindow = MessagePage & {
  /** Pass as `after` to load newer messages; null when the window reaches the latest. */
  newerCursor: string | null;
};

export type PresenceDTO =
  | { visible: false }
  | { visible: true; online: boolean; lastSeenAt: string | null };

export type UserSearchResultDTO = PeerDTO & { existingChatId: string | null };

export type ReceiptDTO = { userId: string; lastDeliveredAt: string | null; lastReadAt: string | null };

export type ChatDetailDTO = {
  chat: ChatListItemDTO;
  /** "viewer": read-only access to someone's shared contact (no sending, reacting, forwarding or downloads). */
  access: "member" | "viewer";
  /** Last time I read this chat; drives the "unread messages" divider. */
  myLastReadAt: string | null;
  /** Whether I may send here (blocks, recipient privacy, unverified email). */
  canSend: boolean;
  cantSendReason: string | null;
  /** I blocked the other person (offers "Unblock" instead of the composer). */
  blockedByMe: boolean;
  /** Other members' delivered/read watermarks. */
  receipts: ReceiptDTO[];
  /** Most recently pinned message, if any. */
  pinned: MessageDTO | null;
  /** GROUP: members with roles (for names, photos and admin actions), and my role. */
  members: MemberDTO[] | null;
  myRole: "OWNER" | "ADMIN" | "MEMBER" | null;
  description: string | null;
  page: MessagePage;
};

export type ChatSettingsDTO = Pick<ChatListItemDTO, "pinned" | "archived" | "muted" | "markedUnread">;

export type UserProfileDTO = PeerDTO & { bio: string | null; blockedByMe: boolean };

/** Events published by the server to `user:{id}` Ably channels. */
export type RealtimeEvent =
  | { name: "message.new"; data: { message: MessageDTO } }
  | { name: "message.updated"; data: { message: MessageDTO } }
  | { name: "message.hidden"; data: { chatId: string; messageId: string } }
  | { name: "message.starred"; data: { chatId: string; messageId: string; starred: boolean } }
  | { name: "reaction"; data: { chatId: string; messageId: string; userId: string; emoji: string | null } }
  | { name: "receipt"; data: { chatId: string } & ReceiptDTO }
  | { name: "chat.read"; data: { chatId: string; lastReadAt: string } }
  | { name: "chat.settings"; data: { chatId: string } & ChatSettingsDTO }
  | { name: "chat.removed"; data: { chatId: string } }
  | { name: "typing"; data: { chatId: string; userId: string } }
  | { name: "presence"; data: { userId: string; presence: PresenceDTO } }
  | { name: "notification.new"; data: { notification: NotificationDTO } }
  | { name: "contact.access"; data: { contactId: string; chatId: string; access: "granted" | "revoked" } };

export type RealtimeEventName = RealtimeEvent["name"];
