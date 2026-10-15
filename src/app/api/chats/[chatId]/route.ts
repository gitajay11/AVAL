import { ApiError, json, route } from "@/lib/api";
import { requireSession } from "@/lib/auth/session";
import { getChatDetail } from "@/lib/chats/detail";

/** One chat with its first page of messages (used when an unknown chat gets a message). */
export const GET = route<RouteContext<"/api/chats/[chatId]">>(async (_req, ctx) => {
  const { user } = await requireSession();
  const detail = await getChatDetail(user, (await ctx.params).chatId);
  if (!detail) throw new ApiError(404, "not_found", "Chat not found.");
  return json(detail);
});
