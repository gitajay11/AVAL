import "server-only";
import { db } from "@/lib/db";
import type { NotificationDTO } from "./types";

export async function listNotifications(userId: string): Promise<{ notifications: NotificationDTO[]; unread: number }> {
  const [rows, unread] = await Promise.all([
    db.notification.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: { id: true, type: true, payload: true, readAt: true, createdAt: true },
    }),
    db.notification.count({ where: { userId, readAt: null } }),
  ]);
  // Requests decided, withdrawn or whose contact is gone/private are no longer actionable.
  const requestIds = rows
    .filter((r) => r.type === "ACCESS_REQUEST")
    .map((r) => (r.payload as NotificationDTO["payload"]).requestId)
    .filter((id): id is string => Boolean(id));
  const pending = new Set(
    (
      await db.contactAccessRequest.findMany({
        where: { id: { in: requestIds }, status: "PENDING", contact: { ownerId: userId, visibility: "PUBLIC" } },
        select: { id: true },
      })
    ).map((r) => r.id),
  );
  return {
    unread,
    notifications: rows.map((r) => {
      const payload = r.payload as NotificationDTO["payload"];
      return {
        id: r.id,
        type: r.type,
        payload,
        readAt: r.readAt?.toISOString() ?? null,
        createdAt: r.createdAt.toISOString(),
        ...(r.type === "ACCESS_REQUEST" ? { actionable: Boolean(payload.requestId && pending.has(payload.requestId)) } : {}),
      };
    }),
  };
}
