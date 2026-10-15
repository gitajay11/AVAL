import { json, route } from "@/lib/api";
import { requireSession } from "@/lib/auth/session";
import { db } from "@/lib/db";

/** People I've blocked, newest first (for Settings → Privacy → Blocked). */
export const GET = route(async () => {
  const { user } = await requireSession();
  const rows = await db.block.findMany({
    where: { blockerId: user.id },
    orderBy: { createdAt: "desc" },
    take: 200,
    select: { createdAt: true, blocked: { select: { id: true, username: true, displayName: true } } },
  });
  return json({
    blocked: rows.map((r) => ({ ...r.blocked, avatarUrl: null, blockedAt: r.createdAt.toISOString() })),
  });
});
