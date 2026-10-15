import { json, parseJson, route } from "@/lib/api";
import { requireSession } from "@/lib/auth/session";
import { listChats } from "@/lib/chats/queries";
import { startDirectChat } from "@/lib/chats/service";
import { rateLimit } from "@/lib/security/rate-limit";
import { StartChatSchema } from "@/lib/validation/chat";

/** My chat list (pinned first, then most recent activity). */
export const GET = route(async () => {
  const { user } = await requireSession();
  return json({ chats: await listChats(user.id) });
});

/** Open (find or create) a 1:1 chat with a user. */
export const POST = route(async (req) => {
  const { user } = await requireSession();
  await rateLimit("chatCreate", user.id);
  const { userId } = await parseJson(req, StartChatSchema);
  const chatId = await startDirectChat(user, userId);
  return json({ chatId });
});
