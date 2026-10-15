import { after } from "next/server";
import { ApiError, json, parseJson, route } from "@/lib/api";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { requireSession, revokeAllSessions } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { sendPasswordChangedEmail } from "@/lib/mail";
import { rateLimit } from "@/lib/security/rate-limit";
import { ChangePasswordSchema } from "@/lib/validation/auth";

/** Change password; keeps this device signed in and signs out all others. */
export const POST = route(async (req) => {
  const { user, sessionId } = await requireSession();
  await rateLimit("changePassword", user.id);
  const { currentPassword, newPassword } = await parseJson(req, ChangePasswordSchema);

  const row = await db.user.findUniqueOrThrow({
    where: { id: user.id },
    select: { passwordHash: true, email: true },
  });
  if (!(await verifyPassword(row.passwordHash, currentPassword))) {
    throw new ApiError(400, "wrong_password", "Current password is incorrect.", {
      currentPassword: "Current password is incorrect",
    });
  }
  if (newPassword.toLowerCase() === user.username) {
    throw new ApiError(400, "weak_password", "Password can't be your username.", {
      newPassword: "Password can't be your username",
    });
  }

  await db.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(newPassword) } });
  await revokeAllSessions(user.id, sessionId);
  after(() => sendPasswordChangedEmail(row.email).catch((err) => console.error("[password] notice failed", err)));
  return json({ ok: true });
});
