import { ApiError, json, parseJson, route } from "@/lib/api";
import { requireSession } from "@/lib/auth/session";
import { requireMembership } from "@/lib/authz/chats";
import { decodeCursor } from "@/lib/chats/cursor";
import { db } from "@/lib/db";
import { listMessagesAfter, listMessagesBefore } from "@/lib/chats/queries";
import { sendMessage } from "@/lib/chats/service";
import { rateLimit } from "@/lib/security/rate-limit";
import { SendMessageSchema } from "@/lib/validation/chat";

type Ctx = RouteContext<"/api/chats/[chatId]/messages">;

/**
 * GET ?before=<cursor> → older page (30). GET ?after=<cursor> → newer messages
 * plus the other members' receipts (catch-up after a reconnect, and polling
 * when real-time is unavailable). Neither → latest page.
 */
export const GET = route<Ctx>(async (req, ctx) => {
  const { user } = await requireSession();
  const m = await requireMembership(user.id, (await ctx.params).chatId);
  const params = req.nextUrl.searchParams;

  if (params.has("after")) {
    const after = decodeCursor(params.get("after"));
    if (!after) throw new ApiError(400, "bad_cursor", "Invalid cursor.");
    const [messages, receipts] = await Promise.all([
      listMessagesAfter(user.id, m.chat.id, m.clearedAt, after),
      db.receipt.findMany({
        where: { chatId: m.chat.id, userId: { not: user.id } },
        select: { userId: true, lastDeliveredAt: true, lastReadAt: true },
      }),
    ]);
    return json({
      messages,
      receipts: receipts.map((r) => ({
        userId: r.userId,
        lastDeliveredAt: r.lastDeliveredAt?.toISOString() ?? null,
        lastReadAt: r.lastReadAt?.toISOString() ?? null,
      })),
    });
  }
  const before = params.has("before") ? decodeCursor(params.get("before")) : null;
  if (params.has("before") && !before) throw new ApiError(400, "bad_cursor", "Invalid cursor.");
  return json(await listMessagesBefore(user.id, m.chat.id, m.clearedAt, before));
});

/** Send a message: text, an uploaded attachment (+ caption), optionally replying. `clientId` makes retries safe. */
export const POST = route<Ctx>(async (req, ctx) => {
  const { user } = await requireSession();
  await rateLimit("messageSend", user.id);
  const m = await requireMembership(user.id, (await ctx.params).chatId);
  const input = await parseJson(req, SendMessageSchema);
  const message = await sendMessage(user, m, input);
  return json({ message }, { status: 201 });
});
