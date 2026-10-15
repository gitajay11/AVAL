import { json, route } from "@/lib/api";
import { sendVerification } from "@/lib/auth/email-tokens";
import { requireSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { rateLimit } from "@/lib/security/rate-limit";

export const POST = route(async () => {
  const { user } = await requireSession();
  await rateLimit("verifyEmailResend", user.id);
  const row = await db.user.findUniqueOrThrow({
    where: { id: user.id },
    select: { id: true, email: true, displayName: true, emailVerifiedAt: true },
  });
  if (!row.emailVerifiedAt) await sendVerification(row);
  return json({ ok: true, alreadyVerified: row.emailVerifiedAt !== null });
});
