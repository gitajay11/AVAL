import "server-only";
import { db } from "@/lib/db";
import { deleteObject } from "@/lib/r2";

/**
 * Delete attachment rows, then remove each R2 object that no other row still
 * references (forwarded messages share objects with the original).
 */
export async function deleteAttachments(where: { messageId?: string; ids?: string[] }) {
  const rows = await db.attachment.findMany({
    where: where.ids ? { id: { in: where.ids } } : { messageId: where.messageId },
    select: { id: true, objectKey: true },
  });
  if (rows.length === 0) return;
  await db.attachment.deleteMany({ where: { id: { in: rows.map((r) => r.id) } } });
  const keys = [...new Set(rows.map((r) => r.objectKey))];
  const stillUsed = new Set(
    (await db.attachment.findMany({ where: { objectKey: { in: keys } }, select: { objectKey: true } })).map((r) => r.objectKey),
  );
  await Promise.all(keys.filter((k) => !stillUsed.has(k)).map(deleteObject));
}
