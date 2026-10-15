import { after } from "next/server";
import { ApiError, clientIp, json, parseJson, route } from "@/lib/api";
import { consumeEmailToken } from "@/lib/auth/email-tokens";
import { hashPassword } from "@/lib/auth/password";
import { clearSessionCookie, revokeAllSessions } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { sendPasswordChangedEmail } from "@/lib/mail";
import { rateLimit } from "@/lib/security/rate-limit";
import { ResetPasswordSchema } from "@/lib/validation/auth";

/** Sets a new password and signs out every device. The user then signs in again. */
export const POST = route(async (req) => {
  await rateLimit("resetPassword", clientIp(req));
  const { token, password } = await parseJson(req, ResetPasswordSchema);

  const userId = await consumeEmailToken(token, "RESET_PASSWORD");
  if (!userId) throw new ApiError(400, "invalid_token", "This link is invalid or has expired.");

  const user = await db.user.update({
    where: { id: userId },
    // A working reset link proves control of the inbox, so it also verifies the email.
    data: { passwordHash: await hashPassword(password), emailVerifiedAt: new Date() },
    select: { email: true },
  });
  await revokeAllSessions(userId);
  after(() => sendPasswordChangedEmail(user.email).catch((err) => console.error("[reset] notice failed", err)));

  const res = json({ ok: true });
  clearSessionCookie(res);
  return res;
});
