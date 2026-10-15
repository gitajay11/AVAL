// Shapes shared by the API, the server-rendered pages and the client stores.
// Dates are ISO strings so they serialize unchanged across every boundary.

export type MessageType = "TEXT" | "IMAGE" | "VIDEO" | "FILE" | "VOICE" | "SYSTEM";

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
};

export type PeerDTO = {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
};

export type ChatListItemDTO = {
  id: string;
  type: "DIRECT" | "GROUP" | "CONTACT";
  title: string;
  avatarUrl: string | null;
  peer: PeerDTO | null; // DIRECT only
  lastMessage: Pick<MessageDTO, "id" | "senderId" | "type" | "text" | "createdAt" | "deleted"> | null;
  lastActivityAt: string;
  unread: number;
  pinned: boolean;
  muted: boolean;
  markedUnread: boolean;
};

export type MessagePage = {
  messages: MessageDTO[]; // oldest → newest
  /** Pass as `before` to load older messages; null when the start is reached. */
  olderCursor: string | null;
};

export type PresenceDTO =
  | { visible: false }
  | { visible: true; online: boolean; lastSeenAt: string | null };

export type UserSearchResultDTO = PeerDTO & { existingChatId: string | null };

export type ChatDetailDTO = {
  chat: ChatListItemDTO;
  /** Last time I read this chat; drives the "unread messages" divider. */
  myLastReadAt: string | null;
  /** Whether I may send here (blocks, recipient privacy, unverified email). */
  canSend: boolean;
  cantSendReason: string | null;
  page: MessagePage;
};

/** Events published by the server to `user:{id}` Ably channels. */
export type RealtimeEvent =
  | { name: "message.new"; data: { message: MessageDTO } }
  | { name: "chat.read"; data: { chatId: string; lastReadAt: string } }
  | { name: "typing"; data: { chatId: string; userId: string } }
  | { name: "presence"; data: { userId: string; presence: PresenceDTO } };

export type RealtimeEventName = RealtimeEvent["name"];
