import { json, route } from "@/lib/api";
import { requireSession } from "@/lib/auth/session";
import { blockedAmong, directKey } from "@/lib/authz/privacy";
import type { UserSearchResultDTO } from "@/lib/chats/types";
import { aliasMap } from "@/lib/aliases";
import { db } from "@/lib/db";
import { rateLimit } from "@/lib/security/rate-limit";
import { avatarUrl } from "@/lib/users";
import { UserSearchSchema } from "@/lib/validation/chat";

const LIMIT = 20;

/**
 * GET ?q= → people by username: exact match first, then prefix matches (2+ chars).
 * Excludes yourself and anyone blocked either way; photos respect privacy.
 */
export const GET = route(async (req) => {
  const { user: me } = await requireSession();
  await rateLimit("userSearch", me.id);
  const parsed = UserSearchSchema.safeParse(req.nextUrl.searchParams.get("q") ?? "");
  if (!parsed.success) return json({ results: [] });
  const q = parsed.data;

  const rows = await db.user.findMany({
    where: {
      id: { not: me.id },
      ...(q.length >= 2 ? { usernameLower: { startsWith: q } } : { usernameLower: q }),
    },
    orderBy: { usernameLower: "asc" },
    take: LIMIT + 5,
    select: { id: true, username: true, usernameLower: true, displayName: true, avatarKey: true, avatarAudience: true },
  });
  // LIKE treats "_" as a wildcard; keep only true prefix matches.
  const matches = rows.filter((r) => r.usernameLower.startsWith(q));
  const blocked = await blockedAmong(
    me.id,
    matches.map((r) => r.id),
  );
  const visible = matches.filter((r) => !blocked.has(r.id)).slice(0, LIMIT);
  visible.sort((a, b) => Number(b.usernameLower === q) - Number(a.usernameLower === q));

  // Existing 1:1 chats, and which of these people have messaged me (photo privacy "contacts").
  const keys = visible.map((r) => directKey(me.id, r.id));
  const chats = await db.chat.findMany({ where: { directKey: { in: keys } }, select: { id: true, directKey: true } });
  const chatByKey = new Map(chats.map((c) => [c.directKey!, c.id]));
  const contactSenders = new Set(
    (
      await db.message.findMany({
        where: { chatId: { in: chats.map((c) => c.id) }, senderId: { in: visible.map((r) => r.id) } },
        distinct: ["senderId"],
        select: { senderId: true },
      })
    ).map((m) => m.senderId),
  );

  const aliases = await aliasMap(
    me.id,
    visible.map((r) => r.id),
  );
  const results: UserSearchResultDTO[] = visible.map((r) => {
    const photoVisible =
      r.avatarAudience === "EVERYONE" || (r.avatarAudience === "CONTACTS" && contactSenders.has(r.id));
    return {
      id: r.id,
      username: r.username,
      displayName: aliases.get(r.id) ?? r.displayName,
      avatarUrl: photoVisible ? avatarUrl(r.id, r.avatarKey) : null,
      existingChatId: chatByKey.get(directKey(me.id, r.id)) ?? null,
    };
  });
  return json({ results });
});
