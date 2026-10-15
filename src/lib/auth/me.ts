import "server-only";
import { db } from "@/lib/db";
import { meSelect, toMe, type Me } from "@/lib/users";
import { requireUser } from "./session";

/** Full profile + settings of the signed-in user, for server-rendered pages. */
export async function getMe(): Promise<Me> {
  const user = await requireUser();
  const row = await db.user.findUniqueOrThrow({ where: { id: user.id }, select: meSelect });
  return toMe(row);
}
