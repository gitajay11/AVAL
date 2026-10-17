import "server-only";
import { db } from "@/lib/db";

/**
 * Private nicknames (contact_aliases): what `ownerId` calls other people.
 * Only ever shown to the owner; everyone else sees the real display name.
 */
export async function aliasMap(ownerId: string, targetIds: string[]): Promise<Map<string, string>> {
  const ids = [...new Set(targetIds)].filter((id) => id !== ownerId);
  if (!ids.length) return new Map();
  const rows = await db.contactAlias.findMany({
    where: { ownerId, targetUserId: { in: ids } },
    select: { targetUserId: true, alias: true },
  });
  return new Map(rows.map((r) => [r.targetUserId, r.alias]));
}

export async function getAlias(ownerId: string, targetUserId: string): Promise<string | null> {
  const row = await db.contactAlias.findUnique({
    where: { ownerId_targetUserId: { ownerId, targetUserId } },
    select: { alias: true },
  });
  return row?.alias ?? null;
}

/** Set (or with null, reset) my nickname for someone. */
export async function setAlias(ownerId: string, targetUserId: string, alias: string | null): Promise<void> {
  if (alias === null) {
    await db.contactAlias.deleteMany({ where: { ownerId, targetUserId } });
    return;
  }
  await db.contactAlias.upsert({
    where: { ownerId_targetUserId: { ownerId, targetUserId } },
    create: { ownerId, targetUserId, alias },
    update: { alias },
  });
}
