import { ApiError, json, parseJson, route } from "@/lib/api";
import { requireSession } from "@/lib/auth/session";
import { requireMessage } from "@/lib/authz/chats";
import { db } from "@/lib/db";
import { rateLimit } from "@/lib/security/rate-limit";
import { ReportSchema } from "@/lib/validation/chat";

/**
 * Report a user or a message for review. You can only report messages you can
 * see, and a report of a message also records its sender.
 */
export const POST = route(async (req) => {
  const { user } = await requireSession();
  await rateLimit("report", user.id);
  const input = await parseJson(req, ReportSchema);

  let targetUserId = input.targetUserId ?? null;
  if (input.targetMessageId) {
    const { message } = await requireMessage(user.id, input.targetMessageId);
    if (message.senderId === user.id) throw new ApiError(400, "own_message", "You can't report your own message.");
    targetUserId ??= message.senderId;
  }
  if (targetUserId === user.id) throw new ApiError(400, "self", "You can't report yourself.");
  if (targetUserId && !(await db.user.findUnique({ where: { id: targetUserId }, select: { id: true } }))) {
    throw new ApiError(404, "not_found", "User not found.");
  }

  await db.report.create({
    data: {
      reporterId: user.id,
      targetUserId,
      targetMessageId: input.targetMessageId ?? null,
      reason: input.reason,
      details: input.details || null,
    },
  });
  return json({ ok: true }, { status: 201 });
});
