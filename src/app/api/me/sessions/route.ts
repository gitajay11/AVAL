import { json, route } from "@/lib/api";
import { requireSession } from "@/lib/auth/session";
import { db } from "@/lib/db";

/** Signed-in devices, newest activity first. */
export const GET = route(async () => {
  const { user, sessionId } = await requireSession();
  const sessions = await db.session.findMany({
    where: { userId: user.id, expiresAt: { gt: new Date() } },
    orderBy: { lastUsedAt: "desc" },
    select: { id: true, userAgent: true, ipPrefix: true, createdAt: true, lastUsedAt: true },
  });
  return json({
    sessions: sessions.map((s) => ({
      id: s.id,
      userAgent: s.userAgent,
      ipPrefix: s.ipPrefix,
      createdAt: s.createdAt.toISOString(),
      lastUsedAt: s.lastUsedAt.toISOString(),
      current: s.id === sessionId,
    })),
  });
});
