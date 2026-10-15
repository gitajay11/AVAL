import { json, parseJson, route } from "@/lib/api";
import { requireSession } from "@/lib/auth/session";
import { requireMembership } from "@/lib/authz/chats";
import { updateChatSettings } from "@/lib/chats/service";
import { rateLimit } from "@/lib/security/rate-limit";
import { ChatSettingsSchema } from "@/lib/validation/chat";

/** My per-chat list state: pin, archive, mute (8h / 1w / forever / off), mark unread. */
export const PATCH = route<RouteContext<"/api/chats/[chatId]/settings">>(async (req, ctx) => {
  const { user } = await requireSession();
  await rateLimit("messageAction", user.id);
  const m = await requireMembership(user.id, (await ctx.params).chatId);
  const input = await parseJson(req, ChatSettingsSchema);
  return json({ settings: await updateChatSettings(user.id, m.chat.id, input) });
});
