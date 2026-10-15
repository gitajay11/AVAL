import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { deleteObject } from "@/lib/r2";

const STALE_UPLOAD_MS = 60 * 60 * 1000;

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  const header = req.headers.get("authorization") ?? "";
  if (!secret) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const given = Buffer.from(header);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/**
 * Daily housekeeping (Vercel Cron, see vercel.json): deletes uploads that were
 * never confirmed, expired sessions, and spent email tokens.
 */
export async function GET(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const now = new Date();
  const stale = await db.attachment.findMany({
    where: { status: "PENDING", createdAt: { lt: new Date(now.getTime() - STALE_UPLOAD_MS) } },
    select: { id: true, objectKey: true },
    take: 500,
  });
  for (const a of stale) await deleteObject(a.objectKey);
  await db.attachment.deleteMany({ where: { id: { in: stale.map((a) => a.id) } } });

  const sessions = await db.session.deleteMany({ where: { expiresAt: { lt: now } } });
  const tokens = await db.emailToken.deleteMany({
    where: { OR: [{ expiresAt: { lt: now } }, { usedAt: { not: null } }] },
  });

  return NextResponse.json({ uploads: stale.length, sessions: sessions.count, tokens: tokens.count });
}
