import { json, parseJson, route } from "@/lib/api";
import { requireSession } from "@/lib/auth/session";
import { addMembers, listMembers, requireGroupMember } from "@/lib/groups/service";
import { rateLimit } from "@/lib/security/rate-limit";
import { AddMembersSchema } from "@/lib/validation/groups";

type Ctx = RouteContext<"/api/chats/[chatId]/members">;

/** Members of a group I'm in, with roles. */
export const GET = route<Ctx>(async (_req, ctx) => {
  const { user } = await requireSession();
  const m = await requireGroupMember(user.id, (await ctx.params).chatId);
  return json({ members: await listMembers(user.id, m.chat.id), myRole: m.role });
});

/** Admins: add people (each must accept messages from me). */
export const POST = route<Ctx>(async (req, ctx) => {
  const { user } = await requireSession();
  await rateLimit("messageAction", user.id);
  const { userIds } = await parseJson(req, AddMembersSchema);
  const chatId = (await ctx.params).chatId;
  await addMembers(user, chatId, userIds);
  return json({ members: await listMembers(user.id, chatId) });
});
