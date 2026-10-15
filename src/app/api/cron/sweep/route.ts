import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { deleteAttachments } from "@/lib/media/storage";

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
 * Daily housekeeping (Vercel Cron, see vercel.json): uploads that were never
 * confirmed or never sent, expired sessions, and spent email tokens.
 */
export async function GET(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const now = new Date();
  const cutoff = new Date(now.getTime() - STALE_UPLOAD_MS);
  const stale = await db.attachment.findMany({
    where: {
      createdAt: { lt: cutoff },
      OR: [
        { status: "PENDING" },
        // Confirmed chat uploads that were never attached to a message.
        { status: "READY", messageId: null, kind: { in: ["IMAGE", "VIDEO", "VOICE", "FILE"] } },
      ],
    },
    select: { id: true },
    take: 500,
  });
  await deleteAttachments({ ids: stale.map((a) => a.id) });

  const sessions = await db.session.deleteMany({ where: { expiresAt: { lt: now } } });
  const tokens = await db.emailToken.deleteMany({
    where: { OR: [{ expiresAt: { lt: now } }, { usedAt: { not: null } }] },
  });

  return NextResponse.json({ uploads: stale.length, sessions: sessions.count, tokens: tokens.count });
}
